/**
 * Water Analysis types — Phase 1 & 2
 * Phase 1: FEMA Flood Zone, USGS NLDI Stream/Basin, NWI Wetlands
 * Phase 2: USGS Groundwater Monitoring, Drought Conditions, EPA NPDES Permits, Precipitation
 */

export type FloodRiskLevel = 'minimal' | 'moderate' | 'high' | 'very-high' | 'unknown';

export interface FloodZoneInfo {
  /** FEMA flood zone designation (e.g. X, AE, A, VE, AO, D) */
  zone: string;
  /** Zone subtype (e.g. FLOODWAY, 0.2 PCT ANNUAL CHANCE FLOOD HAZARD) */
  zoneSubtype: string;
  /** Base Flood Elevation in feet (null if not applicable) */
  staticBfe: number | null;
  riskLevel: FloodRiskLevel;
  /** Human-readable description of the flood zone */
  description: string;
  /** FEMA FIRM panel link if available */
  firmUrl?: string;
}

export interface MonitoringStation {
  /** USGS site identifier */
  identifier: string;
  name: string;
  type: string;
  /** Approximate distance from query point in miles */
  distanceMi?: number;
  /** USGS Water Resources URL */
  url: string;
}

export interface StreamInfo {
  /** NHD+ Reach Common Identifier */
  comid: string | null;
  streamName: string | null;
  reachCode: string | null;
  /** Strahler stream order */
  streamOrder: number | null;
  /** Drainage basin area in km² */
  basinAreaKm2: number | null;
  /** Upstream navigation status */
  navigationStatus: 'found' | 'not-found';
  monitoringStations: MonitoringStation[];
}

export interface WetlandFeature {
  /** NWI attribute code (e.g. PEM1C, PFO1A) */
  attribute: string;
  /** Plain-language wetland type */
  wetlandType: string;
  /** Acreage of the feature */
  acres: number | null;
  /** Distance from query point in feet */
  distanceFt: number | null;
}

export interface WetlandsInfo {
  hasWetlands: boolean;
  wetlands: WetlandFeature[];
  /** Distance to nearest wetland in feet (null if none found) */
  nearestWetlandFt: number | null;
}

// ── Phase 2 types ────────────────────────────────────────────────────────────

export interface GroundwaterWell {
  /** USGS site number (e.g. "292943098354404") */
  siteNo: string;
  name: string;
  /** Depth to water table in feet below land surface (null if not measured) */
  depthToWaterFt: number | null;
  measurementDate: string | null;
  /** USGS Water Resources site URL */
  url: string;
}

export interface GroundwaterInfo {
  wells: GroundwaterWell[];
  /** Total active GW monitoring wells found within ~30-mile bbox */
  wellCount: number;
}

/**
 * US Drought Monitor severity levels.
 * 'none' = no drought. D0 = abnormally dry, D4 = exceptional drought.
 */
export type DroughtLevel = 'none' | 'D0' | 'D1' | 'D2' | 'D3' | 'D4';

export interface DroughtInfo {
  /** Highest drought category at this location */
  currentLevel: DroughtLevel;
  /** Human-readable label (e.g. "D2 — Severe Drought") */
  levelLabel: string;
  /** ISO date string for the USDM weekly release this is based on */
  measureDate: string;
}

export interface DischargePermit {
  /** Facility/site name from ECHO */
  facilityName: string;
  /** NPDES permit number (e.g. "TX0109819") */
  permitNumber: string;
  /** CWA permit status description */
  permitStatus: string;
  city: string;
  state: string;
}

export interface DischargePermitsInfo {
  permits: DischargePermit[];
  /** Total NPDES permits within search radius (may exceed permits array length) */
  totalCount: number;
  /** Search radius in miles */
  radiusMi: number;
}

export interface PrecipitationInfo {
  /** Average annual precipitation in inches (30-year period) */
  avgAnnualInches: number;
  /** Year range used for the average (e.g. "2015–2024") */
  dataYearsRange: string;
  /** Data source attribution */
  dataSource: string;
}

export interface WaterAnalysisResult {
  lat: number;
  lng: number;
  analyzedAt: number;

  // Phase 1
  floodZone: FloodZoneInfo | null;
  floodZoneError: string | null;

  stream: StreamInfo | null;
  streamError: string | null;

  wetlands: WetlandsInfo | null;
  wetlandsError: string | null;

  // Phase 2
  groundwater: GroundwaterInfo | null;
  groundwaterError: string | null;

  drought: DroughtInfo | null;
  droughtError: string | null;

  dischargePermits: DischargePermitsInfo | null;
  dischargePermitsError: string | null;

  precipitation: PrecipitationInfo | null;
  precipitationError: string | null;
}
