/**
 * Power Map Data — fetches power plants, transmission lines, and
 * substations for a given map bounding box from GeoPlataform ArcGIS.
 *
 * Reuses the same endpoints from infraLookup.ts but with bbox-based
 * queries suitable for the map viewport.
 */

// @ts-expect-error — d3-delaunay ships without type declarations
import { Delaunay } from 'd3-delaunay';

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

// ── Paginated fetching ───────────────────────────────────────────────────────

function bboxEnvelope(bounds: MapBounds): string {
  return `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
}

export async function fetchPowerPlants(bounds: MapBounds): Promise<MapPowerPlant[]> {
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

    try {
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();
      if (data.error) break;
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
    } catch {
      break;
    }
  }

  return allPlants;
}

export async function fetchTransmissionLines(
  bounds: MapBounds,
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

    try {
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();
      if (data.error) break;
      const features = data.features ?? [];
      allFeatures.push(...features);

      if (features.length < PAGE_SIZE) break; // last page
      offset += PAGE_SIZE;
    } catch {
      break;
    }
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

    if (sub2Name && sub2Name !== 'NOT AVAILABLE' && lastPath) {
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
    });
  }

  return { lines, substations };
}

// ── Availability calculation ─────────────────────────────────────────────────

export interface AvailabilityPoint {
  lat: number;
  lng: number;
  availableMW: number;
  generatedMW: number;
  consumedMW: number;
  /** 0-1 intensity (1 = highest availability) */
  intensity: number;
  /** Discrete color bin 0-4 */
  bin: number;
}

const RESERVE_MARGIN = 1.20;
const TARGET_MW = 200;

/**
 * For each substation, sum nearby generation, estimate local consumption
 * by distributing the state's total demand proportionally by line count,
 * and compute net available power.
 */
export function calculateAvailability(
  plants: MapPowerPlant[],
  substations: MapSubstation[],
  stateDemandMW: number,
): AvailabilityPoint[] {
  if (substations.length === 0) return [];

  const RADIUS_DEG = 0.3;

  // Distribute state demand across substations proportionally by line count
  const totalLineCount = substations.reduce((sum, s) => sum + s.lineCount, 0);
  if (totalLineCount === 0) return [];

  const points: AvailabilityPoint[] = [];

  for (const sub of substations) {
    // Find plants near this substation
    let nearbyGenMW = 0;
    for (const plant of plants) {
      const dLat = plant.lat - sub.lat;
      const dLng = plant.lng - sub.lng;
      if (Math.abs(dLat) < RADIUS_DEG && Math.abs(dLng) < RADIUS_DEG) {
        nearbyGenMW += plant.capacityMW;
      }
    }

    if (nearbyGenMW === 0) continue;

    // Proportional share of state demand based on connected lines
    const consumedMW = stateDemandMW * (sub.lineCount / totalLineCount);

    // Net available = (generation * reserve margin) - consumption
    const availableMW = Math.max(0, nearbyGenMW * RESERVE_MARGIN - consumedMW);
    const intensity = Math.min(1, availableMW / TARGET_MW);

    points.push({
      lat: sub.lat,
      lng: sub.lng,
      availableMW,
      generatedMW: nearbyGenMW,
      consumedMW,
      intensity,
      bin: Math.min(4, Math.floor(intensity * 5)),
    });
  }

  return points;
}

// ── Voronoi availability zones ───────────────────────────────────────────────

/** Color bins for availability: 0 = lowest (blue), 4 = highest (red) */
export const AVAILABILITY_BINS = [
  { bin: 0, color: '#3B82F6', label: '0–40 MW' },
  { bin: 1, color: '#818CF8', label: '40–80 MW' },
  { bin: 2, color: '#A855F7', label: '80–120 MW' },
  { bin: 3, color: '#E07850', label: '120–160 MW' },
  { bin: 4, color: '#EF4444', label: '160+ MW' },
];

export function buildAvailabilityPolygons(
  points: AvailabilityPoint[],
  bounds: MapBounds,
): GeoJSON.FeatureCollection {
  if (points.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }

  const delaunay = Delaunay.from(points.map((p) => [p.lng, p.lat]));

  const pad = 0.5;
  const voronoi = delaunay.voronoi([
    bounds.west - pad,
    bounds.south - pad,
    bounds.east + pad,
    bounds.north + pad,
  ]);

  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < points.length; i++) {
    const cell = voronoi.cellPolygon(i);
    if (!cell) continue;

    const pt = points[i];
    features.push({
      type: 'Feature',
      id: i,
      properties: {
        availableMW: Math.round(pt.availableMW),
        intensity: pt.intensity,
        bin: pt.bin,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [cell.map((c: number[]) => [c[0], c[1]])],
      },
    });
  }

  return { type: 'FeatureCollection', features };
}
