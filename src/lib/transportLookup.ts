/**
 * Transport Infrastructure Lookup.
 *
 * Data sources (all public, free, no auth — geo.dot.gov ArcGIS FeatureServer):
 * - Airports: FAA airports dataset (13k+ features)
 * - Interstates: HPMS Interstate system (57k+ features)
 * - Ports: Major US ports (150 features)
 * - Railroads: North American Class 1 rail network (82k+ features)
 *
 * All queries use envelope (bbox) spatial filters with inSR=4326.
 */

import type {
  NearbyAirport,
  NearbyInterstate,
  NearbyPort,
  NearbyRailroad,
  TransportResult,
} from '../types/infrastructure';
import { geocodeAddress } from './infraLookup';
import { cachedFetch, TTL_INFRASTRUCTURE } from './requestCache';

// ── Endpoints ──────────────────────────────────────────────────────────────

const AIRPORTS_URL =
  'https://geo.dot.gov/server/rest/services/Hosted/Airports_/FeatureServer/0/query';
const INTERSTATES_URL =
  'https://geo.dot.gov/server/rest/services/Hosted/HPMS_Interstates/FeatureServer/0/query';
const PORTS_URL =
  'https://geo.dot.gov/server/rest/services/Hosted/Major_Ports/FeatureServer/0/query';
const RAILROADS_URL =
  'https://geo.dot.gov/server/rest/services/Hosted/North_American_Class_1_Rail/FeatureServer/0/query';

// ── Search radii (degrees latitude; ~1° ≈ 69 miles) ───────────────────────

const AIRPORT_RADIUS = 2.17;   // ~150 miles
const INTERSTATE_RADIUS = 1.45; // ~100 miles
const PORT_RADIUS = 3.62;      // ~250 miles
const RAILROAD_RADIUS = 1.45;  // ~100 miles

// ── Helpers ────────────────────────────────────────────────────────────────

function buildEnvelope(lat: number, lng: number, radiusDeg: number) {
  return `${lng - radiusDeg},${lat - radiusDeg},${lng + radiusDeg},${lat + radiusDeg}`;
}

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface ArcGISResponse {
  features?: Array<{
    attributes: Record<string, unknown>;
    geometry?: { x?: number; y?: number; paths?: number[][][] };
  }>;
}

async function queryArcGIS(
  baseUrl: string,
  lat: number,
  lng: number,
  radiusDeg: number,
  outFields: string,
  where = '1=1',
): Promise<ArcGISResponse> {
  const envelope = buildEnvelope(lat, lng, radiusDeg);
  const params = new URLSearchParams({
    where,
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields,
    returnGeometry: 'true',
    f: 'json',
  });
  const url = `${baseUrl}?${params}`;
  return cachedFetch<ArcGISResponse>(
    url,
    async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`ArcGIS query failed: ${res.status}`);
      return res.json();
    },
    TTL_INFRASTRUCTURE,
  );
}

// ── Query Functions ────────────────────────────────────────────────────────

async function queryAirports(lat: number, lng: number): Promise<NearbyAirport[]> {
  const data = await queryArcGIS(
    AIRPORTS_URL,
    lat,
    lng,
    AIRPORT_RADIUS,
    'fac_name,loc_id,fac_type,hub,city,state_name,elevation,commercial_ops',
    "fac_type='AIRPORT'",
  );
  if (!data.features) return [];

  return data.features
    .map((f) => {
      const a = f.attributes;
      const ptLat = f.geometry?.y ?? 0;
      const ptLng = f.geometry?.x ?? 0;
      return {
        name: String(a.fac_name ?? ''),
        locId: String(a.loc_id ?? ''),
        type: String(a.fac_type ?? ''),
        hub: String(a.hub ?? 'N'),
        city: String(a.city ?? ''),
        state: String(a.state_name ?? ''),
        elevation: Number(a.elevation ?? 0),
        commercialOps: Number(a.commercial_ops ?? 0),
        distanceMi: haversineMi(lat, lng, ptLat, ptLng),
        lat: ptLat,
        lng: ptLng,
      };
    })
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, 5);
}

async function queryInterstates(lat: number, lng: number): Promise<NearbyInterstate[]> {
  const data = await queryArcGIS(
    INTERSTATES_URL,
    lat,
    lng,
    INTERSTATE_RADIUS,
    'route_id,route_number,route_name',
  );
  if (!data.features) return [];

  // Deduplicate by route_number — pick the nearest segment
  const byRoute = new Map<string, NearbyInterstate>();

  for (const f of data.features) {
    const a = f.attributes;
    const routeNum = String(a.route_number ?? a.route_id ?? '');
    // Skip non-interstate routes (real interstates are numbered 1–999)
    const num = parseInt(routeNum, 10);
    if (isNaN(num) || num > 999) continue;
    // Estimate distance from nearest point on polyline
    let minDist = Infinity;
    if (f.geometry?.paths) {
      for (const path of f.geometry.paths) {
        for (const [pLng, pLat] of path) {
          const d = haversineMi(lat, lng, pLat, pLng);
          if (d < minDist) minDist = d;
        }
      }
    }
    if (minDist === Infinity) minDist = 0;

    const existing = byRoute.get(routeNum);
    if (!existing || minDist < existing.distanceMi) {
      byRoute.set(routeNum, {
        routeNumber: routeNum,
        routeName: String(a.route_name ?? `I-${routeNum}`),
        routeId: String(a.route_id ?? ''),
        distanceMi: Math.round(minDist * 10) / 10,
      });
    }
  }

  return Array.from(byRoute.values())
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, 5);
}

async function queryPorts(lat: number, lng: number): Promise<NearbyPort[]> {
  const data = await queryArcGIS(
    PORTS_URL,
    lat,
    lng,
    PORT_RADIUS,
    'port_name,total,imports,exports,domestic',
  );
  if (!data.features) return [];

  return data.features
    .map((f) => {
      const a = f.attributes;
      const ptLat = f.geometry?.y ?? 0;
      const ptLng = f.geometry?.x ?? 0;
      return {
        name: String(a.port_name ?? ''),
        totalTonnage: Number(a.total ?? 0),
        imports: Number(a.imports ?? 0),
        exports: Number(a.exports ?? 0),
        domestic: Number(a.domestic ?? 0),
        distanceMi: haversineMi(lat, lng, ptLat, ptLng),
        lat: ptLat,
        lng: ptLng,
      };
    })
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, 5);
}

async function queryRailroads(lat: number, lng: number): Promise<NearbyRailroad[]> {
  const data = await queryArcGIS(
    RAILROADS_URL,
    lat,
    lng,
    RAILROAD_RADIUS,
    'rrowner1,subdiv,tracks,passngr,stracnet',
  );
  if (!data.features) return [];

  // Deduplicate by owner+subdivision
  const byKey = new Map<string, NearbyRailroad>();

  for (const f of data.features) {
    const a = f.attributes;
    const owner = String(a.rrowner1 ?? '');
    const subdiv = String(a.subdiv ?? '');
    const key = `${owner}|${subdiv}`;

    let minDist = Infinity;
    if (f.geometry?.paths) {
      for (const path of f.geometry.paths) {
        for (const [pLng, pLat] of path) {
          const d = haversineMi(lat, lng, pLat, pLng);
          if (d < minDist) minDist = d;
        }
      }
    }
    if (minDist === Infinity) minDist = 0;

    const existing = byKey.get(key);
    if (!existing || minDist < existing.distanceMi) {
      byKey.set(key, {
        owner,
        subdivision: subdiv,
        tracks: Number(a.tracks ?? 0),
        passenger: String(a.passngr ?? 'N'),
        stracnet: String(a.stracnet ?? ''),
        distanceMi: Math.round(minDist * 10) / 10,
      });
    }
  }

  return Array.from(byKey.values())
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, 5);
}

// ── Main Lookup ────────────────────────────────────────────────────────────

export interface TransportLookupInput {
  coordinates?: string;
  address?: string;
}

export async function lookupTransport(
  input: TransportLookupInput,
): Promise<TransportResult> {
  let lat: number;
  let lng: number;

  if (input.coordinates) {
    const parts = input.coordinates.split(',').map((s) => parseFloat(s.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      lat = parts[0];
      lng = parts[1];
    } else {
      throw new Error('Invalid coordinates format');
    }
  } else if (input.address) {
    const geo = await geocodeAddress(input.address);
    lat = geo.lat;
    lng = geo.lng;
  } else {
    throw new Error('Coordinates or address required');
  }

  const [airports, interstates, ports, railroads] = await Promise.all([
    queryAirports(lat, lng),
    queryInterstates(lat, lng),
    queryPorts(lat, lng),
    queryRailroads(lat, lng),
  ]);

  return {
    airports,
    interstates,
    ports,
    railroads,
    lastAnalyzedAt: Date.now(),
  };
}
