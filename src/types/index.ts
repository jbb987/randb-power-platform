export type UserRole = 'admin' | 'employee';

export type ToolId =
  | 'site-appraiser'
  | 'broadband-lookup'
  | 'grid-power-analyzer'
  | 'power-calculator'
  | 'site-analyzer'
  | 'water-analysis'
  | 'gas-analysis'
  | 'sales-crm'
  | 'sales-admin'
  | 'crm';

export const ALL_TOOL_IDS: ToolId[] = [
  'site-appraiser',
  'broadband-lookup',
  'grid-power-analyzer',
  'power-calculator',
  'site-analyzer',
  'water-analysis',
  'gas-analysis',
  'sales-crm',
  'sales-admin',
  'crm',
];

export const TOOL_LABELS: Record<ToolId, string> = {
  'site-appraiser': 'Site Appraiser',
  'broadband-lookup': 'Broadband Lookup',
  'grid-power-analyzer': 'Grid Power Analyzer',
  'power-calculator': 'Power Calculator',
  'site-analyzer': 'Site Analyzer',
  'water-analysis': 'Water Analysis',
  'gas-analysis': 'Gas Infrastructure Analysis',
  'sales-crm': 'Leads',
  'sales-admin': 'Sales Dashboard',
  'crm': 'Directory',
};

// Backward-compat: old ToolId 'piddr' was renamed to 'site-analyzer'. Translate
// stored values (allowedTools arrays in users docs, history entries) on read.
export function normalizeToolId(id: string): ToolId | undefined {
  if (id === 'piddr') return 'site-analyzer';
  return ALL_TOOL_IDS.includes(id as ToolId) ? (id as ToolId) : undefined;
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
  // CRM linkage (replaces the legacy free-text owner field going forward;
  // owner is retained above for backward compat with pre-link sites).
  companyId?: string;
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

// ── Broadband lookup types ────────────────────────────────────────────────

export type TechnologyType =
  | 'Fiber'
  | 'Cable'
  | 'DSL'
  | 'Fixed Wireless'
  | 'Satellite'
  | 'Other';

/**
 * FCC BDC technology code → display name mapping.
 * Codes per FCC Broadband Data Collection spec.
 */
export const TECH_CODE_MAP: Record<number, TechnologyType> = {
  10: 'DSL',               // Copper Wire
  40: 'Cable',             // Coaxial Cable / HFC
  50: 'Fiber',             // Optical Carrier / Fiber to the Premises
  60: 'Satellite',         // Geostationary Satellite (GSO) — e.g. HughesNet, Viasat
  61: 'Satellite',         // Non-Geostationary Satellite (NGSO) — e.g. Starlink
  70: 'Fixed Wireless',    // Unlicensed Terrestrial Fixed Wireless
  71: 'Fixed Wireless',    // Licensed Terrestrial Fixed Wireless
  72: 'Fixed Wireless',    // Licensed-by-Rule Terrestrial Fixed Wireless
  0:  'Other',
};

export type ConnectivityTier = 'Served' | 'Underserved' | 'Unserved';

/**
 * Mobile broadband technology generations.
 */
export type MobileTechnology = '5G-NR' | '4G LTE' | '3G';

/**
 * FCC BDC mobile technology code → display name mapping.
 * Codes per FCC Broadband Data Collection spec.
 */
export const MOBILE_TECH_CODE_MAP: Record<number, MobileTechnology> = {
  300: '3G',        // 3G (CDMA/EVDO/GSM/UMTS/HSPA)
  400: '4G LTE',    // 4G LTE
  500: '5G-NR',     // 5G New Radio
};

/**
 * A single mobile broadband provider's coverage at a location.
 */
export interface MobileBroadbandProvider {
  providerName: string;
  technology: MobileTechnology;
  techCode: number;
  maxDown: number;        // Mbps (advertised / typical)
  maxUp: number;          // Mbps
}

export interface BroadbandProvider {
  providerName: string;
  technology: TechnologyType;
  techCode: number;
  maxDown: number;        // Mbps
  maxUp: number;          // Mbps
  lowLatency: boolean;
}

export type FiberRouteType = 'long-haul' | 'state' | 'municipal';

export interface NearbyFiberRoute {
  name: string;
  owner: string;
  type: FiberRouteType;
  distanceMi: number;
}

export interface NearbyServiceBlock {
  geoid: string;                   // GEOID of the nearby census block
  distanceMi: number;              // Haversine distance from site to block centroid
  providers: BroadbandProvider[];  // Terrestrial providers (Fiber + Cable + Fixed Wireless)
  fiberAvailable: boolean;         // Does this block have fiber?
  cableAvailable: boolean;         // Does this block have cable?
  fixedWirelessAvailable: boolean; // Does this block have fixed wireless?
}

export interface BroadbandResult {
  // Location info (from geo.fcc.gov)
  fips: string;           // 15-char census block FIPS
  countyFips: string;     // 5-char county FIPS
  countyName: string;
  stateCode: string;      // 2-letter
  stateName: string;

  // Provider data (from ArcGIS FCC BDC — block level)
  providers: BroadbandProvider[];
  totalProviders: number;
  fiberAvailable: boolean;
  cableAvailable: boolean;
  fixedWirelessAvailable: boolean;
  maxDownload: number;    // best available Mbps
  maxUpload: number;      // best available Mbps

  // Mobile broadband coverage (from FCC BDC mobile data)
  mobileProviders: MobileBroadbandProvider[];

  // County-wide providers (from ArcGIS FCC BDC — county level)
  countyProviders: BroadbandProvider[];

  // Nearby fiber routes (from ArcGIS spatial query)
  nearbyFiberRoutes: NearbyFiberRoute[];

  // Nearby service blocks (populated when fiber/cable unavailable and adjacent blocks have them)
  nearbyServiceBlocks?: NearbyServiceBlock[];

  // Distance to nearest fiber in county (wider search, populated when fiber not on site or nearby)
  nearestCountyFiberMi?: number | null;

  // Classification
  tier: ConnectivityTier;

  // Utility territory (reused from power infra)
  iso: string;
  utilityTerritory: string[];

  // FCC map deep links
  fccMapUrl: string;
  fccMobileMapUrl: string;

  // Per-section errors
  providersError: string | null;
  fiberError: string | null;

  // Timestamp
  analyzedAt: number;
}

// ── Sales CRM types ──────────────────────────────────────────────────────

export type LeadStatus = 'new' | 'call_1' | 'email_sent' | 'call_2' | 'call_3' | 'won' | 'lost';

export const LEAD_STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; order: number }> = {
  new:        { label: 'New Lead',    color: '#3B82F6', order: 0 },
  call_1:     { label: 'Call 1',      color: '#F59E0B', order: 1 },
  email_sent: { label: 'Email Sent',  color: '#8B5CF6', order: 2 },
  call_2:     { label: 'Call 2',      color: '#F97316', order: 3 },
  call_3:     { label: 'Final Call',  color: '#EF4444', order: 4 },
  won:        { label: 'Won',         color: '#10B981', order: 5 },
  lost:       { label: 'Lost',        color: '#6B7280', order: 6 },
};

export const ACTIVE_LEAD_STATUSES: LeadStatus[] = ['new', 'call_1', 'email_sent', 'call_2', 'call_3'];
export const ARCHIVED_LEAD_STATUSES: LeadStatus[] = ['won', 'lost'];

export interface LeadNote {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: number;
}

export interface Lead {
  id: string;
  assignedTo: string;           // Firebase UID
  assignedToName: string;       // Display name / email of assigned user
  businessName: string;
  phone: string;
  email: string;
  description: string;          // short description of the business
  decisionMakerName: string;
  decisionMakerRole: string;
  status: LeadStatus;
  notes: LeadNote[];
  createdAt: number;
  updatedAt: number;
}

// ── Land Comps ───────────────────────────────────────────────────────────

export interface LandComp {
  id: string;
  address: string;
  county: string;
  saleDate: string;
  totalPrice: number;
  acres: number;
  pricePerAcre: number;
  landUse: string;
  parcelId: string;
  score?: number;
  excluded?: boolean;
  manualOverride?: boolean;
}

export interface FilteredCompResult {
  active: LandComp[];
  excluded: LandComp[];
  medianPricePerAcre: number;
  activeCount: number;
  totalCount: number;
  warnings: string[];
}

// ── Site Registry ─────────────────────────────────────────────────────────

export interface SiteRegistryEntry {
  id: string;
  name: string;
  address: string;
  coordinates: { lat: number; lng: number } | null;
  acreage: number;
  mwCapacity: number;
  dollarPerAcreLow: number;
  dollarPerAcreHigh: number;

  // Project link
  projectId?: string;

  // Visibility & ownership
  createdBy: string;
  memberIds: string[];

  // Tool results (populated as tools are run)
  appraisalResult?: AppraisalResult | null;
  infraResult?: Record<string, unknown> | null;
  broadbandResult?: BroadbandResult | null;
  waterResult?: Record<string, unknown> | null;
  gasResult?: Record<string, unknown> | null;
  transportResult?: Record<string, unknown> | null;
  landComps?: LandComp[];
  piddrGeneratedAt?: number | null;

  // Due diligence fields (transferred from Site Appraiser)
  priorUsage?: string;
  legalDescription?: string;
  county?: string;
  parcelId?: string;
  owner?: string;

  // CRM linkage (supersedes `owner` going forward; owner kept for legacy data).
  companyId?: string;

  // Gas marketers/distributors per pipeline (manual entry, keyed by operator name)
  pipelineMarketers?: Record<string, string>;

  // Metadata
  createdAt: number;
  updatedAt: number;
  detectedState?: string;
}

// ── User Activity History ────────────────────────────────────────────────

export interface UserActivityEntry {
  id: string;
  userId: string;
  toolId: ToolId;
  siteRegistryId?: string;  // linked registry site, if any
  siteName: string;
  siteAddress: string;
  action: string;            // e.g. "Ran site analysis", "Ran broadband lookup", "Computed land valuation"
  inputs?: Record<string, unknown>;  // tool-specific inputs for replay
  createdAt: number;
}

// ── CRM ──────────────────────────────────────────────────────────────────

export type CompanyTag = 'REP' | 'Construction' | 'Pre Construction' | 'Utility';

export const ALL_COMPANY_TAGS: CompanyTag[] = ['REP', 'Construction', 'Pre Construction', 'Utility'];

export const COMPANY_TAG_COLORS: Record<CompanyTag, string> = {
  'REP':              '#10B981', // emerald
  'Construction':     '#F59E0B', // amber
  'Pre Construction': '#3B82F6', // blue
  'Utility':          '#8B5CF6', // violet
};

/** States in which R&B Power currently tracks customer licenses. Free-form
 * license numbers per state — no validation, format varies by board. */
export const LICENSE_STATES = ['OK', 'TX', 'AZ', 'NM', 'TN'] as const;
export type LicenseState = typeof LICENSE_STATES[number];

export const LICENSE_STATE_LABELS: Record<LicenseState, string> = {
  OK: 'Oklahoma',
  TX: 'Texas',
  AZ: 'Arizona',
  NM: 'New Mexico',
  TN: 'Tennessee',
};

export interface Company {
  id: string;
  name: string;
  location: string;              // "City, ST" free text, e.g. "Houston, TX"
  website?: string;
  ein?: string;
  tags: CompanyTag[];
  note?: string;
  licenses?: Partial<Record<LicenseState, string>>;
  createdAt: number;
  updatedAt: number;
  createdBy: string;             // userId
}

export interface Contact {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  title?: string;
  email?: string;
  phone?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Documents ────────────────────────────────────────────────────────────

export type DocumentCategory =
  | 'legal'         // NDA, disclosure agreements
  | 'invoice'       // invoices, receipts
  | 'contract'      // proposals, agreements, executed contracts
  | 'deliverable'   // allocation letters, one-line diagrams, reports, final outputs
  | 'photo'         // site photos
  | 'other';

export const ALL_DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'legal',
  'invoice',
  'contract',
  'deliverable',
  'photo',
  'other',
];

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  legal:       'Legal',
  invoice:     'Invoices',
  contract:    'Contracts',
  deliverable: 'Deliverables',
  photo:       'Photos',
  other:       'Other',
};

/** Max upload size per file, in bytes. 10 MB for v1. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Accepted MIME types for v1. PDFs and common image formats. */
export const ACCEPTED_DOCUMENT_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

export interface CrmDocument {
  id: string;
  companyId: string;
  category: DocumentCategory;
  name: string;                // user-visible filename
  contentType: string;         // MIME type
  sizeBytes: number;
  storagePath: string;         // "crm-documents/{companyId}/{documentId}-{sanitized-name}"
  uploadedAt: number;
  uploadedBy: string;          // userId
  uploadedByName: string;      // cached display name
}

