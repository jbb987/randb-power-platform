import type { OneLineSpec } from '../lib/oneLine';

export type UserRole = 'admin' | 'manager' | 'labor';

export const ALL_USER_ROLES: UserRole[] = ['admin', 'manager', 'labor'];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  labor: 'Labor',
};

/** Backward-compat: legacy values were `employee` and `worker`. Translate stored
 *  values (users/{uid}.role from Firestore) on read so a missed user doc keeps
 *  working through one release. Once every doc is migrated this can be removed. */
export function normalizeRole(raw: string | null | undefined): UserRole | undefined {
  if (!raw) return undefined;
  if (raw === 'employee') return 'manager';
  if (raw === 'worker') return 'labor';
  return ALL_USER_ROLES.includes(raw as UserRole) ? (raw as UserRole) : undefined;
}

export interface MonthlyUsage {
  month: string; // "YYYY-MM" (UTC)
  count: number;
}

// ── ISO interconnection queue load per substation ─────────────────────
// Document shape in Firestore collection `substation_queue_load`, keyed by HIFLD ID.
// Written by scripts/queue-ingestion/write_to_firestore.py.

export type QueueIso = 'PJM' | 'MISO' | 'ERCOT' | 'SPP' | 'CAISO' | 'NYISO' | 'ISONE';

export type QueueFuel =
  | 'SOLAR'
  | 'WIND'
  | 'STORAGE'
  | 'HYBRID'
  | 'GAS'
  | 'NUCLEAR'
  | 'HYDRO'
  | 'COAL'
  | 'BIOMASS'
  | 'OIL'
  | 'GEOTHERMAL'
  | 'OTHER';

export interface QueueTopActive {
  name: string | null;
  mw: number;
  fuel: QueueFuel;
  cod: string | null;
}

/** Confirmed bucket — projects matched specifically to this substation
 *  (named match, voltage match, or line tap endpoint). Includes derived
 *  metrics (withdrawal rate, median time to COD). */
export interface QueueConfirmedBucket {
  active_count: number;
  active_mw: number;
  in_service_count: number;
  in_service_mw: number;
  withdrawn_count_5y: number;
  withdrawn_mw_5y: number;
  withdrawal_rate_5y: number | null; // 0–1, null if denominator <3
  median_time_to_cod_days: number | null; // null if <3 completed projects
  completed_sample_size: number;
  earliest_active_cod: string | null;
  top_active: QueueTopActive[];
}

/** Area bucket — projects we could only narrow to a county+voltage
 *  cluster of substations. Same data appears on every cluster member. */
export interface QueueAreaBucket {
  active_count: number;
  active_mw: number;
  in_service_count: number;
  in_service_mw: number;
  withdrawn_count_5y: number;
  withdrawn_mw_5y: number;
  earliest_active_cod: string | null;
  top_active: QueueTopActive[];
}

/** Cluster context — describes the county+voltage scope of the area bucket. */
export interface QueueAreaCluster {
  size: number | null; // # of substations sharing this area data
  county: string | null;
  voltage_kv: number | null;
}

export interface SubstationQueueLoad {
  hifld_id: number;
  iso: QueueIso;
  name: string | null;
  lat: number | null;
  lng: number | null;
  confirmed: QueueConfirmedBucket | null;
  area: QueueAreaBucket | null;
  area_cluster?: QueueAreaCluster;
  updated_at: string;
}

/** County-level queue aggregate. One doc per (state, county) with activity.
 *  Read by the Site Analyzer's County Power Queue section. */
export interface CountyQueueLoad {
  doc_id: string;
  state: string;
  county: string;
  iso: QueueIso | null;
  active_count: number;
  active_mw: number;
  in_service_count: number;
  in_service_mw: number;
  withdrawn_count_5y: number;
  withdrawn_mw_5y: number;
  withdrawal_rate_5y: number | null;
  median_time_to_cod_days: number | null;
  completed_sample_size: number;
  earliest_active_cod: string | null;
  /** % of active MW per fuel category (0–1). */
  fuel_mix: Partial<Record<QueueFuel, number>>;
  /** % of active MW per voltage class (key = voltage in kV as string). */
  voltage_mix: Record<string, number>;
  top_active: Array<QueueTopActive & { voltage_kv: number | null }>;
  updated_at: string;
}

export type ToolId =
  | 'grid-power-analyzer'
  | 'site-analyzer'
  | 'sales-crm'
  | 'sales-admin'
  | 'lead-builder'
  | 'crm'
  | 'construction-tracker'
  | 'construction-projects'
  | 'large-load-request'
  | 'well-finder'
  | 'documents'
  | 'todo-list'
  | 'market-intel'
  | 'one-line-generator'
  | 'whitepaper';

export const ALL_TOOL_IDS: ToolId[] = [
  'grid-power-analyzer',
  'site-analyzer',
  'sales-crm',
  'sales-admin',
  'lead-builder',
  'crm',
  'construction-tracker',
  'construction-projects',
  'large-load-request',
  'well-finder',
  'documents',
  'todo-list',
  'market-intel',
  'one-line-generator',
  'whitepaper',
];

export const TOOL_LABELS: Record<ToolId, string> = {
  'grid-power-analyzer': 'Grid Power Analyzer',
  'site-analyzer': 'Site Analyzer',
  'sales-crm': 'Leads',
  'sales-admin': 'Sales Dashboard',
  'lead-builder': 'Lead Builder',
  crm: 'Directory',
  'construction-tracker': 'Bailey Project',
  'construction-projects': 'Construction Projects',
  'large-load-request': 'Large Load Request',
  'well-finder': 'Well Finder',
  documents: 'Documents',
  'todo-list': 'To-Do List',
  'market-intel': 'Market Intelligence',
  'one-line-generator': 'One-Line Generator',
  whitepaper: 'Whitepaper',
};

// ── One-Line Generator ──────────────────────────────────────────────────
export const ONE_LINE_DIAGRAMS_COLLECTION = 'one-line-diagrams';

/** A saved one-line diagram: the input spec plus metadata. The SVG/.drawio
 *  are regenerated from `spec` on demand (engine in src/lib/oneLine), never
 *  stored, so a spec edit always yields a consistent drawing. */
export interface OneLineDocument {
  id: string;
  name: string;
  spec: OneLineSpec;
  /** Optional CRM company link (multi-tenant scoping). */
  companyId?: string;
  /** Optional Site Analyzer registry link the spec was seeded from. */
  siteRegistryId?: string;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  archivedAt?: number | null;
}

// ── Site Leads (public "Is my land powerable?" intake) ──────────────────────
export const SITE_LEADS_COLLECTION = 'site-leads';

export type SiteLeadStatus = 'submitted' | 'under-review' | 'qualified' | 'rejected';

/** A landowner submission from the public site-score form on the marketing site.
 *  Written server-side by the /api/public/site-score Worker endpoint (Firestore
 *  rules deny client create). Internal staff review these and promote the
 *  serious ones into the `leads` collection (Phase 2 tool). */
export interface SiteLead {
  id: string;
  // ── Public submission ──
  landownerName: string;
  phone: string;
  /** Raw address as typed (may be blank if the user gave coordinates). */
  address: string;
  lat: number;
  lng: number;
  acreage: number;
  hasPowerInfra: boolean;
  // ── Computed verdict (stamped at submit by the Worker) ──
  verdict: 'GO' | 'CONDITIONAL' | 'NO_GO';
  mwRange: { low: number; mid: number; high: number };
  nearestSubstation: string;
  // ── Internal workflow ──
  status: SiteLeadStatus;
  reviewedBy?: string;
  reviewNotes?: string;
  /** Set once promoted into the `leads` collection. */
  promotedToLeadId?: string;
  source: 'marketing-site';
  submittedFromIp?: string;
  createdAt: number;
  updatedAt: number;
}

// Backward-compat on read for renamed ToolIds. Translate stored values
// (allowedTools arrays in users docs, history entries) so older permissions
// keep working without a hard data migration:
//   - 'piddr' → 'site-analyzer' (original rename)
//   - 'pre-construction' → 'large-load-request' (2026-05-27 rename; the tool
//     tracks the LLR-to-LOA process with the utility, not the broader phase).
export function normalizeToolId(id: string): ToolId | undefined {
  if (id === 'piddr') return 'site-analyzer';
  if (id === 'pre-construction') return 'large-load-request';
  return ALL_TOOL_IDS.includes(id as ToolId) ? (id as ToolId) : undefined;
}

// ── Market Intelligence (data-center deal listener) ──────────────────────────
// One ingested news article in the `market-intel-feed` Firestore collection.
// Written server-side by the `refreshMarketIntel` Cloud Function (capture-only:
// no LLM extraction yet). `status` is the only client-mutable field — the
// ingest job never writes it, so re-ingesting a URL never resets read/archived.
// Light tags (usState/mwMentioned/dollarsMentioned) are pure-regex hints, not
// authoritative fields — seeds for the later structured-extraction phase.

export interface MarketFeedItem {
  id: string; // sha256 of normalized URL (dedup key + doc id)
  title: string;
  url: string;
  source: 'gdelt' | 'rss' | 'google-news';
  sourceName: string; // publisher / domain / feed name
  summary?: string;
  imageUrl?: string;
  publishedAt: number; // epoch ms
  ingestedAt: number;
  titleKey: string; // normalized title for near-dup clustering
  usState?: string;
  mwMentioned?: number;
  dollarsMentioned?: number;
  matchReason: string; // why the keyword filter kept it (debug aid)
  status?: 'new' | 'read' | 'archived'; // client-set; absent ⇒ treat as 'new'
  updatedAt: number;
}

// ── Collaborative To-Do List ────────────────────────────────────────────────
// Company task list (Firestore collection `user-tasks` — name kept for
// migration safety). Collaborative since v1.61.0: anyone can assign a task to
// anyone, and 'company'-visible tasks are readable/editable by every
// authenticated user (full-trust model, decided 2026-06-12). 'private' tasks
// stay owner+assignee only. Types are named Todo* to stay distinct from the
// construction Task tooling.

export type TodoStatus = 'todo' | 'doing' | 'done';
export type TodoPriority = 'low' | 'normal' | 'high';
export type TodoVisibility = 'company' | 'private';

// Categories mirror the company's business lines (+ Development for platform
// work, + Personal for non-work). Fixed enum on purpose — edit this one list to
// add/remove a category.
export type TodoCategory =
  | 'admin'
  | 'pre-construction'
  | 'construction'
  | 'rep'
  | 'oil-gas'
  | 'solar'
  | 'development'
  | 'personal';

export const ALL_TODO_STATUSES: TodoStatus[] = ['todo', 'doing', 'done'];

export const TODO_STATUS_LABELS: Record<TodoStatus, string> = {
  todo: 'To do',
  doing: 'In progress',
  done: 'Done',
};

export const ALL_TODO_CATEGORIES: TodoCategory[] = [
  'admin',
  'pre-construction',
  'construction',
  'rep',
  'oil-gas',
  'solar',
  'development',
  'personal',
];

export const TODO_CATEGORY_LABELS: Record<TodoCategory, string> = {
  admin: 'Admin',
  'pre-construction': 'Pre-Construction',
  construction: 'Construction',
  rep: 'REP',
  'oil-gas': 'Oil & Gas',
  solar: 'Solar',
  development: 'Development',
  personal: 'Personal',
};

// Hues chosen to read as distinct chips against the warm-neutral UI.
export const TODO_CATEGORY_COLORS: Record<TodoCategory, string> = {
  admin: '#6B7280', // slate-gray
  'pre-construction': '#2563EB', // blue
  construction: '#F59E0B', // amber
  rep: '#10B981', // emerald
  'oil-gas': '#B45309', // burnt orange
  solar: '#CA8A04', // gold (sun)
  development: '#7C3AED', // violet
  personal: '#EC4899', // pink
};

export const TODO_PRIORITY_LABELS: Record<TodoPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
};

export interface UserTask {
  id: string;
  ownerUid: string; // Firebase Auth uid — the creator (accountable for delegation)
  title: string;
  category: TodoCategory;
  status: TodoStatus;
  priority?: TodoPriority; // optional; treated as 'normal' when absent
  // Who's responsible for doing it. Absent on legacy (pre-collaboration) docs
  // — treated as assigned to the owner. Names are resolved live from the
  // `users` directory (userLabel), never cached here, so renames can't strand
  // stale labels on tasks.
  assigneeUid?: string;
  // Absent on legacy docs ⇒ 'private' (they were created under the owner-only
  // model; keeping them private is the safe migration default). New tasks
  // default to 'company', except the Personal category which defaults private.
  visibility?: TodoVisibility;
  dueDate?: number; // Unix ms — the task's single date ("Due"; past ⇒ overdue)
  /**
   * @deprecated Legacy "Do on" date. The UI merged the two task dates into the
   * single `dueDate` field; nothing writes this anymore. Kept only so older
   * tasks that carry it still place on the calendar / in the My Work sections,
   * via the `dueDate ?? scheduledDate` read-fallbacks.
   */
  scheduledDate?: number; // Unix ms — legacy planned day

  notes?: string; // optional free text
  createdAt: number; // Unix ms
  updatedAt: number; // Unix ms
  completedAt?: number; // Unix ms — stamped when status flips to 'done'
  // Soft archive (platform-wide no-hard-delete convention). `archived` is the
  // queryable boolean — Firestore can't filter on a missing field, so the
  // main subscription needs an explicit ==false to exclude the ever-growing
  // archive (scripts/migrate-user-tasks.mjs backfills legacy docs).
  // `archivedAt` carries the timestamp for display.
  archived?: boolean;
  archivedAt?: number; // Unix ms
}

/** Effective visibility for legacy docs that predate the field. */
export function effectiveTodoVisibility(task: UserTask): TodoVisibility {
  return task.visibility ?? 'private';
}

/** Effective assignee — legacy docs without the field belong to their owner. */
export function effectiveTodoAssignee(task: UserTask): string {
  return task.assigneeUid ?? task.ownerUid;
}

/** Default visibility for a newly created task of the given category. */
export function defaultTodoVisibility(category: TodoCategory): TodoVisibility {
  return category === 'personal' ? 'private' : 'company';
}

export const TODO_VISIBILITY_LABELS: Record<TodoVisibility, string> = {
  company: 'Company',
  private: 'Private',
};

// ── Well Finder enrichment ──────────────────────────────────────────────────

/**
 * Per-well enrichment, joined from RRC bulk sources by API# (8-char string).
 * Stored in Firestore collection `tx-wells-enriched`, keyed by API#.
 *
 * Source columns are denormalized so the UI can read a single doc per click
 * instead of doing joins. Fields are optional because not every well appears
 * in every source (IWAR only covers inactive wells, Orphan only orphan-listed,
 * etc.).
 */
export interface WellEnrichment {
  api: string; // 8-char API number, primary key

  // From IWAR (Inactive Well Aging Report)
  iwarOperator?: string;
  iwarOperatorP5?: string; // 6-digit operator P5 ID
  iwarCounty?: string;
  iwarDistrict?: string; // 2-digit RRC district code
  iwarFieldName?: string;
  iwarLeaseNumber?: string;
  iwarLeaseName?: string;
  iwarWellNumber?: string;
  iwarOilGasCode?: 'O' | 'G' | string;
  iwarDepthFt?: number;
  iwarShutInDate?: string; // YYYY-MM
  iwarOriginalCompletionDate?: string; // YYYY-MM-DD
  iwarInactiveYears?: number;
  iwarInactiveMonths?: number; // additional months past the years
  iwarP5OriginatingStatus?: string;
  iwarExtensionStatus?: string;
  iwarComplianceDueDate?: string; // YYYY-MM-DD if present
  iwarWellPlugged?: boolean;
  iwarPluggingCostEstimate?: number; // dollars

  // From Orphan Wells list
  orphanListed?: boolean;
  orphanOperator?: string;
  orphanOperatorP5?: string;
  orphanLeaseName?: string;
  orphanLeaseId?: string;
  orphanWellNumber?: string;
  orphanFieldName?: string;
  orphanCounty?: string;
  orphanDistrictName?: string;
  /** Months the operator has been P-5 inactive at the time of the report. */
  orphanMonthsP5Inactive?: number;

  // From Wellbore Query Data (Phase 2.5 — stub for now)
  wellboreOperator?: string;
  wellboreOperatorP5?: string;
  wellboreWellType?: string;
  wellboreTotalDepthFt?: number;
  wellboreCompletionDate?: string;

  // From P-5 Organization (Phase 2.5 — stub)
  operatorActive?: boolean; // true if P-5 not delinquent
  operatorSeveranceFlag?: boolean;

  // From PDQ Dump (Phase 3 — production rollups)
  prodFirstYearMonth?: string; // YYYY-MM of first non-zero production
  prodLastYearMonth?: string; // YYYY-MM of last non-zero production
  prodMonthsActive?: number; // count of months with any reportable volume

  prodLifetimeOilBbl?: number; // cumulative oil, well share (allocated)
  prodLifetimeGasMcf?: number;
  prodLifetimeCondBbl?: number; // condensate (gas leases)
  prodLifetimeCsgdMcf?: number; // casinghead gas (oil leases)

  prodFirst6moOilBblPerD?: number; // average daily rate over first 6 months
  prodFirst6moGasMcfPerD?: number;
  prodLast12moOilBblPerD?: number; // average daily rate over last 12 months pre-shutdown
  prodLast12moGasMcfPerD?: number;

  prodArpsQi?: number | null; // Arps initial rate (post-peak)
  prodArpsDi?: number | null; // Arps initial decline (per month)
  prodArpsB?: number | null; // Arps b exponent
  prodArpsEur?: number | null; // Estimated Ultimate Recovery (well share)

  prodAllocated?: boolean; // true if multi-well lease (volumes are 1/N split)
  prodWellsOnLease?: number; // total wells the lease total was split across

  // Reactivation score (computed during PDQ ingest finalize / backfill)
  score?: number; // 0-100
  scoreDisqualified?: boolean; // true if already plugged
  scoreProduction?: number; // component scores
  scoreOperator?: number;
  scoreCost?: number;
  scoreTime?: number;
  scoreUpdatedAt?: number; // Unix ms

  // Metadata
  ingestedAt: number; // Unix ms
  sources: string[]; // ['iwar', 'orphan', 'pdq', ...] which sources contributed
}

/** Firestore collection name for enriched wells. */
export const WELL_ENRICHMENT_COLLECTION = 'tx-wells-enriched';

// ── Well status changes (Phase 5) ──────────────────────────────────────────

export type WellChangeType = 'newly_shut_in' | 'newly_reactivated' | 'newly_plugged';

export interface WellChangeEvent {
  /** Doc ID format: `${api}_${changeType}_${snapshotMonth}`. */
  api: string;
  oldStatus: string;
  newStatus: string;
  changeType: WellChangeType;
  detectedAt: number; // Unix ms
  snapshotMonth: string; // YYYY-MM of the snapshot the change was found in
  previousSnapshotMonth: string; // YYYY-MM of the snapshot it was compared against
}

/** Firestore collection name for status-change events. */
export const WELL_CHANGES_COLLECTION = 'tx-well-changes';

// ── Power Infrastructure lookup types ───────────────────────────────────────

export interface NearbySubstation {
  name: string;
  owner: string;
  maxVolt: number; // kV
  minVolt: number; // kV
  status: string;
  lines: number; // number of connected lines
  distanceMi: number; // miles from site
  lat: number;
  lng: number;
  /** HIFLD substation id (ArcGIS `ID`) — joins to substation_queue_load. */
  hifldId?: number;
}

export interface NearbyLine {
  owner: string;
  voltage: number; // kV
  voltClass: string; // e.g. "100-161"
  sub1: string; // endpoint substation 1
  sub2: string; // endpoint substation 2
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
  zone: string; // e.g. "X", "A", "AE", "D"
  floodwayType: string;
  panelNumber: string;
}

export interface SolarWindResource {
  ghi: number; // Global Horizontal Irradiance (kWh/m²/day)
  dni: number; // Direct Normal Irradiance (kWh/m²/day)
  windSpeed: number; // m/s at hub height
  capacity: number; // estimated capacity factor %
}

export interface ElectricityPrice {
  commercial: number; // cents/kWh
  industrial: number; // cents/kWh
  allSectors: number; // cents/kWh
}

// ── Site data ───────────────────────────────────────────────────────────────

export interface SiteInputs {
  id: string;
  projectId: string; // Links to parent Project
  siteName: string;
  totalAcres: number;
  ppaLow: number; // $/acre low estimate
  ppaHigh: number; // $/acre high estimate
  mw: number; // 10-1000
  // Land / Property
  address: string;
  coordinates: string; // lat/long
  legalDescription: string;
  county: string;
  parcelId: string;
  owner: string;
  priorUsage: string; // prior usage / property type
  // Power Infrastructure (editable — may contain multiple values from overlapping territories)
  iso: string; // RTO/ISO (multiple joined with " / ")
  utilityTerritory: string; // May have multiple overlapping utilities
  tsp: string; // Transmission Service Provider
  // Power Infrastructure (lookup results — populated by Analyze)
  lastAnalyzedAt: number | null; // Timestamp of last infrastructure analysis
  nearestPoiName: string; // Nearest substation name (POI)
  nearestPoiDistMi: number; // Distance in miles
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
  currentValueLow: number; // acres × ppaLow
  currentValueHigh: number; // acres × ppaHigh
  energizedValue: number; // mw × $3M
  valueCreated: number; // energizedValue - midpoint currentValue
  returnMultiple: number; // energizedValue / midpoint currentValue
}

export interface SavedSite {
  id: string;
  inputs: SiteInputs;
  createdAt: number;
  updatedAt: number;
}

// ── Broadband lookup types ────────────────────────────────────────────────

export type TechnologyType = 'Fiber' | 'Cable' | 'DSL' | 'Fixed Wireless' | 'Satellite' | 'Other';

/**
 * FCC BDC technology code → display name mapping.
 * Codes per FCC Broadband Data Collection spec.
 */
export const TECH_CODE_MAP: Record<number, TechnologyType> = {
  10: 'DSL', // Copper Wire
  40: 'Cable', // Coaxial Cable / HFC
  50: 'Fiber', // Optical Carrier / Fiber to the Premises
  60: 'Satellite', // Geostationary Satellite (GSO) — e.g. HughesNet, Viasat
  61: 'Satellite', // Non-Geostationary Satellite (NGSO) — e.g. Starlink
  70: 'Fixed Wireless', // Unlicensed Terrestrial Fixed Wireless
  71: 'Fixed Wireless', // Licensed Terrestrial Fixed Wireless
  72: 'Fixed Wireless', // Licensed-by-Rule Terrestrial Fixed Wireless
  0: 'Other',
};

export type ConnectivityTier = 'Served' | 'Underserved' | 'Unserved';

export interface BroadbandProvider {
  providerName: string;
  technology: TechnologyType;
  techCode: number;
  maxDown: number; // Mbps
  maxUp: number; // Mbps
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
  geoid: string; // GEOID of the nearby census block
  distanceMi: number; // Haversine distance from site to block centroid
  providers: BroadbandProvider[]; // Terrestrial providers (Fiber + Cable + Fixed Wireless)
  fiberAvailable: boolean; // Does this block have fiber?
  cableAvailable: boolean; // Does this block have cable?
  fixedWirelessAvailable: boolean; // Does this block have fixed wireless?
}

export interface BroadbandResult {
  // Location info (from geo.fcc.gov)
  fips: string; // 15-char census block FIPS
  countyFips: string; // 5-char county FIPS
  countyName: string;
  stateCode: string; // 2-letter
  stateName: string;

  // Provider data (from ArcGIS FCC BDC — block level)
  providers: BroadbandProvider[];
  totalProviders: number;
  fiberAvailable: boolean;
  cableAvailable: boolean;
  fixedWirelessAvailable: boolean;
  maxDownload: number; // best available Mbps
  maxUpload: number; // best available Mbps

  // County-wide providers (from ArcGIS FCC BDC — county level)
  countyProviders: BroadbandProvider[];

  // Nearby fiber routes (from ArcGIS spatial query)
  nearbyFiberRoutes: NearbyFiberRoute[];

  // Nearby service blocks (populated when fiber/cable unavailable and adjacent blocks have them)
  nearbyServiceBlocks?: NearbyServiceBlock[];

  // Distance to nearest fiber in county (wider search, populated when fiber not on site or nearby)
  nearestCountyFiberMi?: number | null;

  // Distance to nearest cable in county (wider search, populated when cable not on site or nearby)
  nearestCountyCableMi?: number | null;

  // Classification
  tier: ConnectivityTier;

  // Utility territory (reused from power infra)
  iso: string;
  utilityTerritory: string[];

  // FCC map deep links
  fccMapUrl: string;

  // Per-section errors
  providersError: string | null;
  fiberError: string | null;

  // Timestamp
  analyzedAt: number;
}

// ── Sales CRM types ──────────────────────────────────────────────────────

export type LeadStatus = 'new' | 'call_1' | 'email_sent' | 'call_2' | 'call_3' | 'won' | 'lost';

export const LEAD_STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; color: string; order: number }
> = {
  new: { label: 'New Lead', color: '#3B82F6', order: 0 },
  call_1: { label: 'Call 1', color: '#F59E0B', order: 1 },
  email_sent: { label: 'Email Sent', color: '#8B5CF6', order: 2 },
  call_2: { label: 'Call 2', color: '#F97316', order: 3 },
  call_3: { label: 'Final Call', color: '#EF4444', order: 4 },
  won: { label: 'Won', color: '#10B981', order: 5 },
  lost: { label: 'Lost', color: '#6B7280', order: 6 },
};

export const ACTIVE_LEAD_STATUSES: LeadStatus[] = [
  'new',
  'call_1',
  'email_sent',
  'call_2',
  'call_3',
];
export const ARCHIVED_LEAD_STATUSES: LeadStatus[] = ['won', 'lost'];

// ── Lead Builder enums (optional on Lead; absent on legacy/manual/CSV leads) ──
export type LeadTier = 'GIANT' | 'BIG' | 'MID' | 'SMALL';
export type LeadSource = 'lead-builder' | 'manual' | 'csv';
export type MobileStatus = 'none' | 'pending' | 'revealed' | 'failed';
export type ContactRoute = 'owner_operator' | 'find_tenant_by_address';

export interface LeadNote {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: number;
}

// Rep-added supplementary contact (the canonical Apollo decision-maker on the
// Lead stays read-only; reps append the real people they reach here).
export interface LeadContact {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
}

// Rep-added alternate phone number (a gatekeeper line, a cell they were given…).
export interface LeadAltPhone {
  id: string;
  label: string; // e.g. "Front desk", "Cell"
  number: string;
}

// Uploaded document slot category. Bill + Contract are the two milestones in the
// brokerage flow; Other is a catch-all (site photo, prior bill, etc.).
export type LeadDocumentCategory = 'bill' | 'contract' | 'other';

export interface LeadDocument {
  id: string;
  category: LeadDocumentCategory;
  name: string; // original filename (user-facing)
  contentType: string;
  sizeBytes: number;
  storagePath: string; // leads/{leadId}/{id}-{safeName}
  uploadedAt: number;
  uploadedBy: string; // Firebase UID
  uploadedByName: string;
}

export interface Lead {
  id: string;
  assignedTo: string; // Firebase UID
  assignedToName: string; // Display name / email of assigned user
  businessName: string;
  phone: string;
  email: string;
  description: string; // short description of the business
  decisionMakerName: string;
  decisionMakerRole: string;
  status: LeadStatus;
  // ── Lead Builder enrichment (optional; absent on legacy/manual/CSV leads) ──
  source?: LeadSource;
  sourcePipelineId?: string; // lead-pipeline-companies doc this was promoted from
  tier?: LeadTier;
  energyIntensity?: 'high' | 'medium' | 'low';
  operatingCompany?: string; // resolved operating business (may differ from businessName)
  website?: string;
  linkedinUrl?: string;
  apolloPersonId?: string;
  // ── Location (carried from Lead Builder on promotion; absent on legacy/manual leads) ──
  parcelAddress?: string; // street address of the parcel
  mailingAddress?: string; // owner mailing address (often differs from parcel)
  city?: string;
  state?: string;
  // ── Rep-added supplementary info (enriched fields above stay canonical) ──
  additionalContacts?: LeadContact[];
  altPhones?: LeadAltPhone[];
  documents?: LeadDocument[];
  // On-demand "grab number" mobile reveal:
  mobilePhone?: string;
  mobileStatus?: MobileStatus;
  phoneRequestId?: string; // Apollo async request id; correlates the webhook callback
  notes: LeadNote[];
  createdAt: number;
  updatedAt: number;
}

// ── Lead Builder pipeline ────────────────────────────────────────────────
export const LEAD_PIPELINE_COMPANIES_COLLECTION = 'lead-pipeline-companies';
export const LEAD_PIPELINE_JOBS_COLLECTION = 'lead-pipeline-jobs';

export type LeadPipelineStage =
  | 'ingested'
  | 'perplexity_pending'
  | 'perplexity_done'
  | 'dropped_perplexity'
  | 'needs_review'
  | 'apollo_pending'
  | 'apollo_done'
  | 'dropped_apollo'
  | 'qualified'
  | 'promoted';

/** One company moving through the lead-gen pipeline (admin-only working data;
 *  promoted into the `leads` collection once qualified + reviewed). */
export interface LeadPipelineCompany {
  id: string; // deterministic: `${state}_${county}_${swis}_${printKey}` or normalized name
  jobId: string;
  county: string;
  state: string;
  stage: LeadPipelineStage;
  // Stage 1 — tax roll (classifier output):
  taxOwner: string;
  parcelAddress: string;
  mailingAddress: string;
  city: string;
  propertyClasses: string; // e.g. "710|714"
  classDesc: string;
  marketValue: number;
  nParcels: number;
  tier: LeadTier;
  contactRoute: ContactRoute;
  // Stage 2 — Perplexity:
  operatingCompany?: string;
  website?: string;
  description?: string;
  industry?: string;
  naics?: string;
  energyIntensity?: 'high' | 'medium' | 'low';
  pplxStatus?: 'active' | 'closed' | 'moved' | 'unknown';
  pplxConfidence?: 'high' | 'medium' | 'low';
  // Stage 3 — Apollo:
  apolloOrgId?: string;
  apolloPersonId?: string;
  decisionMaker?: string;
  decisionMakerTitle?: string;
  email?: string;
  linkedinUrl?: string;
  orgPhone?: string; // company main line from Apollo org-enrich (used as the lead phone)
  qualified?: boolean;
  // Promotion + bookkeeping:
  promotedLeadId?: string;
  dismissed?: boolean; // human rejected it from review → sits in Dropped
  // Set at ingest when the parcel's municipality is a public-power (municipal or
  // co-op) system: the customer can't choose an electricity supplier, so there's
  // nothing to broker. Routed to Dropped with this reason instead of enriched.
  ineligibleReason?: string;
  stageError?: string;
  createdAt: number;
  updatedAt: number;
}

export type LeadPipelineJobStatus =
  | 'ingesting'
  | 'awaiting_perplexity_approval'
  | 'enriching_perplexity'
  | 'awaiting_apollo_approval'
  | 'enriching_apollo'
  | 'review'
  | 'done'
  | 'error';

export interface LeadPipelineJob {
  id: string;
  county: string;
  state: string;
  requestedBy: string;
  status: LeadPipelineJobStatus;
  counts: Partial<Record<LeadPipelineStage, number>>;
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

/**
 * Site Analyzer section keys that participate in the lock model.
 * Overview (no fetch) and Valuation (instant compute that follows the MW
 * slider) deliberately omitted.
 */
export const LOCKABLE_SECTION_KEYS = [
  'power',
  'broadband',
  'transport',
  'water',
  'gas',
  'labor',
  'political',
] as const;

export type LockableSectionKey = (typeof LOCKABLE_SECTION_KEYS)[number];

export type SectionLocks = Partial<Record<LockableSectionKey, boolean>>;

export interface SiteRegistryEntry {
  id: string;
  name: string;
  address: string;
  coordinates: { lat: number; lng: number } | null;
  acreage: number;
  mwCapacity: number;
  /**
   * Optional manual ramp: MW *added* each year (e.g. [150, 100, 70] → 150
   * online year 1, 250 by year 2, 320 by year 3). When present and non-empty,
   * it overrides the auto-computed ramp on the Executive Summary. Absent ⇒ auto.
   */
  customRamp?: number[];
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
  /** Human-confirmed serving retail/distribution utility. Top-level (not inside
   *  infraResult) so re-running analysis never overwrites the human's choice. */
  retailUtilityConfirmedName?: string | null;
  broadbandResult?: BroadbandResult | null;
  waterResult?: Record<string, unknown> | null;
  gasResult?: Record<string, unknown> | null;
  transportResult?: Record<string, unknown> | null;
  laborResult?: Record<string, unknown> | null;
  politicalResult?: Record<string, unknown> | null;
  landComps?: LandComp[];
  piddrGeneratedAt?: number | null;

  /**
   * Per-section "lock" — when true, that section's data is preserved on the
   * next "Run Analysis" press (the orchestrator passes the existing payload
   * through and skips the refetch). Locked sections still render normally;
   * users unlock individual sections to re-run them, or "unlock all" to
   * re-run everything. Sections auto-lock as they complete a run.
   *
   * Only the API-fetched sections need locks — Overview is read-only and
   * Valuation is an instant pure compute that recalculates with the MW
   * slider, so neither carries a lock.
   */
  sectionLocks?: SectionLocks;

  // Due diligence fields (transferred from Site Appraiser)
  /**
   * @deprecated Merged into `zoning` ("Zoning / Land Use") 2026-06-22. No longer
   * editable or shown in the UI; legacy values are preserved in Firestore but read
   * nowhere. Do not reintroduce a separate Prior Usage / Property Type field.
   */
  priorUsage?: string;
  /** Zoning / Land Use classification (operator-entered, from LandID). Single
   *  combined land field — drives the Executive Summary "Clear to build" tile. */
  zoning?: string;
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
  siteRegistryId?: string; // linked registry site, if any
  siteName: string;
  siteAddress: string;
  action: string; // e.g. "Ran site analysis", "Ran broadband lookup", "Computed land valuation"
  inputs?: Record<string, unknown>; // tool-specific inputs for replay
  createdAt: number;
  /**
   * Explicit event kind for the activity mirror. Older entries omit this and
   * are treated as 'tool-run' by the trigger.
   */
  kind?: 'login' | 'view' | 'tool-run' | 'export';
  /** Client session fingerprint captured when the entry was written. */
  session?: { ip?: string; userAgent?: string; timezone?: string };
  /** Route path that produced the entry (view events). */
  routePath?: string;
  /** Human label for the route (e.g. "CRM Company"). */
  routeLabel?: string;
  /** When the view targets a specific resource, the resource type label. */
  viewResourceType?: string;
  viewResourceId?: string;
  viewResourceLabel?: string;
}

// ── CRM ──────────────────────────────────────────────────────────────────

// Customer tags describe the *activity or relationship* with a customer
// (REP work, Construction work, Pre-Construction phase, Utility role) — not
// the software tools we use. The tool that tracks the Pre-Construction phase
// was renamed to "Large Load Request" on 2026-05-27, but the customer-side
// tag intentionally stays as "Pre Construction" because it categorizes a
// business phase, not a workflow / tool.
export type CompanyTag = 'REP' | 'Construction' | 'Pre Construction' | 'Utility';

export const ALL_COMPANY_TAGS: CompanyTag[] = [
  'REP',
  'Construction',
  'Pre Construction',
  'Utility',
];

export const COMPANY_TAG_COLORS: Record<CompanyTag, string> = {
  REP: '#10B981', // emerald
  Construction: '#F59E0B', // amber
  'Pre Construction': '#3B82F6', // blue
  Utility: '#8B5CF6', // violet
};

/** States in which R&B Power currently tracks customer licenses. Free-form
 * license numbers per state — no validation, format varies by board. */
export const LICENSE_STATES = ['OK', 'TX', 'AZ', 'NM', 'TN'] as const;
export type LicenseState = (typeof LICENSE_STATES)[number];

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
  /** Lowercased + trimmed mirror of `name`, used for indexed dedup queries.
   *  Always written alongside `name` by saveCompany / updateCompanyFields. */
  name_lower?: string;
  location: string; // "City, ST" free text, e.g. "Houston, TX"
  website?: string;
  ein?: string;
  tags: CompanyTag[];
  note?: string;
  licenses?: Partial<Record<LicenseState, string>>;
  createdAt: number;
  updatedAt: number;
  createdBy: string; // userId
}

/** One person ↔ one customer link. Title is per-link (David is "Owner" at
 *  customer A and "Advisor" at customer B). Exactly one affiliation per
 *  contact should carry `isPrimary: true`; the normalizer enforces this. */
export interface ContactAffiliation {
  companyId: string;
  title?: string;
  isPrimary?: boolean;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  affiliations: ContactAffiliation[]; // ≥1 expected; one is primary
  /** Denormalized mirror of `affiliations.map(a => a.companyId)` so we can
   *  use `where('companyIds', 'array-contains', X)` queries. Maintained by
   *  the save layer; do not edit directly. */
  companyIds: string[];
  email?: string;
  phone?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Documents ────────────────────────────────────────────────────────────

export type DocumentCategory =
  | 'legal' // NDA, disclosure agreements
  | 'invoice' // invoices, receipts
  | 'contract' // proposals, agreements, executed contracts
  | 'deliverable' // allocation letters, one-line diagrams, reports, final outputs
  | 'photo' // site photos
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
  legal: 'Legal',
  invoice: 'Invoices',
  contract: 'Contracts',
  deliverable: 'Deliverables',
  photo: 'Photos',
  other: 'Other',
};

export interface CrmDocument {
  id: string;
  companyId: string;
  category: DocumentCategory;
  name: string; // user-visible filename
  contentType: string; // MIME type
  sizeBytes: number;
  storagePath: string; // "crm-documents/{companyId}/{documentId}-{sanitized-name}"
  uploadedAt: number;
  uploadedBy: string; // userId
  uploadedByName: string; // cached display name
}

// ── Construction Tracker ────────────────────────────────────────────────

export type ConstructionJobStatus = 'planning' | 'active' | 'on-hold' | 'completed' | 'cancelled';

export const ALL_CONSTRUCTION_JOB_STATUSES: ConstructionJobStatus[] = [
  'planning',
  'active',
  'on-hold',
  'completed',
  'cancelled',
];

export const CONSTRUCTION_JOB_STATUS_LABELS: Record<ConstructionJobStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  'on-hold': 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const CONSTRUCTION_JOB_STATUS_COLORS: Record<ConstructionJobStatus, string> = {
  planning: '#3B82F6', // blue
  active: '#10B981', // emerald
  'on-hold': '#F59E0B', // amber
  completed: '#6B7280', // gray
  cancelled: '#EF4444', // red
};

export interface ConstructionJob {
  id: string;
  name: string; // Project name

  // Companies — owners/GCs and subcontractors. linkedCompanyIds is the union
  // mirror (every id from companyIds + subcontractorIds) so the company-profile
  // panel can find jobs with a single Firestore array-contains query.
  companyIds: string[]; // Owners / General Contractors linked to the job (≥1 required)
  subcontractorIds: string[]; // Subcontractors, optional
  linkedCompanyIds: string[]; // Mirror — derived; do not edit directly

  // Team
  projectSupervisorIds: string[]; // Firebase UIDs of supervisors (≥1 required)
  projectManagerContactIds: string[]; // CRM contact IDs of project managers (optional, 0+)
  workerIds: string[]; // Firebase UIDs of assigned workers

  // Lifecycle
  status: ConstructionJobStatus;
  startDate?: number; // Unix ms
  expectedEndDate?: number;
  actualEndDate?: number;

  // Optional details
  address?: string;
  budget?: number; // USD
  description?: string;

  // Metadata
  createdAt: number;
  updatedAt: number;
  createdBy: string; // Firebase UID of creator
}

/** Per-job permission level, derived from membership at runtime — not stored. */
export type ConstructionJobLevel = 'admin' | 'pm' | 'worker' | 'none';

// ── Construction Tracker · Tasks ────────────────────────────────────────

export type JobTaskStatus = 'todo' | 'in-progress' | 'done';

export const ALL_JOB_TASK_STATUSES: JobTaskStatus[] = ['todo', 'in-progress', 'done'];

export const JOB_TASK_STATUS_LABELS: Record<JobTaskStatus, string> = {
  todo: 'To do',
  'in-progress': 'In progress',
  done: 'Done',
};

/** Sub-collection: construction-jobs/{jobId}/tasks/{taskId} */
export interface JobTask {
  id: string;
  jobId: string; // denormalized for queries / rules
  title: string;
  status: JobTaskStatus;

  assigneeId?: string; // Firebase UID of user this is assigned to
  dueDate?: number; // Unix ms
  completedAt?: number; // Unix ms — stamped when status flips to 'done'
  notes?: string;

  // Hierarchy. One level only — a subtask's parentTaskId always points to a
  // top-level task (no grandchildren). Top-level tasks have parentTaskId undefined.
  parentTaskId?: string;

  // Manual ordering within siblings. Spaced (1000, 2000, …) so DnD insertions
  // can pick a midpoint without renumbering. Pre-DnD tasks may have order=0;
  // sort falls back to createdAt for ties.
  order?: number;

  createdAt: number;
  updatedAt: number;
  createdBy: string; // Firebase UID
}

// ── Construction Tracker · Documents (retired 2026-06-19) ───────────────

/** Job-scoped document categories. The category-based `JobDocumentsSection`
 *  UI, its hook, and `constructionDocuments.ts` were retired on 2026-06-19 —
 *  the folder system (`FolderBrowser`) is the only document surface now. This
 *  enum is kept solely because `DocumentRecord.legacyCategory` still carries
 *  it for documents migrated out of the old per-job `documents` subcollection. */
export type JobDocumentCategory =
  | 'permit'
  | 'plan'
  | 'contract'
  | 'invoice'
  | 'inspection'
  | 'safety'
  | 'other';

// ── Construction Tracker · Photos ───────────────────────────────────────

/** Sub-collection: construction-jobs/{jobId}/photos/{photoId}.
 *  Each upload produces two JPEGs: a 2000px "full" used in the lightbox and a
 *  400px "thumb" used in the grid. Both live in Firebase Storage. */
export interface JobPhoto {
  id: string;
  jobId: string;
  fullPath: string; // Storage path for the 2000px JPEG
  thumbPath: string; // Storage path for the 400px JPEG
  fullUrl: string; // Pre-resolved download URL (cheaper than re-fetching every render)
  thumbUrl: string;
  contentType: string; // Always 'image/jpeg' after our pipeline
  sizeBytes: number; // Combined size of full + thumb, for accounting
  width: number; // Full-size dimensions in pixels (post-resize)
  height: number;
  caption?: string;
  uploadedBy: string; // Firebase UID
  uploadedByEmail?: string; // Denormalized for the gallery hover label
  uploadedAt: number; // Unix ms
}

// ── Folder & Document System (v2 — supersedes flat-category crm-documents) ──

/** Firestore collection names for the new folder/document system. Centralized
 *  so a future rename (e.g., reclaiming the legacy `projects` collection name)
 *  is a one-line change. */
export const FOLDERS_COLLECTION = 'folders';
export const DOCUMENTS_COLLECTION = 'documents';
/** Named `customer-projects` (not `projects`) to avoid collision with the
 *  legacy `projects` collection (AUDIT M-1, slated for deletion). Once that
 *  legacy collection is purged we can flip this to `projects`. */
export const CUSTOMER_PROJECTS_COLLECTION = 'customer-projects';

/** System-provisioned folder roles. Auto-created on project provisioning. */
export type SystemFolderRole =
  | 'pre-con-root' // Customer-root container for all pre-con projects
  | 'construction-root' // Customer-root container for all construction projects
  | 'rep-root' // Customer-root container for all REP projects
  | 'project-root'; // The project's own root folder (under one of the *-root folders above)

export type ProjectType = 'pre-con' | 'construction' | 'rep';

export const ALL_PROJECT_TYPES: ProjectType[] = ['pre-con', 'construction', 'rep'];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  'pre-con': 'Large Load Request',
  construction: 'Construction',
  rep: 'REP',
};

export type ProjectStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export const ALL_PROJECT_STATUSES: ProjectStatus[] = ['active', 'paused', 'completed', 'cancelled'];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** A folder in the customer-rooted folder tree. Every folder belongs to a
 *  customer (`companyId`); a folder may additionally belong to a project
 *  (`projectId`) when it lives inside that project's subtree. Nesting is
 *  expressed via `parentFolderId`, with `ancestorFolderIds` denormalized for
 *  efficient subtree queries and `array-contains` rule checks. */
export interface Folder {
  id: string;
  companyId: string; // The customer this folder belongs to
  projectId?: string; // Set if this folder lives inside a project subtree
  parentFolderId: string | null; // null = customer root (or project root)
  ancestorFolderIds: string[]; // Denormalized path, every ancestor folderId
  name: string;
  position: number; // Manual sort order within parent; sparse multiples of 1000
  kind: 'system' | 'user'; // system = auto-provisioned, user = created by a person
  systemRole?: SystemFolderRole;
  templateOrigin?: string; // Future: id of the folder template that seeded this
  createdAt: number;
  createdBy: string; // Firebase UID
  updatedAt: number;
  updatedBy: string;
  archivedAt?: number;
  archivedBy?: string;
  archivedReason?: string;
  // Access control (see plan §7) — null/empty list inherits from parent;
  // admins always pass regardless of list contents.
  viewerUserIds?: string[];
  editorUserIds?: string[];
}

/** A document filed in the new folder system. Replaces `crm-documents` and
 *  `construction-jobs/{}/documents` over migration. Storage blob is immutable
 *  once written — renames only touch the `name` field, not `storagePath`. */
export interface DocumentRecord {
  id: string;
  companyId: string;
  projectId?: string;
  folderId: string | null; // null = at customer root (not inside any folder)
  ancestorFolderIds: string[]; // Denormalized ancestry of the doc's folder
  name: string; // User-visible filename
  mimeType: string;
  byteSize: number;
  storagePath: string; // Immutable; format: `documents/{companyId}/{documentId}-{sanitized}`
  storageGeneration?: string; // Firebase Storage generation hash, for safety
  uploadedAt: number;
  uploadedBy: string;
  updatedAt: number;
  updatedBy: string;
  archivedAt?: number;
  archivedBy?: string;
  archivedReason?: string;
  /** Pre-migration `category` value preserved as a chip in the UI when
   *  meaningful. Null for docs created post-migration. */
  legacyCategory?: DocumentCategory | JobDocumentCategory;
  viewerUserIds?: string[];
  editorUserIds?: string[];
}

/** Project lifecycle record. Each project auto-provisions a folder skeleton
 *  under its customer. Construction Tracker jobs migrate into this shape with
 *  `type='construction'`. */
export interface Project {
  id: string;
  companyId: string; // The customer owning this project (v1: singular)
  type: ProjectType;
  name: string;
  status: ProjectStatus;
  rootFolderId: string; // The auto-provisioned `project-root` folder for this project
  startDate?: number;
  endDate?: number;
  parentProjectId?: string; // pre-con → construction → REP lineage (ADR-003)
  siteId?: string; // Optional Site Analyzer site linkage
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
  archivedAt?: number;
  archivedBy?: string;
}

// ── Pre-Construction Tool ────────────────────────────────────────────────

/** Firestore collection for Pre-Construction sites. */
export const PRECON_SITES_COLLECTION = 'preconstruction-sites';

/** GO / CONDITIONAL GO / NO GO grade for a pre-con site. */
export type PreConGrade = 'go' | 'conditional-go' | 'no-go';

export const ALL_PRECON_GRADES: PreConGrade[] = ['go', 'conditional-go', 'no-go'];

export const PRECON_GRADE_LABELS: Record<PreConGrade, string> = {
  go: 'GO',
  'conditional-go': 'CONDITIONAL GO',
  'no-go': 'NO GO',
};

export const PRECON_GRADE_COLORS: Record<PreConGrade, string> = {
  go: '#10B981', // emerald
  'conditional-go': '#F59E0B', // amber
  'no-go': '#EF4444', // red
};

/** Engineer review lifecycle. */
export type PreConEngineerStatus = 'not-requested' | 'requested' | 'approved' | 'rejected';

export const PRECON_ENGINEER_STATUS_LABELS: Record<PreConEngineerStatus, string> = {
  'not-requested': 'Not requested',
  requested: 'Awaiting engineer',
  approved: 'Engineer approved',
  rejected: 'Engineer rejected',
};

/** LOA process status. Generic template for v1; per-utility templates may be
 *  added later by overlaying additional statuses in `LOA_TIMELINES`. */
export type PreConLoaStatus =
  | 'not-started'
  | 'contact-utility'
  | 'project-manager'
  | 'engineer-packet'
  | 'packet-to-ercot'
  | 'letter-of-allocation'
  | 'loa-executed' // terminal: LOA received/executed. Not a rendered timeline step —
  // it just flips the final "Letter of Allocation" milestone from red (awaiting)
  // to a green check (complete). See PreConLoaTimeline.
  | 'rejected';

export const ALL_PRECON_LOA_STATUSES: PreConLoaStatus[] = [
  'not-started',
  'contact-utility',
  'project-manager',
  'engineer-packet',
  'packet-to-ercot',
  'letter-of-allocation',
  'loa-executed',
  'rejected',
];

export const PRECON_LOA_STATUS_LABELS: Record<PreConLoaStatus, string> = {
  'not-started': 'Not started',
  'contact-utility': 'Contact utility',
  'project-manager': 'Project manager assigned',
  'engineer-packet': 'Engineer packet',
  'packet-to-ercot': 'Packet sent to grid operator',
  'letter-of-allocation': 'Letter of Allocation',
  'loa-executed': 'LOA executed',
  rejected: 'Rejected',
};

/** Serving utility for LOA. Free-form name in `loaUtilityName` when the user
 *  picks `coop` or `other`. */
export type PreConUtility = 'oncor' | 'aep' | 'coop' | 'other';

export const ALL_PRECON_UTILITIES: PreConUtility[] = ['oncor', 'aep', 'coop', 'other'];

export const PRECON_UTILITY_LABELS: Record<PreConUtility, string> = {
  oncor: 'Oncor',
  aep: 'AEP',
  coop: 'Cooperative',
  other: 'Other',
};

/** Single entry in the LOA audit trail. */
export interface PreConLoaStep {
  status: PreConLoaStatus;
  enteredAt: number; // Unix ms
  enteredBy: string; // Firebase UID
}

/** Status of a single document in a request's submission checklist. */
export type PreConChecklistItemStatus = 'missing' | 'provided';

/** Per-site status for one checklist item. */
export interface PreConChecklistEntry {
  status: PreConChecklistItemStatus;
  updatedAt: number; // Unix ms
  updatedBy: string; // Firebase UID
}

/** Pre-construction site record. One per coordinate + customer combination. */
export interface PreConSite {
  id: string;
  companyId: string; // FK → crm-companies
  name: string;
  coordinates: { lat: number; lng: number };
  siteRegistryId: string; // FK → sites-registry (where the appraisal lives)
  projectId?: string; // FK → customer-projects (type='pre-con')
  rootFolderId?: string; // FK → folders (system, kind='system')

  // Grading
  grade?: PreConGrade;
  gradeSuggested?: PreConGrade; // auto-suggested from appraisal metrics
  gradedAt?: number;
  gradedBy?: string;

  // Engineer review
  engineerReviewStatus: PreConEngineerStatus;
  engineerReviewerId?: string; // Firebase UID of assigned engineer
  engineerVerifiedMW?: number;
  engineerRequestedAt?: number;
  engineerCompletedAt?: number;

  // LOA — utility-specific templates are a future addition; today everyone
  // uses the generic timeline so we don't store a utility selection.
  loaStatus: PreConLoaStatus;
  loaSteps: PreConLoaStep[];
  /** Per-step display date (Unix ms). Pre-populated on site creation from
   *  `createdAt + LOA_STEP_DEFAULT_OFFSETS_DAYS[step]`, then user-editable inline
   *  in the timeline. Separate from `loaSteps[]` (which is the append-only
   *  audit trail of every status transition) — this map is the canonical
   *  "when did/will this step happen" used for display only. */
  loaStepDates?: Partial<Record<PreConLoaStatus, number>>;

  // External links
  /** Optional URL to the utility's customer portal / project-tracking page.
   *  Rendered as "Access utility platform" hyperlink on the site header. */
  utilityPlatformUrl?: string;

  /** Which utility's submission requirements apply to this request. Drives the
   *  document checklist (and, later, the LOA timeline). Unset → treated as Oncor. */
  utility?: PreConUtility;

  /** Per-item status for the utility submission document checklist, keyed by
   *  PreConChecklistItem.id. Absent entries are treated as "missing". */
  documentChecklist?: Record<string, PreConChecklistEntry>;

  // Metadata
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  archivedAt?: number;
}
