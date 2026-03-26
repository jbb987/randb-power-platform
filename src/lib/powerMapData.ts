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

export interface PowerMapResult {
  plants: MapPowerPlant[];
  lines: MapTransmissionLine[];
  substations: MapSubstation[];
  totalGenerationMW: number;
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

// ── Fetching ─────────────────────────────────────────────────────────────────

function bboxEnvelope(bounds: MapBounds): string {
  return `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
}

export async function fetchPowerPlants(bounds: MapBounds): Promise<MapPowerPlant[]> {
  const url =
    `${LAYERS.powerPlants}/query?` +
    `where=1%3D1` +
    `&geometry=${encodeURIComponent(bboxEnvelope(bounds))}` +
    `&geometryType=esriGeometryEnvelope` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&inSR=4326` +
    `&outFields=Plant_Name%2CPrimSource%2CInstall_MW%2CTotal_MW%2CUtility_Na%2CLatitude%2CLongitude` +
    `&returnGeometry=false` +
    `&resultRecordCount=2000` +
    `&f=json`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.error) return [];
    return (data.features ?? []).map(
      (f: { attributes: Record<string, unknown> }) => {
        const a = f.attributes;
        return {
          name: String(a.Plant_Name ?? ''),
          operator: String(a.Utility_Na ?? ''),
          primarySource: String(a.PrimSource ?? ''),
          capacityMW: Number(a.Install_MW) || 0,
          totalMW: Number(a.Total_MW) || Number(a.Install_MW) || 0,
          lat: Number(a.Latitude) || 0,
          lng: Number(a.Longitude) || 0,
        };
      },
    );
  } catch {
    return [];
  }
}

export async function fetchTransmissionLines(
  bounds: MapBounds,
): Promise<{ lines: MapTransmissionLine[]; substations: MapSubstation[] }> {
  const url =
    `${LAYERS.transmissionLines}/query?` +
    `where=1%3D1` +
    `&geometry=${encodeURIComponent(bboxEnvelope(bounds))}` +
    `&geometryType=esriGeometryEnvelope` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&inSR=4326&outSR=4326` +
    `&outFields=OWNER%2CVOLTAGE%2CVOLT_CLASS%2CSUB_1%2CSUB_2%2CSTATUS` +
    `&returnGeometry=true` +
    `&resultRecordCount=2000` +
    `&f=json`;

  try {
    const res = await fetch(url);
    if (!res.ok) return { lines: [], substations: [] };
    const data = await res.json();
    if (data.error) return { lines: [], substations: [] };

    const lines: MapTransmissionLine[] = [];
    const subMap = new Map<
      string,
      { coords: { lat: number; lng: number }[]; voltages: number[]; owner: string; lineCount: number }
    >();

    for (const f of data.features ?? []) {
      const a = f.attributes as Record<string, unknown>;
      const paths: number[][][] = f.geometry?.paths ?? [];

      // Flatten all path segments into a single coordinate array
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

      // Extract substation locations from line endpoints
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

    // Average substation coordinates
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
        connectedCapacityMW: 0, // Filled in during availability calc
      });
    }

    return { lines, substations };
  } catch {
    return { lines: [], substations: [] };
  }
}

// ── Availability calculation ─────────────────────────────────────────────────

export interface AvailabilityPoint {
  lat: number;
  lng: number;
  availableMW: number;
  generatedMW: number;
  /** 0-1 intensity for heat map (1 = highest availability) */
  intensity: number;
}

const RESERVE_MARGIN = 1.20; // 20% over-allocation by RTOs/ISOs
const TARGET_MW = 200; // Red threshold

/**
 * For each substation, sum nearby generation capacity, estimate local
 * consumption, and compute net available power.
 *
 * Consumption is estimated using per-capita demand and a rough population
 * density proxy based on generator density in the area (rural areas with
 * generators tend to have low consumption).
 */
export function calculateAvailability(
  plants: MapPowerPlant[],
  substations: MapSubstation[],
  _perCapitaKW: number,
): AvailabilityPoint[] {
  if (substations.length === 0) return [];

  const RADIUS_DEG = 0.3; // ~20 miles radius for associating plants with substations

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

    // Estimate consumption: substations with more lines serve larger load areas.
    // Use line count as a rough proxy for local load (more lines = more demand).
    const estimatedLoadMW = sub.lineCount * 15; // ~15 MW per connected line as rough proxy

    // Net available = (generation * reserve margin) - estimated load
    const availableMW = Math.max(0, nearbyGenMW * RESERVE_MARGIN - estimatedLoadMW);

    points.push({
      lat: sub.lat,
      lng: sub.lng,
      availableMW,
      generatedMW: nearbyGenMW,
      intensity: Math.min(1, availableMW / TARGET_MW),
    });
  }

  return points;
}
