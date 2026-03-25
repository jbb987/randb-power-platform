export type UserRole = 'admin' | 'agent';

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// ── Power Infrastructure lookup types ───────────────────────────────────────

export interface NearbySubstation {
  name: string;
  owner: string;
  maxVolt: number;       // kV
  minVolt: number;       // kV
  status: string;
  lines: number;         // number of connected lines
  distanceMi: number;    // miles from site
  lat: number;
  lng: number;
}

export interface NearbyLine {
  owner: string;
  voltage: number;       // kV
  voltClass: string;     // e.g. "100-161"
  sub1: string;          // endpoint substation 1
  sub2: string;          // endpoint substation 2
  status: string;
}

export interface NearbyPowerPlant {
  name: string;
  operator: string;
  primarySource: string; // e.g. "Solar", "Natural Gas", "Wind"
  capacityMW: number;
  status: string;
  distanceMi: number;
}

export interface FloodZoneInfo {
  zone: string;          // e.g. "X", "A", "AE", "D"
  floodwayType: string;
  panelNumber: string;
}

export interface SolarWindResource {
  ghi: number;           // Global Horizontal Irradiance (kWh/m²/day)
  dni: number;           // Direct Normal Irradiance (kWh/m²/day)
  windSpeed: number;     // m/s at hub height
  capacity: number;      // estimated capacity factor %
}

export interface ElectricityPrice {
  commercial: number;    // cents/kWh
  industrial: number;    // cents/kWh
  allSectors: number;    // cents/kWh
}

// ── Site data ───────────────────────────────────────────────────────────────

export interface SiteInputs {
  id: string;
  projectId: string;         // Links to parent Project
  siteName: string;
  totalAcres: number;
  ppaLow: number;            // $/acre low estimate
  ppaHigh: number;           // $/acre high estimate
  mw: number;                // 10-1000
  // Land / Property
  address: string;
  coordinates: string;          // lat/long
  legalDescription: string;
  county: string;
  parcelId: string;
  owner: string;
  priorUsage: string;           // prior usage / property type
  // Power Infrastructure (editable — may contain multiple values from overlapping territories)
  iso: string;               // RTO/ISO (multiple joined with " / ")
  utilityTerritory: string;  // May have multiple overlapping utilities
  tsp: string;               // Transmission Service Provider
  // Power Infrastructure (lookup results — populated by Analyze)
  lastAnalyzedAt: number | null;   // Timestamp of last infrastructure analysis
  nearestPoiName: string;       // Nearest substation name (POI)
  nearestPoiDistMi: number;     // Distance in miles
  nearbySubstations: NearbySubstation[];
  nearbyLines: NearbyLine[];
  nearbyPowerPlants: NearbyPowerPlant[];
  floodZone: FloodZoneInfo | null;
  solarWind: SolarWindResource | null;
  electricityPrice: ElectricityPrice | null;
  detectedState: string | null;
}

export interface AppraisalResult {
  currentValueLow: number;        // acres × ppaLow
  currentValueHigh: number;       // acres × ppaHigh
  energizedValue: number;         // mw × $3M
  valueCreated: number;           // energizedValue - midpoint currentValue
  returnMultiple: number;         // energizedValue / midpoint currentValue
}

export interface SavedSite {
  id: string;
  inputs: SiteInputs;
  createdAt: number;
  updatedAt: number;
}

// Site Request types
export interface SiteRequestSite {
  address: string;
  coordinates: string;
  acres: number;
}

export type SiteRequestStatus = 'new' | 'ongoing' | 'done';

export interface SiteRequest {
  id: string;
  projectId: string;
  customerName: string;
  sites: SiteRequestSite[];
  status: SiteRequestStatus;
  submittedBy: string;
  createdAt: number;
  updatedAt: number;
}
