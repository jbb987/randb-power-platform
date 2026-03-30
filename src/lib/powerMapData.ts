/**
 * Power Map Data — fetches power plants, transmission lines, and
 * substations for a given map bounding box from GeoPlataform ArcGIS
 * and HIFLD datasets.
 */

import { getCapacityFactor } from './eiaApi';

const GEOPLATFORM = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services';
const HIFLD = 'https://services.arcgis.com/G4S1dGvn7PIgYd6Y/ArcGIS/rest/services';

const LAYERS = {
  transmissionLines: `${GEOPLATFORM}/US_Electric_Power_Transmission_Lines/FeatureServer/0`,
  powerPlants: `${GEOPLATFORM}/Power_Plants_in_the_US/FeatureServer/0`,
  substations: `${HIFLD}/HIFLD_electric_power_substations/FeatureServer/0`,
} as const;

const PAGE_SIZE = 2000; // ArcGIS server-side max per request
const MAX_PAGES = 50; // Safety limit to prevent infinite pagination loops

// ── Status normalization ────────────────────────────────────────────────────

/** Normalize various status strings into our 3 categories. */
export function normalizeStatus(raw: string): 'active' | 'planned' | 'retired' {
  const s = raw.toLowerCase().trim();
  if (s.includes('retire') || s.includes('out of service') || s.includes('decommission') || s.includes('standby')) {
    return 'retired';
  }
  if (s.includes('plan') || s.includes('proposed') || s.includes('under construction') || s.includes('construct')) {
    return 'planned';
  }
  return 'active';
}

/** Status display labels */
export const STATUS_LABELS: Record<string, string> = {
  active: 'In Service',
  planned: 'Planned / Under Construction',
  retired: 'Retired',
};

/** Status colors for lines and non-availability features */
export const STATUS_COLORS = {
  active: '#201F1E',   // Black
  planned: '#EAB308',  // Yellow
  retired: '#9CA3AF',  // Grey
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface MapPowerPlant {
  name: string;
  operator: string;
  primarySource: string;
  capacityMW: number;
  totalMW: number;
  status: string; // 'active' | 'planned' | 'retired'
  lat: number;
  lng: number;
}

export interface MapTransmissionLine {
  owner: string;
  voltage: number;
  voltClass: string;
  sub1: string;
  sub2: string;
  status: string; // 'active' | 'planned' | 'retired'
  coordinates: [number, number][];
}

export interface MapSubstation {
  name: string;
  owner: string;
  status: string; // 'active' | 'planned' | 'retired'
  maxVolt: number;
  minVolt: number;
  lat: number;
  lng: number;
  lineCount: number;
  connectedCapacityMW: number;
  /** Net MW available at this substation (generation − demand) */
  availableMW: number;
  /** 0 = no capacity, 1 = 1–199 MW, 2 = 200+ MW */
  availabilityBin: number;
}

// ── Source normalization ─────────────────────────────────────────────────────

/**
 * Map verbose ArcGIS PrimSource values to our simplified category keys.
 * e.g. "Natural Gas Fired Combustion Turbine" → "Natural Gas"
 */
function normalizeSource(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('solar')) return 'Solar';
  if (s.includes('wind')) return 'Wind';
  if (s.includes('natural gas') || s.includes('ng ')) return 'Natural Gas';
  if (s.includes('coal')) return 'Coal';
  if (s.includes('nuclear')) return 'Nuclear';
  if (s.includes('hydro')) return 'Hydroelectric';
  if (s.includes('petroleum') || s.includes('distillate') || s.includes('oil')) return 'Petroleum';
  if (s.includes('biomass') || s.includes('wood') || s.includes('landfill') || s.includes('msw') || s.includes('waste')) return 'Biomass';
  if (s.includes('geothermal')) return 'Geothermal';
  return 'Other';
}

// ── Source colors ────────────────────────────────────────────────────────────

export const SOURCE_COLORS: Record<string, string> = {
  Solar: '#F59E0B',
  Wind: '#3B82F6',
  'Natural Gas': '#EF4444',
  Coal: '#6B7280',
  Nuclear: '#8B5CF6',
  Hydroelectric: '#06B6D4',
  Petroleum: '#78716C',
  Biomass: '#22C55E',
  Geothermal: '#F97316',
  Other: '#9CA3AF',
};

export function getSourceColor(source: string): string {
  return SOURCE_COLORS[source] ?? SOURCE_COLORS.Other;
}

/** Return effective average output in MW for a plant (nameplate × capacity factor). */
export function effectiveMW(
  plant: MapPowerPlant,
  stateCapacityFactors: Map<string, number> | null = null,
): number {
  const cf = getCapacityFactor(plant.primarySource, stateCapacityFactors);
  return plant.capacityMW * cf;
}

// ── Paginated fetching ───────────────────────────────────────────────────────

function bboxEnvelope(bounds: MapBounds): string {
  return `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
}

export async function fetchPowerPlants(
  bounds: MapBounds,
  signal?: AbortSignal,
): Promise<MapPowerPlant[]> {
  const allPlants: MapPowerPlant[] = [];
  let offset = 0;
  let pages = 0;

  while (pages < MAX_PAGES) {
    const url =
      `${LAYERS.powerPlants}/query?` +
      `where=1%3D1` +
      `&geometry=${encodeURIComponent(bboxEnvelope(bounds))}` +
      `&geometryType=esriGeometryEnvelope` +
      `&spatialRel=esriSpatialRelIntersects` +
      `&inSR=4326` +
      `&outFields=Plant_Name%2CPrimSource%2CInstall_MW%2CTotal_MW%2CUtility_Na%2CLatitude%2CLongitude` +
      `&returnGeometry=false` +
      `&resultRecordCount=${PAGE_SIZE}` +
      `&resultOffset=${offset}` +
      `&f=json`;

    const res = await fetch(url, { signal });
    if (!res.ok) {
      throw new Error(`Power plants fetch failed (HTTP ${res.status})`);
    }
    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message ?? 'ArcGIS query error (power plants)');
    }
    const features = data.features ?? [];

    for (const f of features) {
      const a = f.attributes as Record<string, unknown>;
      allPlants.push({
        name: String(a.Plant_Name ?? ''),
        operator: String(a.Utility_Na ?? ''),
        primarySource: normalizeSource(String(a.PrimSource ?? '')),
        capacityMW: Number(a.Install_MW) || 0,
        totalMW: Number(a.Total_MW) || Number(a.Install_MW) || 0,
        status: 'active', // This dataset only contains operable plants
        lat: Number(a.Latitude) || 0,
        lng: Number(a.Longitude) || 0,
      });
    }

    if (features.length < PAGE_SIZE) break; // last page
    offset += PAGE_SIZE;
    pages++;
  }

  return allPlants;
}

export async function fetchTransmissionLines(
  bounds: MapBounds,
  signal?: AbortSignal,
): Promise<MapTransmissionLine[]> {
  const allLines: MapTransmissionLine[] = [];
  let offset = 0;
  let pages = 0;

  while (pages < MAX_PAGES) {
    const url =
      `${LAYERS.transmissionLines}/query?` +
      `where=1%3D1` +
      `&geometry=${encodeURIComponent(bboxEnvelope(bounds))}` +
      `&geometryType=esriGeometryEnvelope` +
      `&spatialRel=esriSpatialRelIntersects` +
      `&inSR=4326&outSR=4326` +
      `&outFields=OWNER%2CVOLTAGE%2CVOLT_CLASS%2CSUB_1%2CSUB_2%2CSTATUS` +
      `&returnGeometry=true` +
      `&resultRecordCount=${PAGE_SIZE}` +
      `&resultOffset=${offset}` +
      `&f=json`;

    const res = await fetch(url, { signal });
    if (!res.ok) {
      throw new Error(`Transmission lines fetch failed (HTTP ${res.status})`);
    }
    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message ?? 'ArcGIS query error (transmission lines)');
    }
    const features = data.features ?? [];

    for (const f of features) {
      const a = f.attributes as Record<string, unknown>;
      const paths: number[][][] = f.geometry?.paths ?? [];

      const coords: [number, number][] = [];
      for (const path of paths) {
        for (const pt of path) {
          coords.push([pt[0], pt[1]]);
        }
      }

      allLines.push({
        owner: String(a.OWNER ?? ''),
        voltage: Number(a.VOLTAGE) || 0,
        voltClass: String(a.VOLT_CLASS ?? ''),
        sub1: String(a.SUB_1 ?? ''),
        sub2: String(a.SUB_2 ?? ''),
        status: normalizeStatus(String(a.STATUS ?? '')),
        coordinates: coords,
      });
    }

    if (features.length < PAGE_SIZE) break; // last page
    offset += PAGE_SIZE;
    pages++;
  }

  return allLines;
}

// ── Substations (HIFLD real data) ───────────────────────────────────────────

function parseSubstationFeature(f: {
  attributes: Record<string, unknown>;
  geometry?: { x?: number; y?: number };
}): MapSubstation | null {
  const a = f.attributes;
  const name = String(a.NAME ?? '');
  if (!name || name === 'NOT AVAILABLE') return null;

  // Try geometry first (point: x=lng, y=lat), fall back to attribute fields
  let lat = f.geometry?.y ?? Number(a.LATITUDE);
  let lng = f.geometry?.x ?? Number(a.LONGITUDE);
  if (!lat || !lng || lat === -999999 || lng === -999999) return null;

  return {
    name,
    owner: '',
    status: normalizeStatus(String(a.STATUS ?? '')),
    maxVolt: Number(a.MAX_VOLT) > 0 ? Number(a.MAX_VOLT) : 0,
    minVolt: Number(a.MIN_VOLT) > 0 ? Number(a.MIN_VOLT) : 0,
    lat,
    lng,
    lineCount: Number(a.LINES) > 0 ? Number(a.LINES) : 0,
    connectedCapacityMW: 0,
    availableMW: 0,
    availabilityBin: 0,
  };
}

export async function fetchSubstations(
  bounds: MapBounds,
  signal?: AbortSignal,
): Promise<MapSubstation[]> {
  const allSubs: MapSubstation[] = [];
  let offset = 0;
  let pages = 0;

  while (pages < MAX_PAGES) {
    // Build URL — use returnGeometry=true for point coordinates, outSR=4326
    let url =
      `${LAYERS.substations}/query?` +
      `where=1%3D1` +
      `&geometry=${encodeURIComponent(bboxEnvelope(bounds))}` +
      `&geometryType=esriGeometryEnvelope` +
      `&spatialRel=esriSpatialRelIntersects` +
      `&inSR=4326&outSR=4326` +
      `&outFields=NAME%2CSTATUS%2CLINES%2CMAX_VOLT%2CMIN_VOLT` +
      `&returnGeometry=true` +
      `&resultRecordCount=${PAGE_SIZE}` +
      `&f=json`;

    // Only add resultOffset when > 0 (some servers reject offset=0)
    if (offset > 0) {
      url += `&resultOffset=${offset}`;
    }

    const res = await fetch(url, { signal });
    if (!res.ok) {
      throw new Error(`Substations fetch failed (HTTP ${res.status})`);
    }
    const data = await res.json();

    // If server rejects query params, throw so hook can fall back to derived substations
    if (data.error) {
      throw new Error(data.error.message ?? 'ArcGIS query error (substations)');
    }
    const features = data.features ?? [];

    for (const f of features) {
      const sub = parseSubstationFeature(f);
      if (sub) allSubs.push(sub);
    }

    if (features.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    pages++;
  }

  return allSubs;
}

// ── Fallback: derive substations from transmission lines ────────────────────

/** Derive substations from line endpoint names (used when HIFLD API is unavailable). */
export function deriveSubstationsFromLines(lines: MapTransmissionLine[]): MapSubstation[] {
  const subMap = new Map<
    string,
    { coords: { lat: number; lng: number }[]; voltages: number[]; owner: string; lineCount: number }
  >();

  for (const line of lines) {
    const paths = line.coordinates;
    if (paths.length === 0) continue;

    const voltage = line.voltage;
    const owner = line.owner;
    const firstPt = paths[0];
    const lastPt = paths[paths.length - 1];

    if (line.sub1 && line.sub1 !== 'NOT AVAILABLE' && firstPt) {
      let sub = subMap.get(line.sub1);
      if (!sub) {
        sub = { coords: [], voltages: [], owner, lineCount: 0 };
        subMap.set(line.sub1, sub);
      }
      sub.coords.push({ lat: firstPt[1], lng: firstPt[0] });
      if (voltage > 0) sub.voltages.push(voltage);
      sub.lineCount++;
    }

    if (line.sub2 && line.sub2 !== 'NOT AVAILABLE' && lastPt) {
      let sub = subMap.get(line.sub2);
      if (!sub) {
        sub = { coords: [], voltages: [], owner, lineCount: 0 };
        subMap.set(line.sub2, sub);
      }
      sub.coords.push({ lat: lastPt[1], lng: lastPt[0] });
      if (voltage > 0) sub.voltages.push(voltage);
      sub.lineCount++;
    }
  }

  const substations: MapSubstation[] = [];
  for (const [name, info] of subMap) {
    if (info.coords.length === 0) continue;
    const avgLat = info.coords.reduce((s, c) => s + c.lat, 0) / info.coords.length;
    const avgLng = info.coords.reduce((s, c) => s + c.lng, 0) / info.coords.length;
    substations.push({
      name,
      owner: info.owner,
      status: 'active', // Derived substations don't have status
      maxVolt: info.voltages.length > 0 ? Math.max(...info.voltages) : 0,
      minVolt: 0,
      lat: avgLat,
      lng: avgLng,
      lineCount: info.lineCount,
      connectedCapacityMW: 0,
      availableMW: 0,
      availabilityBin: 0,
    });
  }

  return substations;
}

// ── Availability calculation ─────────────────────────────────────────────────

/**
 * Assign each active plant to its nearest active substation (no double-counting),
 * distribute state demand proportionally by line count, and compute net
 * available power. Uses capacity-factor-adjusted output (not nameplate).
 *
 * Non-active plants and substations are excluded from the calculation but
 * kept in the returned array with zeroed availability fields.
 */
export function calculateAvailability(
  plants: MapPowerPlant[],
  substations: MapSubstation[],
  stateDemandMW: number,
  stateCapacityFactors: Map<string, number> | null = null,
): MapSubstation[] {
  if (substations.length === 0) return [];

  // Filter to active-only for the calculation
  const activePlants = plants.filter((p) => p.status === 'active');
  const activeSubIndices: number[] = [];
  for (let i = 0; i < substations.length; i++) {
    if (substations[i].status === 'active') activeSubIndices.push(i);
  }

  // 1. Assign each active plant's effective output to its nearest active substation
  const capByIdx = new Map<number, number>();

  for (const plant of activePlants) {
    let bestIdx = -1;
    let bestDist = Infinity;
    const cosLat = Math.cos((plant.lat * Math.PI) / 180);
    for (const i of activeSubIndices) {
      const dLat = plant.lat - substations[i].lat;
      const dLng = (plant.lng - substations[i].lng) * cosLat;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      capByIdx.set(bestIdx, (capByIdx.get(bestIdx) ?? 0) + effectiveMW(plant, stateCapacityFactors));
    }
  }

  // 2. Distribute state demand proportionally by line count (active substations only)
  const totalActiveLineCount = activeSubIndices.reduce(
    (sum, i) => sum + substations[i].lineCount, 0,
  );

  // 3. Compute per-substation availability
  return substations.map((sub, i) => {
    // Non-active substations get zeroed availability
    if (sub.status !== 'active') {
      return { ...sub, connectedCapacityMW: 0, availableMW: 0, availabilityBin: -1 };
    }

    const generationMW = capByIdx.get(i) ?? 0;
    const consumedMW = totalActiveLineCount > 0
      ? stateDemandMW * (sub.lineCount / totalActiveLineCount)
      : 0;
    const net = generationMW - consumedMW;

    return {
      ...sub,
      connectedCapacityMW: Math.round(generationMW),
      availableMW: Math.round(net),
      availabilityBin: net <= 0 ? 0 : net < 200 ? 1 : 2,
    };
  });
}

// ── Availability color bins ──────────────────────────────────────────────────

export const AVAILABILITY_BINS = [
  { bin: 0, color: '#EF4444', label: 'No capacity' },
  { bin: 1, color: '#F97316', label: '1–199 MW' },
  { bin: 2, color: '#3B82F6', label: '200+ MW' },
];

// ── State boundary ──────────────────────────────────────────────────────────

const CENSUS_STATES =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/12/query';

const stateBoundaryCache = new Map<string, GeoJSON.FeatureCollection>();

/** Fetch the GeoJSON boundary polygon for a US state abbreviation. */
export async function fetchStateBoundary(
  stateAbbr: string,
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection> {
  const cached = stateBoundaryCache.get(stateAbbr);
  if (cached) return cached;

  const url =
    `${CENSUS_STATES}?where=${encodeURIComponent(`STUSAB='${stateAbbr}'`)}` +
    `&outFields=STUSAB` +
    `&returnGeometry=true` +
    `&outSR=4326` +
    `&f=geojson`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`State boundary fetch failed (HTTP ${res.status})`);
  const data = await res.json();
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: data.features ?? [],
  };
  stateBoundaryCache.set(stateAbbr, fc);
  return fc;
}
