/**
 * Gas Infrastructure Analysis — Phase 1
 *
 * Data sources:
 * - GeoPlataform ArcGIS: Natural Gas Interstate and Intrastate Pipelines
 * - Built-in gas demand calculations (combined cycle / simple cycle)
 * - Built-in lateral cost estimates (FERC 2024-25 data)
 * - Built-in basin proximity detection
 *
 * ArcGIS service fields (from FeatureServer/0 metadata):
 *   TYPEPIPE  - pipeline type (Interstate, Intrastate, Gathering, …)
 *   Operator  - operator name
 *   Status    - operating status
 *   Shape__Length - geometry length (meters)
 */

import { detectState } from './solarAverages';
import { geocodeAddress } from './infraLookup';

// ── Types ────────────────────────────────────────────────────────────────────

export type PipelineType = 'Interstate' | 'Intrastate' | 'Gathering' | 'Unknown';

export interface PipelineInfo {
  operator: string;
  system: string;         // derived label
  type: PipelineType;
  status: string;
  distanceMiles: number;
  diameter?: number;      // not in source data — left undefined
}

export interface GasDemandCalculation {
  targetMW: number;
  capacityFactor: number;
  combinedCycle: {
    heatRate: number;       // Btu/kWh
    dailyDemandMMscf: number;
    annualDemandBcf: number;
  };
  simpleCycle: {
    heatRate: number;
    dailyDemandMMscf: number;
    annualDemandBcf: number;
  };
  recommendedLateralSizingMMscf: number;  // CC daily × 1.3
  pressureRequirementPSIG: string;         // "300–600 PSIG"
}

export interface LateralEstimate {
  distanceToNearestPipeline: number;      // miles
  costPerMileBaseline: number;             // $/mile mid
  estimatedTotalCost: { low: number; high: number };
  timelineMonths: { low: number; high: number };
  permitAuthority: string;
  pipelineDiameterInches: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface LDCAssessment {
  note: string;
}

export interface ProductionContext {
  nearestBasin: string | null;
  basinProximityMiles: number | null;
  note: string;
}

export interface GasAnalysisResult {
  pipelines: PipelineInfo[];
  gasDemand: GasDemandCalculation;
  lateralEstimate: LateralEstimate;
  ldcAssessment: LDCAssessment;
  productionContext: ProductionContext;
  detectedState: string | null;
  lat: number;
  lng: number;
  timestamp: string;
}

// ── Endpoints ────────────────────────────────────────────────────────────────

const GEOPLATFORM = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services';
const PIPELINE_LAYER = `${GEOPLATFORM}/Natural_Gas_Interstate_and_Intrastate_Pipelines_1/FeatureServer/0`;

// ── Helpers ──────────────────────────────────────────────────────────────────

const LAT_OFFSET_20MI = 0.29;   // ~20 miles in degrees latitude

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
  return (LAT_OFFSET_20MI / Math.cos((lat * Math.PI) / 180)) * Math.cos((30 * Math.PI) / 180);
}

function envelope(lat: number, lng: number): string {
  const lo = lngOffset(lat);
  return `${lng - lo},${lat - LAT_OFFSET_20MI},${lng + lo},${lat + LAT_OFFSET_20MI}`;
}

/** Minimum haversine distance from site to any sampled point along pipeline paths. */
function minDistToPath(
  siteLat: number,
  siteLng: number,
  paths: number[][][],
): number {
  let min = Infinity;
  for (const path of paths) {
    for (const pt of path) {
      // ArcGIS returns [lng, lat]
      const d = haversineMi(siteLat, siteLng, pt[1], pt[0]);
      if (d < min) min = d;
    }
  }
  return min === Infinity ? 0 : min;
}

function classifyType(typepipe: string): PipelineType {
  const t = typepipe.toLowerCase().trim();
  if (t.includes('interstate')) return 'Interstate';
  if (t.includes('intrastate')) return 'Intrastate';
  if (t.includes('gather')) return 'Gathering';
  return 'Unknown';
}

// ── Pipeline Query ────────────────────────────────────────────────────────────

async function queryPipelines(lat: number, lng: number): Promise<PipelineInfo[]> {
  const url =
    `${PIPELINE_LAYER}/query?` +
    `where=1%3D1` +
    `&geometry=${encodeURIComponent(envelope(lat, lng))}` +
    `&geometryType=esriGeometryEnvelope` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&inSR=4326&outSR=4326` +
    `&outFields=TYPEPIPE%2COperator%2CStatus` +
    `&returnGeometry=true` +
    `&resultRecordCount=50` +
    `&f=json`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.error) return [];

    type Feature = {
      attributes: Record<string, unknown>;
      geometry?: { paths?: number[][][] };
    };

    const pipelines: PipelineInfo[] = (data.features ?? []).map((f: Feature) => {
      const a = f.attributes;
      const paths = f.geometry?.paths ?? [];
      const distanceMiles = paths.length > 0
        ? minDistToPath(lat, lng, paths)
        : 0;

      const operator = String(a.Operator ?? a.OPERATOR ?? '');
      const typePipe = String(a.TYPEPIPE ?? a.Typepipe ?? '');
      const status = String(a.Status ?? a.STATUS ?? '');

      return {
        operator: operator || 'Unknown Operator',
        system: operator || 'Unknown System',
        type: classifyType(typePipe),
        status: status || 'Unknown',
        distanceMiles: Math.round(distanceMiles * 10) / 10,
      } satisfies PipelineInfo;
    });

    // Sort by distance; deduplicate by operator+type (keep closest)
    const sorted = pipelines.sort((a, b) => a.distanceMiles - b.distanceMiles);
    const seen = new Set<string>();
    return sorted.filter((p) => {
      const key = `${p.operator}|${p.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

// ── Gas Demand ────────────────────────────────────────────────────────────────

function calculateGasDemand(targetMW: number, capacityFactor: number): GasDemandCalculation {
  // Heat rates (Btu/kWh): combined cycle 7,250 midpoint; simple cycle 10,000 midpoint
  // Gas HHV: 1,020 Btu/scf
  // Daily demand (MMscf) = MW × heatRate × capacityFactor × 24 / 1,020,000
  const ccHeatRate = 7250;
  const scHeatRate = 10000;

  const ccDaily = (targetMW * ccHeatRate * capacityFactor * 24) / 1_020_000;
  const scDaily = (targetMW * scHeatRate * capacityFactor * 24) / 1_020_000;

  return {
    targetMW,
    capacityFactor,
    combinedCycle: {
      heatRate: ccHeatRate,
      dailyDemandMMscf: Math.round(ccDaily * 100) / 100,
      annualDemandBcf: Math.round((ccDaily * 365) / 10) / 100,
    },
    simpleCycle: {
      heatRate: scHeatRate,
      dailyDemandMMscf: Math.round(scDaily * 100) / 100,
      annualDemandBcf: Math.round((scDaily * 365) / 10) / 100,
    },
    recommendedLateralSizingMMscf: Math.round(ccDaily * 1.3 * 100) / 100,
    pressureRequirementPSIG: '300–600 PSIG',
  };
}

// ── Lateral Estimate ──────────────────────────────────────────────────────────

function estimateDiameter(mw: number): number {
  if (mw <= 150) return 10;
  if (mw <= 250) return 12;
  return 16;
}

function detectPermitAuthority(state: string | null): string {
  if (state === 'TX') return 'Texas Railroad Commission (T-4 Permit)';
  if (state === 'PA') return 'Pennsylvania PUC / PaDEP';
  if (state === 'WV') return 'West Virginia PSC';
  if (state === 'OH') return 'Ohio PUCO';
  if (state === 'LA') return 'Louisiana PSC';
  if (state === 'OK') return 'Oklahoma Corporation Commission';
  if (state === 'CO') return 'Colorado PUC';
  if (state === 'WY') return 'Wyoming PSC';
  if (state === 'ND' || state === 'SD') return 'State PSC / Army Corps of Engineers (if HDD)';
  return 'State PUC / Pipeline Safety Office (PHMSA regulated)';
}

function buildLateralEstimate(
  nearestDistMi: number,
  targetMW: number,
  state: string | null,
): LateralEstimate {
  const costLow = 8_000_000;
  const costMid = 12_100_000;   // 2024-25 FERC average
  const costHigh = 16_000_000;

  const riskLevel: LateralEstimate['riskLevel'] =
    nearestDistMi < 3 ? 'low' : nearestDistMi < 10 ? 'medium' : 'high';

  return {
    distanceToNearestPipeline: nearestDistMi,
    costPerMileBaseline: costMid,
    estimatedTotalCost: {
      low: Math.round(costLow * nearestDistMi),
      high: Math.round(costHigh * nearestDistMi),
    },
    timelineMonths: { low: 12, high: 24 },
    permitAuthority: detectPermitAuthority(state),
    pipelineDiameterInches: estimateDiameter(targetMW),
    riskLevel,
  };
}

// ── Production Context ────────────────────────────────────────────────────────

interface GasBasin {
  name: string;
  latMin: number; latMax: number;
  lngMin: number; lngMax: number;
  centerLat: number; centerLng: number;
}

const GAS_BASINS: GasBasin[] = [
  { name: 'Eagle Ford Shale',  latMin: 27,   latMax: 30,   lngMin: -100, lngMax: -96,  centerLat: 28.5, centerLng: -98 },
  { name: 'Permian Basin',     latMin: 30,   latMax: 33,   lngMin: -105, lngMax: -101, centerLat: 31.5, centerLng: -103 },
  { name: 'Haynesville Shale', latMin: 31,   latMax: 33,   lngMin: -95,  lngMax: -93,  centerLat: 32,   centerLng: -94 },
  { name: 'Marcellus Shale',   latMin: 38,   latMax: 42,   lngMin: -82,  lngMax: -76,  centerLat: 40,   centerLng: -79 },
  { name: 'Utica Shale',       latMin: 39,   latMax: 41,   lngMin: -82,  lngMax: -80,  centerLat: 40,   centerLng: -81 },
  { name: 'Barnett Shale',     latMin: 32,   latMax: 33.5, lngMin: -98,  lngMax: -97,  centerLat: 32.8, centerLng: -97.5 },
  { name: 'Fayetteville Shale',latMin: 35,   latMax: 36.5, lngMin: -94,  lngMax: -92,  centerLat: 35.8, centerLng: -93 },
  { name: 'Woodford Shale',    latMin: 33.5, latMax: 36,   lngMin: -99,  lngMax: -95,  centerLat: 34.8, centerLng: -97 },
  { name: 'Appalachian Basin', latMin: 37,   latMax: 43,   lngMin: -83,  lngMax: -74,  centerLat: 40,   centerLng: -79 },
];

function detectProductionContext(lat: number, lng: number): ProductionContext {
  // Check if inside any basin bounding box
  for (const basin of GAS_BASINS) {
    if (lat >= basin.latMin && lat <= basin.latMax && lng >= basin.lngMin && lng <= basin.lngMax) {
      const distMi = haversineMi(lat, lng, basin.centerLat, basin.centerLng);
      return {
        nearestBasin: basin.name,
        basinProximityMiles: Math.round(distMi),
        note: `Site is within or adjacent to the ${basin.name}. Favorable for gas supply access.`,
      };
    }
  }

  // Find nearest basin center
  let nearestBasin = GAS_BASINS[0];
  let nearestDist = Infinity;
  for (const basin of GAS_BASINS) {
    const d = haversineMi(lat, lng, basin.centerLat, basin.centerLng);
    if (d < nearestDist) {
      nearestDist = d;
      nearestBasin = basin;
    }
  }

  return {
    nearestBasin: nearestBasin.name,
    basinProximityMiles: Math.round(nearestDist),
    note: `Site is approximately ${Math.round(nearestDist)} miles from the ${nearestBasin.name}. Gas supply must be sourced via interstate pipeline.`,
  };
}

// ── LDC Assessment ────────────────────────────────────────────────────────────

function buildLdcAssessment(state: string | null): LDCAssessment {
  const stateNote = state
    ? `for ${state}`
    : 'for this location';

  return {
    note: `LDC (Local Distribution Company) availability requires direct verification with the local utility ${stateNote}. For large-load interconnects (>10 MMscf/day), industrial transport arrangements or direct interstate pipeline interconnects are typically required. Contact the state PUC for a list of certificated LDC service areas.`,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

export interface GasAnalysisOptions {
  coordinates?: { lat: number; lng: number };
  address?: string;
  targetMW: number;
  capacityFactor?: number;   // 0–1, default 0.85
}

export async function analyzeGasInfrastructure(opts: GasAnalysisOptions): Promise<GasAnalysisResult> {
  let { lat, lng } = opts.coordinates ?? { lat: 0, lng: 0 };
  const capacityFactor = opts.capacityFactor ?? 0.85;

  if (!opts.coordinates || (lat === 0 && lng === 0)) {
    if (!opts.address) throw new Error('Provide coordinates or an address.');
    ({ lat, lng } = await geocodeAddress(opts.address));
  }

  const [pipelines] = await Promise.all([
    queryPipelines(lat, lng),
  ]);

  const detectedState = detectState(lat, lng);
  const gasDemand = calculateGasDemand(opts.targetMW, capacityFactor);
  const nearestDistMi = pipelines.length > 0 ? pipelines[0].distanceMiles : 50;
  const lateralEstimate = buildLateralEstimate(nearestDistMi, opts.targetMW, detectedState);
  const ldcAssessment = buildLdcAssessment(detectedState);
  const productionContext = detectProductionContext(lat, lng);

  return {
    pipelines,
    gasDemand,
    lateralEstimate,
    ldcAssessment,
    productionContext,
    detectedState,
    lat,
    lng,
    timestamp: new Date().toISOString(),
  };
}
