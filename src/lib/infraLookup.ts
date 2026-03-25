/**
 * Power Infrastructure Lookup.
 *
 * Data sources (all public, no API keys except NREL demo key):
 * - GeoPlataform: Transmission lines, Power plants
 * - NREL: Solar/wind resource
 *
 * HIFLD was shut down Aug 2025. EIA Atlas is temporarily down.
 * When EIA comes back, we can add: Control Areas, Utility Territories, Planning Areas.
 * When NASA NCCS comes back, we can add: Substations with voltage/owner.
 */

import type {
  NearbySubstation,
  NearbyLine,
  NearbyPowerPlant,
  FloodZoneInfo,
  SolarWindResource,
} from '../types';

// ── Result ──────────────────────────────────────────────────────────────────

export interface InfraResult {
  iso: string[];
  utilityTerritory: string[];
  tsp: string[];
  nearestPoiName: string;
  nearestPoiDistMi: number;
  nearbySubstations: NearbySubstation[];
  nearbyLines: NearbyLine[];
  nearbyPowerPlants: NearbyPowerPlant[];
  floodZone: FloodZoneInfo | null;
  solarWind: SolarWindResource | null;
}

// ── Endpoints ───────────────────────────────────────────────────────────────

const GEOPLATFORM = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services';

const LAYERS = {
  transmissionLines: `${GEOPLATFORM}/US_Electric_Power_Transmission_Lines/FeatureServer/0`,
  powerPlants: `${GEOPLATFORM}/Power_Plants_in_the_US/FeatureServer/0`,
} as const;

const GEOCODE_URL =
  'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

const NREL_SOLAR_URL = 'https://developer.nrel.gov/api/solar/solar_resource/v1.json';
const NREL_API_KEY = 'DEMO_KEY';

// ~10 miles in degrees
const LAT_OFFSET = 0.145;

// ── Helpers ─────────────────────────────────────────────────────────────────

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lngOffset(lat: number): number {
  return LAT_OFFSET / Math.cos((lat * Math.PI) / 180) * Math.cos((30 * Math.PI) / 180);
}

/** Build envelope string: "xmin,ymin,xmax,ymax" */
function envelope(lat: number, lng: number): string {
  const lo = lngOffset(lat);
  return `${lng - lo},${lat - LAT_OFFSET},${lng + lo},${lat + LAT_OFFSET}`;
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
  const params = new URLSearchParams({
    singleLine: address,
    outFields: 'Match_addr',
    maxLocations: '1',
    f: 'json',
  });
  const res = await fetch(`${GEOCODE_URL}?${params}`);
  if (!res.ok) throw new Error(`Geocode request failed (${res.status})`);
  const data = await res.json();
  if (!data.candidates?.length) {
    throw new Error('Address could not be geocoded — check the address and try again.');
  }
  return { lat: data.candidates[0].location.y, lng: data.candidates[0].location.x };
}

// ── Queries ─────────────────────────────────────────────────────────────────

/** Transmission lines within ~10mi envelope. */
async function queryLines(lat: number, lng: number): Promise<NearbyLine[]> {
  const url =
    `${LAYERS.transmissionLines}/query?` +
    `where=1%3D1` +
    `&geometry=${encodeURIComponent(envelope(lat, lng))}` +
    `&geometryType=esriGeometryEnvelope` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&inSR=4326` +
    `&outFields=OWNER%2CVOLTAGE%2CVOLT_CLASS%2CSUB_1%2CSUB_2%2CSTATUS` +
    `&returnGeometry=false` +
    `&resultRecordCount=50` +
    `&f=json`;

  try {
    console.log('[Infra] Lines query...');
    const res = await fetch(url);
    if (!res.ok) { console.warn('[Infra] Lines HTTP', res.status); return []; }
    const data = await res.json();
    if (data.error) { console.warn('[Infra] Lines error:', data.error); return []; }
    const feats = data.features ?? [];
    console.log(`[Infra] Lines: ${feats.length} feature(s)`);
    return feats
      .map((f: { attributes: Record<string, unknown> }) => {
        const a = f.attributes;
        return {
          owner: String(a.OWNER ?? ''),
          voltage: Number(a.VOLTAGE) || 0,
          voltClass: String(a.VOLT_CLASS ?? ''),
          sub1: String(a.SUB_1 ?? ''),
          sub2: String(a.SUB_2 ?? ''),
          status: String(a.STATUS ?? ''),
        } satisfies NearbyLine;
      })
      .sort((a: NearbyLine, b: NearbyLine) => b.voltage - a.voltage);
  } catch (err) {
    console.warn('[Infra] Lines fetch error:', err);
    return [];
  }
}

/** Power plants within ~10mi envelope. */
async function queryPowerPlants(lat: number, lng: number): Promise<NearbyPowerPlant[]> {
  const url =
    `${LAYERS.powerPlants}/query?` +
    `where=1%3D1` +
    `&geometry=${encodeURIComponent(envelope(lat, lng))}` +
    `&geometryType=esriGeometryEnvelope` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&inSR=4326` +
    `&outFields=Plant_Name%2CPrimSource%2CInstall_MW%2CTotal_MW%2CUtility_Na%2CLatitude%2CLongitude` +
    `&returnGeometry=false` +
    `&resultRecordCount=25` +
    `&f=json`;

  try {
    console.log('[Infra] Plants query...');
    const res = await fetch(url);
    if (!res.ok) { console.warn('[Infra] Plants HTTP', res.status); return []; }
    const data = await res.json();
    if (data.error) { console.warn('[Infra] Plants error:', data.error); return []; }
    const feats = data.features ?? [];
    console.log(`[Infra] Plants: ${feats.length} feature(s)`);
    return feats
      .map((f: { attributes: Record<string, unknown> }) => {
        const a = f.attributes;
        const pLat = Number(a.Latitude) || 0;
        const pLng = Number(a.Longitude) || 0;
        return {
          name: String(a.Plant_Name ?? ''),
          operator: String(a.Utility_Na ?? ''),
          primarySource: String(a.PrimSource ?? ''),
          capacityMW: Number(a.Install_MW) || 0,
          status: 'OP', // EIA only lists operable plants
          distanceMi: haversineMi(lat, lng, pLat, pLng),
        } satisfies NearbyPowerPlant;
      })
      .sort((a: NearbyPowerPlant, b: NearbyPowerPlant) => a.distanceMi - b.distanceMi);
  } catch (err) {
    console.warn('[Infra] Plants fetch error:', err);
    return [];
  }
}

/** Extract unique substation names from transmission line endpoints. */
function extractSubstations(lines: NearbyLine[]): NearbySubstation[] {
  const seen = new Set<string>();
  const subs: NearbySubstation[] = [];

  for (const line of lines) {
    for (const name of [line.sub1, line.sub2]) {
      if (!name || name === 'NOT AVAILABLE' || seen.has(name)) continue;
      seen.add(name);
      subs.push({
        name,
        owner: line.owner,
        maxVolt: line.voltage,
        minVolt: 0,
        status: line.status || 'IN SERVICE',
        lines: lines.filter((l) => l.sub1 === name || l.sub2 === name).length,
        distanceMi: 0, // can't calculate without substation coordinates
        lat: 0,
        lng: 0,
      });
    }
  }

  // Sort by max voltage (highest first) then by number of connected lines
  return subs.sort((a, b) => b.maxVolt - a.maxVolt || b.lines - a.lines);
}

/** NREL solar/wind resource. */
async function querySolarWind(lat: number, lng: number): Promise<SolarWindResource | null> {
  try {
    const params = new URLSearchParams({
      api_key: NREL_API_KEY,
      lat: String(lat),
      lon: String(lng),
    });
    const res = await fetch(`${NREL_SOLAR_URL}?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const o = data.outputs;
    if (!o) return null;
    return {
      ghi: Number(o.avg_ghi?.annual) || 0,
      dni: Number(o.avg_dni?.annual) || 0,
      windSpeed: Number(o.avg_wind_speed?.annual) || 0,
      capacity: Number(o.avg_lat_tilt?.annual) || 0,
    };
  } catch {
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

export interface LookupOptions {
  coordinates?: { lat: number; lng: number };
  address?: string;
}

export async function lookupInfrastructure(opts: LookupOptions): Promise<InfraResult> {
  let { lat, lng } = opts.coordinates ?? { lat: 0, lng: 0 };

  if (!opts.coordinates || (lat === 0 && lng === 0)) {
    if (!opts.address) throw new Error('Provide an address or coordinates.');
    ({ lat, lng } = await geocodeAddress(opts.address));
  }

  console.log(`[Infra] Running analysis for ${lat.toFixed(4)}, ${lng.toFixed(4)}`);

  // Fire all queries in parallel
  const [lines, powerPlants, solarWind] = await Promise.all([
    queryLines(lat, lng),
    queryPowerPlants(lat, lng),
    querySolarWind(lat, lng),
  ]);

  // Derive substations from transmission line endpoints
  const substations = extractSubstations(lines);
  const nearest = substations[0];

  console.log('[Infra] Analysis complete:', {
    lines: lines.length,
    powerPlants: powerPlants.length,
    substations: substations.length,
    solarWind: solarWind ? 'yes' : 'none',
  });

  return {
    // Territory fields — manual entry until EIA Atlas comes back online
    iso: [],
    utilityTerritory: [],
    tsp: [],
    nearestPoiName: nearest?.name ?? '',
    nearestPoiDistMi: nearest?.distanceMi ?? 0,
    nearbySubstations: substations,
    nearbyLines: lines,
    nearbyPowerPlants: powerPlants,
    floodZone: null, // FEMA endpoint TBD
    solarWind,
  };
}
