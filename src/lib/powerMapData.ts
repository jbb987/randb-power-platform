/**
 * Power Map Data — fetches power plants, transmission lines, and
 * substations for a given map bounding box from GeoPlataform ArcGIS.
 *
 * Reuses the same endpoints from infraLookup.ts but with bbox-based
 * queries suitable for the map viewport.
 */

const GEOPLATFORM = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services';

const LAYERS = {
  transmissionLines: `${GEOPLATFORM}/US_Electric_Power_Transmission_Lines/FeatureServer/0`,
  powerPlants: `${GEOPLATFORM}/Power_Plants_in_the_US/FeatureServer/0`,
} as const;

const PAGE_SIZE = 2000; // ArcGIS server-side max per request

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
  lat: number;
  lng: number;
}

export interface MapTransmissionLine {
  owner: string;
  voltage: number;
  voltClass: string;
  sub1: string;
  sub2: string;
  status: string;
  coordinates: [number, number][];
}

export interface MapSubstation {
  name: string;
  owner: string;
  maxVolt: number;
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

/**
 * EIA-based average capacity factors by source type.
 * Capacity factor = actual annual output / (nameplate × 8760 hours).
 * Source: EIA Electric Power Monthly 2024.
 */
const CAPACITY_FACTORS: Record<string, number> = {
  Solar: 0.25,
  Wind: 0.34,
  'Natural Gas': 0.44,
  Coal: 0.40,
  Nuclear: 0.93,
  Hydroelectric: 0.37,
  Petroleum: 0.12,
  Biomass: 0.55,
  Geothermal: 0.74,
  Other: 0.30,
};

/** Return effective average output in MW for a plant (nameplate × capacity factor). */
export function effectiveMW(plant: MapPowerPlant): number {
  const cf = CAPACITY_FACTORS[plant.primarySource] ?? CAPACITY_FACTORS.Other;
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

  while (true) {
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
        lat: Number(a.Latitude) || 0,
        lng: Number(a.Longitude) || 0,
      });
    }

    if (features.length < PAGE_SIZE) break; // last page
    offset += PAGE_SIZE;
  }

  return allPlants;
}

export async function fetchTransmissionLines(
  bounds: MapBounds,
  signal?: AbortSignal,
): Promise<{ lines: MapTransmissionLine[]; substations: MapSubstation[] }> {
  // Collect all raw features across pages first
  const allFeatures: { attributes: Record<string, unknown>; geometry?: { paths?: number[][][] } }[] = [];
  let offset = 0;

  while (true) {
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
    allFeatures.push(...features);

    if (features.length < PAGE_SIZE) break; // last page
    offset += PAGE_SIZE;
  }

  // Process all features into lines + substations
  const lines: MapTransmissionLine[] = [];
  const subMap = new Map<
    string,
    { coords: { lat: number; lng: number }[]; voltages: number[]; owner: string; lineCount: number }
  >();

  for (const f of allFeatures) {
    const a = f.attributes;
    const paths: number[][][] = f.geometry?.paths ?? [];

    const coords: [number, number][] = [];
    for (const path of paths) {
      for (const pt of path) {
        coords.push([pt[0], pt[1]]);
      }
    }

    const voltage = Number(a.VOLTAGE) || 0;
    const owner = String(a.OWNER ?? '');

    lines.push({
      owner,
      voltage,
      voltClass: String(a.VOLT_CLASS ?? ''),
      sub1: String(a.SUB_1 ?? ''),
      sub2: String(a.SUB_2 ?? ''),
      status: String(a.STATUS ?? ''),
      coordinates: coords,
    });

    const sub1Name = String(a.SUB_1 ?? '');
    const sub2Name = String(a.SUB_2 ?? '');
    const firstPath = paths[0];
    const lastPath = paths[paths.length - 1];

    if (sub1Name && sub1Name !== 'NOT AVAILABLE' && firstPath?.[0]) {
      let sub = subMap.get(sub1Name);
      if (!sub) {
        sub = { coords: [], voltages: [], owner, lineCount: 0 };
        subMap.set(sub1Name, sub);
      }
      sub.coords.push({ lat: firstPath[0][1], lng: firstPath[0][0] });
      if (voltage > 0) sub.voltages.push(voltage);
      sub.lineCount++;
    }

    if (sub2Name && sub2Name !== 'NOT AVAILABLE' && lastPath?.length > 0) {
      const lastPt = lastPath[lastPath.length - 1];
      if (lastPt) {
        let sub = subMap.get(sub2Name);
        if (!sub) {
          sub = { coords: [], voltages: [], owner, lineCount: 0 };
          subMap.set(sub2Name, sub);
        }
        sub.coords.push({ lat: lastPt[1], lng: lastPt[0] });
        if (voltage > 0) sub.voltages.push(voltage);
        sub.lineCount++;
      }
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
      maxVolt: info.voltages.length > 0 ? Math.max(...info.voltages) : 0,
      lat: avgLat,
      lng: avgLng,
      lineCount: info.lineCount,
      connectedCapacityMW: 0,
      availableMW: 0,
      availabilityBin: 0,
    });
  }

  return { lines, substations };
}

// ── Availability calculation ─────────────────────────────────────────────────

/**
 * Assign each plant to its single nearest substation (no double-counting),
 * distribute state demand proportionally by line count, and compute net
 * available power.  Uses capacity-factor-adjusted output (not nameplate).
 * Mutates the substations array in-place.
 */
export function calculateAvailability(
  plants: MapPowerPlant[],
  substations: MapSubstation[],
  stateDemandMW: number,
): void {
  if (substations.length === 0) return;

  // 1. Assign each plant's effective output to its nearest substation
  const capByIdx = new Map<number, number>();

  for (const plant of plants) {
    let bestIdx = -1;
    let bestDist = Infinity;
    const cosLat = Math.cos((plant.lat * Math.PI) / 180);
    for (let i = 0; i < substations.length; i++) {
      const dLat = plant.lat - substations[i].lat;
      const dLng = (plant.lng - substations[i].lng) * cosLat;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      capByIdx.set(bestIdx, (capByIdx.get(bestIdx) ?? 0) + effectiveMW(plant));
    }
  }

  // 2. Distribute state demand proportionally by line count
  const totalLineCount = substations.reduce((sum, s) => sum + s.lineCount, 0);

  // 3. Compute per-substation availability
  for (let i = 0; i < substations.length; i++) {
    const sub = substations[i];
    const generationMW = capByIdx.get(i) ?? 0;
    const consumedMW = totalLineCount > 0
      ? stateDemandMW * (sub.lineCount / totalLineCount)
      : 0;
    const net = generationMW - consumedMW;

    sub.connectedCapacityMW = Math.round(generationMW);
    sub.availableMW = Math.round(net);
    sub.availabilityBin = net <= 0 ? 0 : net < 200 ? 1 : 2;
  }
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
