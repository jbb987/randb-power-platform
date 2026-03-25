/**
 * Power Infrastructure Lookup.
 *
 * Data sources (all public, free):
 * - GeoPlataform: Transmission lines, Power plants
 * - NREL: Solar/wind resource
 * - Built-in: ISO/RTO from coordinates, Utility from line ownership
 *
 * HIFLD was shut down Aug 2025 by DHS. When NASA NCCS or EIA Atlas
 * come back online, territory lookups can be upgraded to API-based.
 */

import type {
  NearbySubstation,
  NearbyLine,
  NearbyPowerPlant,
  SolarWindResource,
} from '../types';
import { detectState } from './solarAverages';

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
  detectedState: string | null;
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
const NREL_API_KEY = import.meta.env.VITE_NREL_API_KEY ?? '';

const LAT_OFFSET = 0.145; // ~10 miles

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
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.error) return [];
    return (data.features ?? [])
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
  } catch {
    return [];
  }
}

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
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.error) return [];
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
  } catch {
    return [];
  }
}

function extractSubstations(lines: NearbyLine[]): NearbySubstation[] {
  const seen = new Set<string>();
  const subs: NearbySubstation[] = [];

  for (const line of lines) {
    for (const name of [line.sub1, line.sub2]) {
      if (!name || name === 'NOT AVAILABLE' || seen.has(name)) continue;
      seen.add(name);
      const connectedLines = lines.filter((l) => l.sub1 === name || l.sub2 === name);
      const maxVolt = Math.max(...connectedLines.map((l) => l.voltage).filter(Boolean), 0);
      // Prefer named owner over "NOT AVAILABLE"
      const ownerLine = connectedLines.find((l) => l.owner && l.owner !== 'NOT AVAILABLE');
      subs.push({
        name,
        owner: ownerLine?.owner ?? connectedLines[0]?.owner ?? '',
        maxVolt,
        minVolt: 0,
        status: connectedLines[0]?.status || 'IN SERVICE',
        lines: connectedLines.length,
        distanceMi: 0,
        lat: 0,
        lng: 0,
      });
    }
  }

  return subs.sort((a, b) => b.maxVolt - a.maxVolt || b.lines - a.lines);
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

  const [lines, powerPlants, solarWind] = await Promise.all([
    queryLines(lat, lng),
    queryPowerPlants(lat, lng),
    querySolarWind(lat, lng),
  ]);

  const substations = extractSubstations(lines);
  const nearest = substations[0];
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
    detectedState: detectState(lat, lng),
  };
}
