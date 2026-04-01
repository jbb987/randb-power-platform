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

// ── Phase 2 Types ────────────────────────────────────────────────────────────

export type GasQualityRating = 'pipeline-quality' | 'acceptable' | 'requires-treatment';

export interface GasQualityAssessment {
  btuContent: { min: number; max: number; typical: number };  // Btu/scf
  h2sLimit: { maxGrains: number; maxPpm: number; note: string };
  wobbeIndex: { min: number; max: number; typical: number };  // Btu/scf
  rating: GasQualityRating;
  note: string;
}

export type ReliabilityRating = 'high' | 'moderate' | 'low';

export interface SupplyReliabilityScore {
  overallScore: number;           // 0–100
  rating: ReliabilityRating;
  weatherizationStatus: {
    postUri: boolean;              // post-Winter Storm Uri compliance
    complianceNote: string;
    stateMandate: string | null;
  };
  curtailmentHistory: {
    riskLevel: 'low' | 'medium' | 'high';
    note: string;
    recentEvents: string[];
  };
  storageFactor: string;
  note: string;
}

export interface GasTradingHub {
  name: string;
  pipelineIndex: string;
  distanceMiles: number | null;
}

export interface GasPricingContext {
  nearestHub: GasTradingHub;
  basisDifferential: { low: number; high: number; unit: string };  // $/MMBtu
  henryHubBenchmark: string;
  transportAdder: { low: number; high: number; unit: string };    // $/MMBtu
  note: string;
}

export type ComplianceStatus = 'required' | 'recommended' | 'not-applicable';

export interface ComplianceItem {
  item: string;
  authority: string;
  status: ComplianceStatus;
  detail: string;
}

export interface EnvironmentalComplianceChecklist {
  state: string | null;
  items: ComplianceItem[];
  note: string;
}

export interface GasAnalysisResult {
  // Phase 1
  pipelines: PipelineInfo[];
  gasDemand: GasDemandCalculation;
  lateralEstimate: LateralEstimate;
  ldcAssessment: LDCAssessment;
  productionContext: ProductionContext;
  // Phase 2
  gasQuality: GasQualityAssessment;
  supplyReliability: SupplyReliabilityScore;
  gasPricing: GasPricingContext;
  environmentalCompliance: EnvironmentalComplianceChecklist;
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

// ── Gas Quality Assessment (Phase 2) ─────────────────────────────────────────

/**
 * Pipeline-quality natural gas specs per FERC/NAESB standards.
 * BTU range: 950–1,100 Btu/scf (typical 1,020).
 * H2S limit: ≤0.25 grains/100 scf (≈4 ppm) per most tariffs.
 * Wobbe Index: 1,310–1,390 Btu/scf (interchangeability metric).
 */
function assessGasQuality(state: string | null): GasQualityAssessment {
  // Most US pipeline tariffs share common quality specs
  // TX/LA/OK basins may see higher BTU (wet gas) vs Appalachian (dry gas)
  const dryGasStates = new Set(['PA', 'WV', 'OH', 'NY']);
  const isDryGas = state != null && dryGasStates.has(state);

  const btuMin = isDryGas ? 970 : 950;
  const btuMax = isDryGas ? 1050 : 1100;
  const btuTypical = isDryGas ? 1020 : 1035;

  const wobbeMin = 1310;
  const wobbeMax = 1390;
  const wobbeTypical = isDryGas ? 1340 : 1355;

  return {
    btuContent: { min: btuMin, max: btuMax, typical: btuTypical },
    h2sLimit: {
      maxGrains: 0.25,
      maxPpm: 4,
      note: 'Max 0.25 grains H₂S per 100 scf (≈4 ppm). Most interstate tariffs require ≤¼ grain.',
    },
    wobbeIndex: { min: wobbeMin, max: wobbeMax, typical: wobbeTypical },
    rating: 'pipeline-quality',
    note: isDryGas
      ? 'Appalachian basin gas is typically dry (lean) with lower BTU content. Minimal processing needed for turbine fuel.'
      : 'Gulf Coast / Midcontinent basin gas may contain heavier hydrocarbons (wet gas). Verify BTU content with pipeline operator — gas conditioning may be needed if BTU exceeds turbine specs.',
  };
}

// ── Supply Reliability Scoring (Phase 2) ─────────────────────────────────────

interface StateReliabilityProfile {
  postUriMandate: boolean;
  mandateNote: string;
  curtailmentRisk: 'low' | 'medium' | 'high';
  curtailmentNote: string;
  recentEvents: string[];
  storageFactor: string;
  baseScore: number;  // 0–100
}

const STATE_RELIABILITY: Record<string, StateReliabilityProfile> = {
  TX: {
    postUriMandate: true,
    mandateNote: 'TX SB 3 (2021) / PUCT & RRC weatherization rules effective 2023. Critical gas facilities must weatherize.',
    curtailmentRisk: 'medium',
    curtailmentNote: 'Post-Uri reforms improved reliability but ERCOT remains isolated. Extreme cold events still pose curtailment risk.',
    recentEvents: ['Winter Storm Uri (Feb 2021)', 'Winter Storm Elliott (Dec 2022)'],
    storageFactor: 'Gulf Coast storage hubs nearby — favorable for supply security',
    baseScore: 72,
  },
  PA: {
    postUriMandate: false,
    mandateNote: 'No state-level weatherization mandate. FERC Order 2023-01 applies to interstate pipelines.',
    curtailmentRisk: 'low',
    curtailmentNote: 'Marcellus/Utica production surplus reduces curtailment risk. PJM capacity market provides reliability backstop.',
    recentEvents: ['Minimal curtailment history'],
    storageFactor: 'Extensive Appalachian storage facilities',
    baseScore: 85,
  },
  LA: {
    postUriMandate: false,
    mandateNote: 'No state-level weatherization mandate. Louisiana PSC monitoring reliability post-Uri.',
    curtailmentRisk: 'low',
    curtailmentNote: 'Major production and pipeline hub. Henry Hub located in state — minimal transport risk.',
    recentEvents: ['Hurricane Ida disruptions (Aug 2021)'],
    storageFactor: 'Salt dome storage abundant — strong supply buffer',
    baseScore: 82,
  },
  OK: {
    postUriMandate: true,
    mandateNote: 'OK SB 1021 (2022) requires critical gas infrastructure weatherization.',
    curtailmentRisk: 'medium',
    curtailmentNote: 'SCOOP/STACK production area. Winter Storm Uri caused significant curtailments; reforms underway.',
    recentEvents: ['Winter Storm Uri (Feb 2021)'],
    storageFactor: 'Mid-continent storage available',
    baseScore: 70,
  },
  OH: {
    postUriMandate: false,
    mandateNote: 'No state-level weatherization mandate. FERC Order 2023-01 applies.',
    curtailmentRisk: 'low',
    curtailmentNote: 'Utica Shale production surplus. PJM market provides reliability structure.',
    recentEvents: ['Minimal curtailment history'],
    storageFactor: 'Regional storage facilities adequate',
    baseScore: 83,
  },
  WV: {
    postUriMandate: false,
    mandateNote: 'No state-level weatherization mandate. FERC Order 2023-01 applies.',
    curtailmentRisk: 'low',
    curtailmentNote: 'Marcellus/Utica production area — abundant local supply.',
    recentEvents: ['Minimal curtailment history'],
    storageFactor: 'Appalachian storage network accessible',
    baseScore: 84,
  },
  CO: {
    postUriMandate: false,
    mandateNote: 'Colorado PUC evaluating weatherization standards. No mandate yet.',
    curtailmentRisk: 'medium',
    curtailmentNote: 'DJ Basin production area. Extreme cold can strain supply on Front Range.',
    recentEvents: ['Winter Storm Elliott (Dec 2022) — minor impacts'],
    storageFactor: 'Limited in-state storage',
    baseScore: 73,
  },
};

const DEFAULT_RELIABILITY: StateReliabilityProfile = {
  postUriMandate: false,
  mandateNote: 'No state-specific weatherization mandate identified. FERC Order 2023-01 applies to interstate pipelines.',
  curtailmentRisk: 'medium',
  curtailmentNote: 'Curtailment risk depends on proximity to production basins and pipeline capacity. Verify with local pipeline operator.',
  recentEvents: [],
  storageFactor: 'Verify regional gas storage availability with pipeline operator',
  baseScore: 65,
};

function scoreSupplyReliability(state: string | null, nearestPipelineDistMi: number): SupplyReliabilityScore {
  const profile = (state && STATE_RELIABILITY[state]) ?? DEFAULT_RELIABILITY;

  // Adjust base score based on pipeline proximity
  let score = profile.baseScore;
  if (nearestPipelineDistMi < 3) score += 8;
  else if (nearestPipelineDistMi < 10) score += 3;
  else score -= 5;
  score = Math.max(0, Math.min(100, score));

  const rating: ReliabilityRating =
    score >= 80 ? 'high' : score >= 60 ? 'moderate' : 'low';

  return {
    overallScore: score,
    rating,
    weatherizationStatus: {
      postUri: profile.postUriMandate,
      complianceNote: profile.mandateNote,
      stateMandate: profile.postUriMandate ? profile.mandateNote.split('.')[0] : null,
    },
    curtailmentHistory: {
      riskLevel: profile.curtailmentRisk,
      note: profile.curtailmentNote,
      recentEvents: profile.recentEvents,
    },
    storageFactor: profile.storageFactor,
    note: `Supply reliability score: ${score}/100 (${rating}). ${profile.curtailmentNote}`,
  };
}

// ── Gas Pricing Context (Phase 2) ────────────────────────────────────────────

interface TradingHub {
  name: string;
  index: string;
  lat: number;
  lng: number;
  basisLow: number;   // $/MMBtu vs Henry Hub
  basisHigh: number;
  transportLow: number;
  transportHigh: number;
}

const TRADING_HUBS: TradingHub[] = [
  { name: 'Henry Hub',               index: 'HH / NYMEX',          lat: 30.22, lng: -93.35, basisLow: 0,      basisHigh: 0,     transportLow: 0.05, transportHigh: 0.15 },
  { name: 'Waha Hub',                index: 'IF-Waha',             lat: 31.45, lng: -103.55, basisLow: -1.50,  basisHigh: -0.25, transportLow: 0.10, transportHigh: 0.35 },
  { name: 'Houston Ship Channel',    index: 'IF-HSC',              lat: 29.76, lng: -95.22, basisLow: -0.10,  basisHigh: 0.10,  transportLow: 0.05, transportHigh: 0.20 },
  { name: 'Katy Hub',                index: 'IF-Katy',             lat: 29.79, lng: -95.82, basisLow: -0.10,  basisHigh: 0.10,  transportLow: 0.05, transportHigh: 0.20 },
  { name: 'Carthage Hub',            index: 'IF-Carthage',         lat: 32.16, lng: -94.34, basisLow: -0.15,  basisHigh: 0.05,  transportLow: 0.08, transportHigh: 0.25 },
  { name: 'Dominion South',          index: 'Dominion-South',      lat: 39.63, lng: -79.96, basisLow: -0.80,  basisHigh: -0.10, transportLow: 0.10, transportHigh: 0.30 },
  { name: 'Transco Zone 6 (NY)',     index: 'Transco-Z6NY',        lat: 40.75, lng: -73.99, basisLow: 0.50,   basisHigh: 3.00,  transportLow: 0.40, transportHigh: 1.20 },
  { name: 'Chicago Citygate',        index: 'Chicagoland',         lat: 41.88, lng: -87.63, basisLow: -0.20,  basisHigh: 0.30,  transportLow: 0.15, transportHigh: 0.40 },
  { name: 'SoCal Citygate',          index: 'SoCal',               lat: 34.05, lng: -118.24, basisLow: 0.30,  basisHigh: 2.50,  transportLow: 0.30, transportHigh: 0.80 },
  { name: 'AECO Hub (Alberta link)', index: 'AECO-C',              lat: 51.05, lng: -114.07, basisLow: -1.00, basisHigh: -0.20, transportLow: 0.40, transportHigh: 0.80 },
  { name: 'Panhandle Eastern',       index: 'Panhandle-Eastern',   lat: 36.75, lng: -100.50, basisLow: -0.25, basisHigh: 0.05,  transportLow: 0.10, transportHigh: 0.30 },
  { name: 'Opal Hub (WY)',           index: 'IF-Opal',             lat: 41.77, lng: -110.32, basisLow: -0.40, basisHigh: 0.00,  transportLow: 0.15, transportHigh: 0.35 },
];

function buildGasPricingContext(lat: number, lng: number): GasPricingContext {
  // Find nearest trading hub
  let nearest = TRADING_HUBS[0];
  let nearestDist = Infinity;
  for (const hub of TRADING_HUBS) {
    const d = haversineMi(lat, lng, hub.lat, hub.lng);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = hub;
    }
  }

  return {
    nearestHub: {
      name: nearest.name,
      pipelineIndex: nearest.index,
      distanceMiles: Math.round(nearestDist),
    },
    basisDifferential: {
      low: nearest.basisLow,
      high: nearest.basisHigh,
      unit: '$/MMBtu vs Henry Hub',
    },
    henryHubBenchmark: 'NYMEX Henry Hub NG futures — reference benchmark for all US gas pricing',
    transportAdder: {
      low: nearest.transportLow,
      high: nearest.transportHigh,
      unit: '$/MMBtu',
    },
    note: nearest.name === 'Henry Hub'
      ? 'Site is near Henry Hub — minimal basis differential. Gas pricing will closely track NYMEX benchmark.'
      : `Nearest liquid trading point: ${nearest.name} (${nearest.index}). Basis differential of ${nearest.basisLow >= 0 ? '+' : ''}$${nearest.basisLow.toFixed(2)} to ${nearest.basisHigh >= 0 ? '+' : ''}$${nearest.basisHigh.toFixed(2)}/MMBtu vs Henry Hub. Transport adder estimated at $${nearest.transportLow.toFixed(2)}–$${nearest.transportHigh.toFixed(2)}/MMBtu.`,
  };
}

// ── Environmental Compliance Checklist (Phase 2) ─────────────────────────────

function buildEnvironmentalChecklist(state: string | null, targetMW: number): EnvironmentalComplianceChecklist {
  const items: ComplianceItem[] = [];

  if (state === 'TX') {
    // TCEQ-specific permits for NG generators in Texas
    items.push(
      {
        item: 'TCEQ Air Quality Permit (New Source Review)',
        authority: 'Texas Commission on Environmental Quality (TCEQ)',
        status: 'required',
        detail: 'Standard Permit for Electric Generating Units or case-by-case NSR required. Units >25 MW typically need individual air permit review.',
      },
      {
        item: 'TCEQ Standard Permit — Engines & Turbines',
        authority: 'TCEQ — 30 TAC §116.611(a)(3)',
        status: targetMW > 100 ? 'required' : 'recommended',
        detail: 'Standard permit for stationary gas-fired engines/turbines. Covers NOx, CO, VOC emissions. Larger facilities may exceed standard permit thresholds.',
      },
      {
        item: 'PSD / NNAA Permit (Prevention of Significant Deterioration)',
        authority: 'TCEQ / EPA',
        status: targetMW >= 250 ? 'required' : targetMW >= 100 ? 'recommended' : 'not-applicable',
        detail: 'Major source threshold: 100 tons/yr NOx or CO. Facilities >100 MW likely trigger PSD review. BACT analysis required.',
      },
      {
        item: 'Title V Federal Operating Permit',
        authority: 'TCEQ / EPA',
        status: targetMW >= 50 ? 'required' : 'recommended',
        detail: 'Required for major sources (>100 tpy any criteria pollutant). Most gas plants >50 MW will be major sources.',
      },
      {
        item: 'TCEQ Water Quality — TPDES Stormwater Permit',
        authority: 'TCEQ',
        status: 'required',
        detail: 'Texas Pollutant Discharge Elimination System permit for stormwater during construction and operation.',
      },
      {
        item: 'RRC Natural Gas Metering & Pipeline Permit',
        authority: 'Texas Railroad Commission (RRC)',
        status: 'required',
        detail: 'T-4 pipeline permit for lateral construction. Gas metering and safety compliance per RRC rules.',
      },
      {
        item: 'TCEQ Greenhouse Gas Reporting',
        authority: 'TCEQ / EPA',
        status: targetMW >= 25 ? 'required' : 'not-applicable',
        detail: 'EPA Mandatory Greenhouse Gas Reporting Rule (40 CFR Part 98). Facilities emitting ≥25,000 metric tons CO₂e/yr must report.',
      },
    );
  } else {
    // Generic permits for non-TX states
    items.push(
      {
        item: 'State Air Quality Permit (New Source Review)',
        authority: state ? `${state} DEQ / Environmental Agency` : 'State Environmental Agency',
        status: 'required',
        detail: 'All new gas-fired generation requires state air quality permitting. Contact state environmental agency for specific permit type.',
      },
      {
        item: 'PSD / NNAA Permit (Prevention of Significant Deterioration)',
        authority: 'State Agency / EPA',
        status: targetMW >= 250 ? 'required' : targetMW >= 100 ? 'recommended' : 'not-applicable',
        detail: 'Major source threshold: 100 tons/yr NOx or CO. BACT analysis required for PSD areas.',
      },
      {
        item: 'Title V Federal Operating Permit',
        authority: 'State Agency / EPA',
        status: targetMW >= 50 ? 'required' : 'recommended',
        detail: 'Required for major sources. Most gas plants >50 MW trigger Title V.',
      },
      {
        item: 'NPDES Stormwater / Wastewater Permit',
        authority: state ? `${state} Environmental Agency / EPA` : 'State Agency / EPA',
        status: 'required',
        detail: 'National Pollutant Discharge Elimination System permit for construction stormwater and cooling water discharge.',
      },
      {
        item: 'State Pipeline / Lateral Construction Permit',
        authority: state ? `${state} PSC / PUC` : 'State PSC / PUC',
        status: 'required',
        detail: 'State public service commission or utility commission permit for gas lateral construction.',
      },
      {
        item: 'EPA Greenhouse Gas Reporting',
        authority: 'EPA',
        status: targetMW >= 25 ? 'required' : 'not-applicable',
        detail: 'EPA Mandatory GHG Reporting Rule (40 CFR Part 98) — ≥25,000 metric tons CO₂e/yr must report.',
      },
    );
  }

  // Common federal items regardless of state
  items.push(
    {
      item: 'NEPA Review (if federal nexus)',
      authority: 'Federal — varies by agency',
      status: 'recommended',
      detail: 'National Environmental Policy Act review required if federal funding, federal land, or FERC-jurisdictional interconnect is involved.',
    },
    {
      item: 'Endangered Species Act (ESA) Screening',
      authority: 'USFWS',
      status: 'recommended',
      detail: 'US Fish & Wildlife Service screening for threatened/endangered species at project site. IPaC screening recommended during early development.',
    },
  );

  const requiredCount = items.filter((i) => i.status === 'required').length;
  return {
    state,
    items,
    note: `${requiredCount} required permits identified${state ? ` for ${state}` : ''}. ${state === 'TX' ? 'TCEQ is the primary permitting authority for air quality. RRC governs pipeline construction.' : 'Contact state environmental agency for specific permitting requirements and timelines.'}`,
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

  // Phase 2
  const gasQuality = assessGasQuality(detectedState);
  const supplyReliability = scoreSupplyReliability(detectedState, nearestDistMi);
  const gasPricing = buildGasPricingContext(lat, lng);
  const environmentalCompliance = buildEnvironmentalChecklist(detectedState, opts.targetMW);

  return {
    pipelines,
    gasDemand,
    lateralEstimate,
    ldcAssessment,
    productionContext,
    gasQuality,
    supplyReliability,
    gasPricing,
    environmentalCompliance,
    detectedState,
    lat,
    lng,
    timestamp: new Date().toISOString(),
  };
}
