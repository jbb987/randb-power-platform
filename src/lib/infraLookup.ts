/**
 * Power Infrastructure Lookup.
 *
 * Data sources (all public, free):
 * - GeoPlataform: Transmission lines, Power plants
 * - NREL: Solar/wind resource
 * - Built-in: ISO/RTO from coordinates, Utility from line ownership
 *
 * HIFLD (DHS) was shut down Aug 2025. Substations now come from a
 * public ArcGIS mirror with the same schema (75 k+ national records).
 * When NASA NCCS or EIA Atlas come back online, territory lookups
 * can be upgraded to API-based.
 */

import type {
  NearbySubstation,
  NearbyLine,
  NearbyPowerPlant,
  SolarWindResource,
  ElectricityPrice,
} from '../types';
import { detectStateFromCoords } from './solarAverages';
import { getStateElectricityAverage } from './electricityAverages';
import { cachedFetch, TTL_LOCATION, TTL_INFRASTRUCTURE } from './requestCache';
import { fetchElectricityPrices, fetchStateGenerationByFuel } from './eiaApi';
import { getStateGenerationFallback } from './stateGenerationAverages';

export interface InfraResult {
  iso: string[];
  utilityTerritory: string[];
  tsp: string[];
  nearestPoiName: string;
  nearestPoiDistMi: number;
  nearbySubstations: NearbySubstation[];
  nearbyLines: NearbyLine[];
  nearbyPowerPlants: NearbyPowerPlant[];
  floodZone: null;
  solarWind: SolarWindResource | null;
  electricityPrice: ElectricityPrice | null;
  stateGenerationByFuel: Record<string, number> | null;
  detectedState: string | null;
  linesError: string | null;
  plantsError: string | null;
  solarError: string | null;
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
const NREL_API_KEY = import.meta.env.VITE_NREL_API_KEY || 'DEMO_KEY';

const LAT_OFFSET = 0.145; // ~10 miles
const PLANT_LAT_OFFSET = 1.087; // ~75 miles — power plants screen a wider area to capture deliverable generation in the same load pocket

// ── ISO/RTO from coordinates ────────────────────────────────────────────────
// There are only 7 ISOs + 2 non-ISO regions in the continental US.
// Simple coordinate-based lookup is ~95%+ accurate for due diligence screening.

interface IsoRegion {
  name: string;
  /** Returns true if the point is inside this region. */
  contains: (lat: number, lng: number) => boolean;
}

const ISO_REGIONS: IsoRegion[] = [
  {
    // ERCOT covers most of Texas (excluding panhandle, El Paso, east TX border)
    name: 'ERCOT',
    contains: (lat, lng) =>
      lat >= 26 && lat <= 34.5 && lng >= -104 && lng <= -94 &&
      // Exclude El Paso area
      !(lng < -104.5) &&
      // Exclude Texas panhandle (above ~34° and west of -100°)
      !(lat > 34 && lng < -100) &&
      // Rough eastern TX: ERCOT boundary cuts in around Texarkana
      !(lat > 33 && lng > -94.5),
  },
  {
    // CAISO covers most of California
    name: 'CAISO',
    contains: (lat, lng) =>
      lat >= 32.5 && lat <= 42 && lng >= -124.5 && lng <= -114.5 &&
      // Rough CA shape — exclude Nevada side
      lng < -115.5,
  },
  {
    // NYISO covers New York state
    name: 'NYISO',
    contains: (lat, lng) =>
      lat >= 40.5 && lat <= 45.1 && lng >= -79.8 && lng <= -71.8,
  },
  {
    // ISO-NE covers New England (CT, MA, ME, NH, RI, VT)
    name: 'ISO-NE',
    contains: (lat, lng) =>
      lat >= 41 && lat <= 47.5 && lng >= -73.7 && lng <= -66.9,
  },
  {
    // PJM covers Mid-Atlantic + Ohio Valley
    // DE, DC, IL (partial), IN (partial), KY (partial), MD, MI (partial),
    // NJ, NC (partial), OH, PA, TN (partial), VA, WV
    name: 'PJM',
    contains: (lat, lng) =>
      lat >= 36 && lat <= 42.5 && lng >= -85.5 && lng <= -74 &&
      // Exclude NY
      !(lat > 40.5 && lng > -74.5 && lng < -71.8),
  },
  {
    // MISO covers Midwest + Louisiana/Mississippi
    // Spans from Montana to Louisiana
    name: 'MISO',
    contains: (lat, lng) =>
      (
        // Northern MISO: Upper Midwest
        (lat >= 37 && lat <= 49 && lng >= -104 && lng <= -82.5) ||
        // Southern MISO: Louisiana, Mississippi, parts of AR/TX
        (lat >= 29 && lat < 37 && lng >= -97 && lng <= -88)
      ) &&
      // Exclude PJM overlap
      !(lat >= 36 && lat <= 42.5 && lng >= -85.5 && lng <= -74) &&
      // Exclude ERCOT Texas
      !(lat >= 26 && lat <= 34.5 && lng >= -104 && lng <= -94),
  },
  {
    // SPP covers Kansas, Oklahoma, parts of surrounding states
    name: 'SPP',
    contains: (lat, lng) =>
      lat >= 33 && lat <= 43 && lng >= -104 && lng <= -93 &&
      // Exclude ERCOT Texas
      !(lat < 34 && lng > -100) &&
      // Exclude MISO overlap in upper plains
      !(lat > 43),
  },
];

function detectIso(lat: number, lng: number): string {
  for (const region of ISO_REGIONS) {
    if (region.contains(lat, lng)) return region.name;
  }
  // Default for western US outside CAISO
  if (lng < -104) return 'WECC';
  // Default for southeast
  if (lat < 37 && lng > -90) return 'SERC';
  return '';
}

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

function envelope(lat: number, lng: number): string {
  const lo = lngOffset(lat);
  return `${lng - lo},${lat - LAT_OFFSET},${lng + lo},${lat + LAT_OFFSET}`;
}

function plantEnvelope(lat: number, lng: number): string {
  const lo = PLANT_LAT_OFFSET / Math.cos((lat * Math.PI) / 180) * Math.cos((30 * Math.PI) / 180);
  return `${lng - lo},${lat - PLANT_LAT_OFFSET},${lng + lo},${lat + PLANT_LAT_OFFSET}`;
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
  const key = `geocode:${address.trim().toLowerCase()}`;
  return cachedFetch(key, async () => {
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
  }, TTL_INFRASTRUCTURE);
}

// ── Queries ─────────────────────────────────────────────────────────────────

/** Raw line feature with geometry paths for substation coordinate extraction. */
interface LineFeature {
  line: NearbyLine;
  /** First point of the polyline path (approximate SUB_1 location) [lng, lat]. */
  startPt: [number, number] | null;
  /** Last point of the polyline path (approximate SUB_2 location) [lng, lat]. */
  endPt: [number, number] | null;
}

async function queryLinesWithGeometry(lat: number, lng: number): Promise<LineFeature[]> {
  const key = `infra:lines:${lat.toFixed(3)},${lng.toFixed(3)}`;
  return cachedFetch(key, async () => {
    const url =
      `${LAYERS.transmissionLines}/query?` +
      `where=1%3D1` +
      `&geometry=${encodeURIComponent(envelope(lat, lng))}` +
      `&geometryType=esriGeometryEnvelope` +
      `&spatialRel=esriSpatialRelIntersects` +
      `&inSR=4326&outSR=4326` +
      `&outFields=OWNER%2CVOLTAGE%2CVOLT_CLASS%2CSUB_1%2CSUB_2%2CSTATUS` +
      `&returnGeometry=true` +
      `&resultRecordCount=50` +
      `&f=json`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[infra] Transmission lines query HTTP ${res.status} for ${lat},${lng}`);
        return [];
      }
      const data = await res.json();
      if (data.error) {
        console.warn('[infra] Transmission lines query returned error:', data.error);
        return [];
      }
      return (data.features ?? [])
        .map((f: { attributes: Record<string, unknown>; geometry?: { paths?: number[][][] } }) => {
          const a = f.attributes;
          const paths = f.geometry?.paths;
          const firstPath = paths?.[0];
          const lastPath = paths?.[paths.length - 1];
          return {
            line: {
              owner: String(a.OWNER ?? ''),
              voltage: Number(a.VOLTAGE) || 0,
              voltClass: String(a.VOLT_CLASS ?? ''),
              sub1: String(a.SUB_1 ?? ''),
              sub2: String(a.SUB_2 ?? ''),
              status: String(a.STATUS ?? ''),
            } satisfies NearbyLine,
            startPt: firstPath?.[0] ? [firstPath[0][0], firstPath[0][1]] as [number, number] : null,
            endPt: lastPath
              ? [lastPath[lastPath.length - 1][0], lastPath[lastPath.length - 1][1]] as [number, number]
              : null,
          } satisfies LineFeature;
        })
        .sort((a: LineFeature, b: LineFeature) => b.line.voltage - a.line.voltage);
    } catch (err) {
      console.warn('[infra] Transmission lines fetch failed:', err);
      return [];
    }
  }, TTL_LOCATION);
}

async function queryPowerPlants(lat: number, lng: number): Promise<NearbyPowerPlant[]> {
  const key = `infra:plants:75mi:${lat.toFixed(3)},${lng.toFixed(3)}`;
  return cachedFetch(key, async () => {
    const url =
      `${LAYERS.powerPlants}/query?` +
      `where=1%3D1` +
      `&geometry=${encodeURIComponent(plantEnvelope(lat, lng))}` +
      `&geometryType=esriGeometryEnvelope` +
      `&spatialRel=esriSpatialRelIntersects` +
      `&inSR=4326` +
      `&outFields=Plant_Name%2CPrimSource%2CInstall_MW%2CTotal_MW%2CUtility_Na%2CLatitude%2CLongitude` +
      `&returnGeometry=false` +
      `&resultRecordCount=100` +
      `&f=json`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[infra] Power plants query HTTP ${res.status} for ${lat},${lng}`);
        return [];
      }
      const data = await res.json();
      if (data.error) {
        console.warn('[infra] Power plants query returned error:', data.error);
        return [];
      }
      return (data.features ?? [])
        .map((f: { attributes: Record<string, unknown> }) => {
          const a = f.attributes;
          const pLat = Number(a.Latitude) || 0;
          const pLng = Number(a.Longitude) || 0;
          return {
            name: String(a.Plant_Name ?? ''),
            operator: String(a.Utility_Na ?? ''),
            primarySource: String(a.PrimSource ?? ''),
            capacityMW: Number(a.Install_MW) || 0,
            status: 'OP',
            distanceMi: haversineMi(lat, lng, pLat, pLng),
          } satisfies NearbyPowerPlant;
        })
        .sort((a: NearbyPowerPlant, b: NearbyPowerPlant) => a.distanceMi - b.distanceMi);
    } catch (err) {
      console.warn('[infra] Power plants fetch failed:', err);
      return [];
    }
  }, TTL_LOCATION);
}

/**
 * Extract substations from transmission line geometry endpoints.
 * Each line has SUB_1 at the start of the polyline and SUB_2 at the end.
 * We average all endpoint coordinates for each named substation to get its location.
 */
function extractSubstations(
  features: LineFeature[],
  siteLat: number,
  siteLng: number,
): NearbySubstation[] {
  // Collect all coordinate samples for each substation name
  const subData = new Map<string, {
    coords: { lat: number; lng: number }[];
    voltages: number[];
    owners: string[];
    statuses: string[];
    lineCount: number;
  }>();

  for (const feat of features) {
    const entries: [string, [number, number] | null][] = [
      [feat.line.sub1, feat.startPt],
      [feat.line.sub2, feat.endPt],
    ];

    for (const [name, pt] of entries) {
      if (!name || name === 'NOT AVAILABLE') continue;

      let data = subData.get(name);
      if (!data) {
        data = { coords: [], voltages: [], owners: [], statuses: [], lineCount: 0 };
        subData.set(name, data);
      }
      data.lineCount++;
      if (feat.line.voltage > 0) data.voltages.push(feat.line.voltage);
      if (feat.line.owner && feat.line.owner !== 'NOT AVAILABLE') data.owners.push(feat.line.owner);
      if (feat.line.status) data.statuses.push(feat.line.status);
      // pt is [lng, lat] in ArcGIS format
      if (pt && pt[0] !== 0 && pt[1] !== 0) {
        data.coords.push({ lat: pt[1], lng: pt[0] });
      }
    }
  }

  const subs: NearbySubstation[] = [];

  for (const [name, data] of subData) {
    const maxVolt = data.voltages.length > 0 ? Math.max(...data.voltages) : 0;
    const owner = data.owners[0] ?? '';
    const status = data.statuses.includes('IN SERVICE') ? 'IN SERVICE' : (data.statuses[0] ?? '');

    // Average all coordinate samples for this substation
    let sLat = 0;
    let sLng = 0;
    if (data.coords.length > 0) {
      sLat = data.coords.reduce((s, c) => s + c.lat, 0) / data.coords.length;
      sLng = data.coords.reduce((s, c) => s + c.lng, 0) / data.coords.length;
    }

    const distanceMi = sLat && sLng ? haversineMi(siteLat, siteLng, sLat, sLng) : 0;

    subs.push({
      name,
      owner,
      maxVolt,
      minVolt: 0,
      status,
      lines: data.lineCount,
      distanceMi,
      lat: sLat,
      lng: sLng,
    });
  }

  // Sort: real distances first, then 0-distance at end
  return subs.sort((a, b) => {
    if (a.distanceMi === 0 && b.distanceMi > 0) return 1;
    if (b.distanceMi === 0 && a.distanceMi > 0) return -1;
    return a.distanceMi - b.distanceMi || b.maxVolt - a.maxVolt;
  });
}

// ── Merge line-derived + HIFLD substations ─────────────────────────────────

/**
 * Check if two substation names refer to the same facility.
 * Matches on exact name, or same UNKNOWN ID, or one name contains the other.
 */
function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return true;
  // Partial match: "MINES ROAD" matches "MINES ROAD SUBSTATION"
  if (la.includes(lb) || lb.includes(la)) return true;
  return false;
}

/**
 * Merge substations from two sources:
 * - Line-derived: better names, owners, and coverage
 * - HIFLD: more precise coordinates, min voltage data
 *
 * Only merges when names match (same ID or similar name).
 * Otherwise both are shown — better to show a duplicate than hide a real substation.
 */
function mergeSubstations(
  lineDerived: NearbySubstation[],
  hifld: NearbySubstation[],
  siteLat: number,
  siteLng: number,
): NearbySubstation[] {
  if (hifld.length === 0) return lineDerived;
  if (lineDerived.length === 0) return hifld;

  const merged = lineDerived.map((s) => ({ ...s }));
  const matchedHifldIndices = new Set<number>();

  for (let hi = 0; hi < hifld.length; hi++) {
    const h = hifld[hi];

    // Find a line-derived substation with a matching name
    const matchIdx = merged.findIndex((l) => namesMatch(l.name, h.name));

    if (matchIdx >= 0) {
      const target = merged[matchIdx];

      // Name: keep the longer/more descriptive one
      if (h.name.length > target.name.length && !h.name.startsWith('UNKNOWN')) {
        target.name = h.name;
      }

      // Owner: keep line-derived (usually more complete)
      if (!target.owner && h.owner) {
        target.owner = h.owner;
      }

      // Coordinates: upgrade to HIFLD surveyed location if available
      if (h.lat && h.lng) {
        target.lat = h.lat;
        target.lng = h.lng;
      }

      // Voltage: take the best from both
      target.maxVolt = Math.max(target.maxVolt, h.maxVolt);
      if (h.minVolt > 0 && (target.minVolt === 0 || h.minVolt < target.minVolt)) {
        target.minVolt = h.minVolt;
      }

      // Lines: take the higher count
      target.lines = Math.max(target.lines, h.lines);

      matchedHifldIndices.add(hi);
    }
  }

  // Append unmatched HIFLD substations — they're distinct facilities
  for (let hi = 0; hi < hifld.length; hi++) {
    if (!matchedHifldIndices.has(hi)) {
      merged.push(hifld[hi]);
    }
  }

  // Recalculate distances from site (coordinates may have changed from merge)
  for (const s of merged) {
    if (s.lat && s.lng) {
      s.distanceMi = haversineMi(siteLat, siteLng, s.lat, s.lng);
    }
  }

  // Sort: real distances first, then by voltage descending
  return merged.sort((a, b) => {
    if (a.distanceMi === 0 && b.distanceMi > 0) return 1;
    if (b.distanceMi === 0 && a.distanceMi > 0) return -1;
    return a.distanceMi - b.distanceMi || b.maxVolt - a.maxVolt;
  });
}

// ── Substations (HIFLD mirror — original DHS endpoint shut down Aug 2025) ──

const HIFLD_SUBSTATIONS_URL =
  'https://services1.arcgis.com/PMShNXB1carltgVf/arcgis/rest/services/Electric_Substations/FeatureServer/0/query';

function getAttr(attrs: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (attrs[key] !== undefined) return attrs[key];
    if (attrs[key.toUpperCase()] !== undefined) return attrs[key.toUpperCase()];
    if (attrs[key.toLowerCase()] !== undefined) return attrs[key.toLowerCase()];
  }
  return undefined;
}

async function querySubstationsHIFLD(
  siteLat: number,
  siteLng: number,
): Promise<NearbySubstation[]> {
  const lo = lngOffset(siteLat);
  const south = siteLat - LAT_OFFSET;
  const north = siteLat + LAT_OFFSET;
  const west = siteLng - lo;
  const east = siteLng + lo;

  const cacheKey = `hifld:subs:${siteLat.toFixed(3)},${siteLng.toFixed(3)}`;

  const features = await cachedFetch(cacheKey, async () => {
    // Strategy 1: WHERE clause with lat/lon range
    const whereUrl =
      `${HIFLD_SUBSTATIONS_URL}?` +
      `where=LATITUDE >= ${south} AND LATITUDE <= ${north} AND LONGITUDE >= ${west} AND LONGITUDE <= ${east}` +
      `&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=200&f=json`;

    try {
      const res = await fetch(whereUrl);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.features) && data.features.length > 0) return data.features;
      } else {
        console.warn(`[infra] HIFLD substations WHERE query HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('[infra] HIFLD substations WHERE query failed, falling back to envelope:', err);
    }

    // Strategy 2: Geometry envelope
    const envUrl =
      `${HIFLD_SUBSTATIONS_URL}?` +
      `where=1%3D1` +
      `&geometry=${west},${south},${east},${north}` +
      `&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects` +
      `&inSR=4326&outSR=4326&outFields=*&returnGeometry=true&resultRecordCount=200&f=json`;

    try {
      const res2 = await fetch(envUrl);
      if (!res2.ok) {
        console.warn(`[infra] HIFLD substations envelope query HTTP ${res2.status} for ${siteLat},${siteLng}`);
        return [];
      }
      const data2 = await res2.json();
      return Array.isArray(data2?.features) ? data2.features : [];
    } catch (err) {
      console.warn('[infra] HIFLD substations envelope fetch failed:', err);
      return [];
    }
  }, TTL_LOCATION);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subs: NearbySubstation[] = [];
  for (const feat of features) {
    const attrs = feat.attributes ?? {};
    const geom = feat.geometry;

    const name = String(getAttr(attrs, 'NAME', 'Name', 'name') ?? '').trim();
    if (!name || name === 'NOT AVAILABLE') continue;

    let lat = geom?.y ?? Number(getAttr(attrs, 'LATITUDE', 'Latitude', 'LAT') ?? 0);
    let lng = geom?.x ?? Number(getAttr(attrs, 'LONGITUDE', 'Longitude', 'LONG', 'LON') ?? 0);
    if (lat === -999999 || lng === -999999 || (!lat && !lng)) continue;
    // ArcGIS sometimes swaps lat/lng — sanity check
    if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) [lat, lng] = [lng, lat];

    const maxVolt = Number(getAttr(attrs, 'MAX_VOLT', 'Max_Volt') ?? 0);
    const minVolt = Number(getAttr(attrs, 'MIN_VOLT', 'Min_Volt') ?? 0);
    const status = String(getAttr(attrs, 'STATUS', 'Status') ?? 'IN SERVICE');
    const lineCount = Number(getAttr(attrs, 'LINES', 'Lines') ?? 0);
    const owner = String(getAttr(attrs, 'OWNER', 'Owner') ?? '');

    const distanceMi = haversineMi(siteLat, siteLng, lat, lng);

    subs.push({
      name,
      owner,
      maxVolt,
      minVolt,
      status,
      lines: lineCount,
      distanceMi,
      lat,
      lng,
    });
  }

  return subs.sort((a, b) => a.distanceMi - b.distanceMi || b.maxVolt - a.maxVolt);
}

/** Derive utility territory from most common line/substation owners. */
function deriveUtility(lines: NearbyLine[]): string[] {
  const counts = new Map<string, number>();
  for (const line of lines) {
    if (!line.owner || line.owner === 'NOT AVAILABLE') continue;
    counts.set(line.owner, (counts.get(line.owner) ?? 0) + 1);
  }
  // Sort by frequency, return top owners
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}

async function querySolarWind(lat: number, lng: number): Promise<SolarWindResource | null> {
  const key = `nrel:solar:${lat.toFixed(3)},${lng.toFixed(3)}`;
  return cachedFetch(key, async () => {
    try {
      const params = new URLSearchParams({
        api_key: NREL_API_KEY,
        lat: String(lat),
        lon: String(lng),
      });
      const res = await fetch(`${NREL_SOLAR_URL}?${params}`);
      if (!res.ok) {
        console.warn(`NREL Solar API returned ${res.status}. ${NREL_API_KEY === 'DEMO_KEY' ? 'Using DEMO_KEY — set VITE_NREL_API_KEY env var for higher rate limits.' : `NREL API error (status ${res.status}) — check your API key or retry later.`}`);
        return null;
      }
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
  }, TTL_INFRASTRUCTURE);
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

  const detectedState = await detectStateFromCoords(lat, lng);

  const results = await Promise.allSettled([
    queryLinesWithGeometry(lat, lng),
    queryPowerPlants(lat, lng),
    querySolarWind(lat, lng),
    detectedState ? fetchElectricityPrices(detectedState) : Promise.resolve(null),
    querySubstationsHIFLD(lat, lng),
    detectedState ? fetchStateGenerationByFuel(detectedState) : Promise.resolve(null),
  ]);

  function errMsg(r: PromiseSettledResult<unknown>, fallback: string): string | null {
    return r.status === 'rejected'
      ? (r.reason instanceof Error ? r.reason.message : fallback)
      : null;
  }

  const lineFeatures = results[0].status === 'fulfilled' ? results[0].value : [];
  const powerPlants = results[1].status === 'fulfilled' ? results[1].value : [];
  const solarWind = results[2].status === 'fulfilled' ? results[2].value : null;
  const liveElecPrice = results[3].status === 'fulfilled' ? results[3].value : null;
  const hifldSubstations = results[4].status === 'fulfilled' ? results[4].value : [];
  const stateGenResult = results[5].status === 'fulfilled' ? results[5].value : null;

  const lines = lineFeatures.map((f) => f.line);
  // Merge both substation sources for best coverage and accuracy
  const lineSubstations = extractSubstations(lineFeatures, lat, lng);
  const substations = mergeSubstations(lineSubstations, hifldSubstations, lat, lng);
  const nearest = substations.find((s) => s.distanceMi > 0) ?? substations[0];
  const iso = detectIso(lat, lng);
  const utilities = deriveUtility(lines);

  return {
    iso: iso ? [iso] : [],
    utilityTerritory: utilities,
    tsp: utilities.slice(0, 1), // Primary TSP = dominant line owner
    nearestPoiName: nearest?.name ?? '',
    nearestPoiDistMi: nearest?.distanceMi ?? 0,
    nearbySubstations: substations,
    nearbyLines: lines,
    nearbyPowerPlants: powerPlants,
    floodZone: null,
    solarWind,
    electricityPrice: liveElecPrice
      ? { commercial: liveElecPrice.commercial, industrial: liveElecPrice.industrial, allSectors: liveElecPrice.allSectors }
      : (() => {
          const avg = getStateElectricityAverage(detectedState);
          return avg ? { commercial: avg.commercial, industrial: avg.industrial, allSectors: avg.allSectors } : null;
        })(),
    stateGenerationByFuel: stateGenResult?.generationBySource ?? getStateGenerationFallback(detectedState),
    detectedState,
    linesError: errMsg(results[0], 'Transmission lines lookup failed'),
    plantsError: errMsg(results[1], 'Power plants lookup failed'),
    solarError: errMsg(results[2], 'Solar/wind resource lookup failed'),
  };
}
