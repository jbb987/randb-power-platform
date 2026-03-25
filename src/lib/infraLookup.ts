/**
 * Power Infrastructure Lookup via HIFLD ArcGIS FeatureServer + FEMA + NREL.
 *
 * Flow: address or coordinates → geocode (if needed) → 8 parallel queries
 * across 4 public data sources → full InfraResult.
 *
 * All endpoints are public / no API key required.
 */

import type {
  NearbySubstation,
  NearbyLine,
  NearbyPowerPlant,
  FloodZoneInfo,
  SolarWindResource,
} from '../types';

// ── Result type ─────────────────────────────────────────────────────────────

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

// ── HIFLD layer endpoints ───────────────────────────────────────────────────

const HIFLD_BASE =
  'https://services1.arcgis.com/Hp6G80Pky0om6HgA/arcgis/rest/services';

const LAYERS = {
  controlAreas: `${HIFLD_BASE}/Control_Areas/FeatureServer/0`,
  retailTerritories: `${HIFLD_BASE}/Electric_Retail_Service_Territories_2/FeatureServer/0`,
  planningAreas: `${HIFLD_BASE}/Electric_Planning_Areas/FeatureServer/0`,
  substations: `${HIFLD_BASE}/Electric_Substations/FeatureServer/0`,
  transmissionLines: `${HIFLD_BASE}/Electric_Power_Transmission_Lines/FeatureServer/0`,
  powerPlants: `${HIFLD_BASE}/Power_Plants/FeatureServer/0`,
} as const;

// ── Other data sources ──────────────────────────────────────────────────────

const GEOCODE_URL =
  'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

// ArcGIS-hosted FEMA flood hazard layer (supports CORS, unlike hazards.fema.gov)
const FEMA_NFHL_URL =
  'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set/FeatureServer/0';

const NREL_SOLAR_URL =
  'https://developer.nrel.gov/api/solar/solar_resource/v1.json';

// NREL demo key — works for low-volume usage. Replace with your own for production.
const NREL_API_KEY = 'DEMO_KEY';

// 10-mile search radius
const SEARCH_RADIUS_MI = 10;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Haversine distance in miles between two lat/lng points. */
function haversineMi(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
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

/**
 * Build a bounding box envelope for ArcGIS queries.
 * Format: "xmin,ymin,xmax,ymax" (simple comma-separated).
 */
function buildEnvelope(lat: number, lng: number, radiusMi: number): string {
  const latDeg = radiusMi / 69;
  const lngDeg = radiusMi / (69 * Math.cos((lat * Math.PI) / 180));
  return `${lng - lngDeg},${lat - latDeg},${lng + lngDeg},${lat + latDeg}`;
}

/** Geocode an address string → { lat, lng }. */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number }> {
  const params = new URLSearchParams({
    singleLine: address,
    outFields: 'Match_addr',
    maxLocations: '1',
    f: 'json',
  });

  const res = await fetch(`${GEOCODE_URL}?${params}`);
  if (!res.ok) throw new Error(`Geocode request failed (${res.status})`);

  const data = await res.json();
  const candidates = data.candidates;
  if (!candidates?.length) {
    throw new Error('Address could not be geocoded — check the address and try again.');
  }

  const { x: lng, y: lat } = candidates[0].location;
  return { lat, lng };
}

// ── Layer queries ───────────────────────────────────────────────────────────

/** Point-in-polygon query → array of NAME values (handles overlapping territories). */
async function queryPolygonLayer(
  label: string, layerUrl: string, lat: number, lng: number,
): Promise<string[]> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: 'NAME',
    returnGeometry: 'false',
    f: 'json',
  });

  try {
    const res = await fetch(`${layerUrl}/query?${params}`);
    if (!res.ok) { console.warn(`[Infra] ${label} query failed:`, res.status); return []; }

    const data = await res.json();
    const features: { attributes: { NAME: string } }[] = data.features ?? [];
    console.log(`[Infra] ${label}: ${features.length} feature(s)`);
    return features.map((f) => f.attributes.NAME).filter(Boolean);
  } catch (err) {
    console.warn(`[Infra] ${label} error:`, err);
    return [];
  }
}

/** Radius query for substations within ~10 miles using envelope geometry. */
async function querySubstations(
  lat: number, lng: number,
): Promise<NearbySubstation[]> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: buildEnvelope(lat, lng, SEARCH_RADIUS_MI),
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: 'NAME,OWNER,MAX_VOLT,MIN_VOLT,STATUS,LINES,LATITUDE,LONGITUDE',
    returnGeometry: 'false',
    f: 'json',
  });

  try {
    const url = `${LAYERS.substations}/query?${params}`;
    console.log('[Infra] Substations URL:', url);
    const res = await fetch(url);
    if (!res.ok) { console.warn('[Infra] Substations query failed:', res.status); return []; }

    const data = await res.json();
    if (data.error) { console.warn('[Infra] Substations API error:', data.error); return []; }
    const features: { attributes: Record<string, unknown> }[] = data.features ?? [];
    console.log(`[Infra] Substations: ${features.length} feature(s)`, features.length > 0 ? features[0].attributes : '(empty)');

    return features
      .map((f) => {
        const a = f.attributes;
        const sLat = Number(a.LATITUDE) || 0;
        const sLng = Number(a.LONGITUDE) || 0;
        return {
          name: String(a.NAME ?? ''),
          owner: String(a.OWNER ?? ''),
          maxVolt: Number(a.MAX_VOLT) || 0,
          minVolt: Number(a.MIN_VOLT) || 0,
          status: String(a.STATUS ?? ''),
          lines: Number(a.LINES) || 0,
          distanceMi: haversineMi(lat, lng, sLat, sLng),
          lat: sLat,
          lng: sLng,
        } satisfies NearbySubstation;
      })
      .filter((s) => s.distanceMi <= SEARCH_RADIUS_MI) // envelope is a square; filter to actual radius
      .sort((a, b) => a.distanceMi - b.distanceMi);
  } catch (err) {
    console.warn('[Infra] Substations error:', err);
    return [];
  }
}

/** Radius query for transmission lines within ~10 miles using envelope geometry. */
async function queryTransmissionLines(
  lat: number, lng: number,
): Promise<NearbyLine[]> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: buildEnvelope(lat, lng, SEARCH_RADIUS_MI),
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: 'OWNER,VOLTAGE,VOLT_CLASS,SUB_1,SUB_2,STATUS',
    returnGeometry: 'false',
    f: 'json',
    resultRecordCount: '50',
  });

  try {
    const url = `${LAYERS.transmissionLines}/query?${params}`;
    console.log('[Infra] Lines URL:', url);
    const res = await fetch(url);
    if (!res.ok) { console.warn('[Infra] Lines query failed:', res.status); return []; }

    const data = await res.json();
    if (data.error) { console.warn('[Infra] Lines API error:', data.error); return []; }
    const features: { attributes: Record<string, unknown> }[] = data.features ?? [];
    console.log(`[Infra] Lines: ${features.length} feature(s)`, features.length > 0 ? features[0].attributes : '(empty)');

    return features
      .map((f) => {
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
      .sort((a, b) => b.voltage - a.voltage);
  } catch (err) {
    console.warn('[Infra] Lines error:', err);
    return [];
  }
}

/** Radius query for power plants within ~10 miles using envelope geometry. */
async function queryPowerPlants(
  lat: number, lng: number,
): Promise<NearbyPowerPlant[]> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: buildEnvelope(lat, lng, SEARCH_RADIUS_MI),
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: 'PLANT_NAME,PRIMESOURC,INSTALL_MW,STATUS,OPERATOR,LATITUDE,LONGITUDE',
    returnGeometry: 'false',
    f: 'json',
  });

  try {
    const url = `${LAYERS.powerPlants}/query?${params}`;
    console.log('[Infra] Power Plants URL:', url);
    const res = await fetch(url);
    if (!res.ok) { console.warn('[Infra] Power Plants query failed:', res.status); return []; }

    const data = await res.json();
    if (data.error) { console.warn('[Infra] Power Plants API error:', data.error); return []; }
    const features: { attributes: Record<string, unknown> }[] = data.features ?? [];
    console.log(`[Infra] Power Plants: ${features.length} feature(s)`, features.length > 0 ? features[0].attributes : '(empty)');

    return features
      .map((f) => {
        const a = f.attributes;
        const pLat = Number(a.LATITUDE) || 0;
        const pLng = Number(a.LONGITUDE) || 0;
        return {
          name: String(a.PLANT_NAME ?? ''),
          operator: String(a.OPERATOR ?? ''),
          primarySource: String(a.PRIMESOURC ?? ''),
          capacityMW: Number(a.INSTALL_MW) || 0,
          status: String(a.STATUS ?? ''),
          distanceMi: haversineMi(lat, lng, pLat, pLng),
        } satisfies NearbyPowerPlant;
      })
      .filter((p) => p.distanceMi <= SEARCH_RADIUS_MI)
      .sort((a, b) => a.distanceMi - b.distanceMi);
  } catch (err) {
    console.warn('[Infra] Power Plants error:', err);
    return [];
  }
}

/** FEMA flood zone query (point-in-polygon). */
async function queryFloodZone(
  lat: number, lng: number,
): Promise<FloodZoneInfo | null> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: 'FLD_ZONE,ZONE_SUBTY,FLOODWAY',
    returnGeometry: 'false',
    f: 'json',
  });

  try {
    const url = `${FEMA_NFHL_URL}/query?${params}`;
    console.log('[Infra] FEMA URL:', url);
    const res = await fetch(url);
    if (!res.ok) { console.warn('[Infra] FEMA query failed:', res.status); return null; }

    const data = await res.json();
    if (data.error) { console.warn('[Infra] FEMA API error:', data.error); return null; }
    const features: { attributes: Record<string, unknown> }[] = data.features ?? [];
    console.log(`[Infra] FEMA: ${features.length} feature(s)`);
    if (features.length === 0) return null;

    const a = features[0].attributes;
    return {
      zone: String(a.FLD_ZONE ?? ''),
      floodwayType: String(a.FLOODWAY ?? 'None'),
      panelNumber: String(a.ZONE_SUBTY ?? ''),
    };
  } catch (err) {
    console.warn('[Infra] FEMA error:', err);
    return null;
  }
}

/** NREL solar / wind resource query. */
async function querySolarWind(
  lat: number, lng: number,
): Promise<SolarWindResource | null> {
  const params = new URLSearchParams({
    api_key: NREL_API_KEY,
    lat: String(lat),
    lon: String(lng),
  });

  try {
    const res = await fetch(`${NREL_SOLAR_URL}?${params}`);
    if (!res.ok) return null;

    const data = await res.json();
    const outputs = data.outputs;
    if (!outputs) return null;

    return {
      ghi: Number(outputs.avg_ghi?.annual) || 0,
      dni: Number(outputs.avg_dni?.annual) || 0,
      windSpeed: Number(outputs.avg_wind_speed?.annual) || 0,
      capacity: Number(outputs.avg_lat_tilt?.annual) || 0,
    };
  } catch {
    return null;
  }
}

// ── Main lookup ─────────────────────────────────────────────────────────────

export interface LookupOptions {
  coordinates?: { lat: number; lng: number };
  address?: string;
}

export async function lookupInfrastructure(opts: LookupOptions): Promise<InfraResult> {
  let { lat, lng } = opts.coordinates ?? { lat: 0, lng: 0 };

  if (!opts.coordinates || (lat === 0 && lng === 0)) {
    if (!opts.address) {
      throw new Error('Provide an address or coordinates to look up infrastructure.');
    }
    ({ lat, lng } = await geocodeAddress(opts.address));
  }

  console.log(`[Infra] Running analysis for ${lat.toFixed(4)}, ${lng.toFixed(4)}`);

  // Fire all queries in parallel
  const [
    iso,
    utilityTerritory,
    tsp,
    substations,
    lines,
    powerPlants,
    floodZone,
    solarWind,
  ] = await Promise.all([
    queryPolygonLayer('ISO/RTO', LAYERS.controlAreas, lat, lng),
    queryPolygonLayer('Utility', LAYERS.retailTerritories, lat, lng),
    queryPolygonLayer('TSP', LAYERS.planningAreas, lat, lng),
    querySubstations(lat, lng),
    queryTransmissionLines(lat, lng),
    queryPowerPlants(lat, lng),
    queryFloodZone(lat, lng),
    querySolarWind(lat, lng),
  ]);

  const nearest = substations[0];

  console.log('[Infra] Analysis complete:', {
    iso, utilityTerritory, tsp,
    substations: substations.length,
    lines: lines.length,
    powerPlants: powerPlants.length,
    floodZone: floodZone?.zone ?? 'none',
    solarWind: solarWind ? 'yes' : 'none',
  });

  return {
    iso,
    utilityTerritory,
    tsp,
    nearestPoiName: nearest?.name ?? '',
    nearestPoiDistMi: nearest?.distanceMi ?? 0,
    nearbySubstations: substations,
    nearbyLines: lines,
    nearbyPowerPlants: powerPlants,
    floodZone,
    solarWind,
  };
}
