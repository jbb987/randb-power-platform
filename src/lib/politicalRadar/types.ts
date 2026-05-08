/**
 * Political Radar — site-level political risk model.
 *
 * Five layers (this v1 ships Federal only; the other four are stubs):
 *   1. Federal       — bills, EOs, RTO/FERC jurisdiction, tribal, court
 *   2. State         — TBD
 *   3. County        — TBD
 *   4. City          — TBD
 *   5. Sub-municipal — TBD
 */

/** Status reflects whether we actually have data, not whether the news is good. */
export type SignalStatus =
  | 'confirmed_clean' // we checked, found nothing threatening
  | 'positive' // signal exists and is favorable to a DC project
  | 'watch' // mild risk
  | 'elevated' // material risk
  | 'critical' // project-killing risk
  | 'unknown' // data fetch failed or pre-fetch
  | 'checking'; // in flight (UI-only)

/** Score band for a layer or the combined score. */
export type RiskBand = 'clean' | 'watch' | 'elevated' | 'critical' | 'unknown';

/** Single signal row inside a layer. */
export interface PoliticalSignal {
  key: string;
  label: string;
  status: SignalStatus;
  /** One-line summary of the finding (or the reason it's unknown). */
  summary: string;
  /** Optional structured details rendered in the "why" expandable. */
  detail?: string;
}

// ── Federal layer ────────────────────────────────────────────────────────

export type RtoCode = 'ERCOT' | 'PJM' | 'MISO' | 'CAISO' | 'NYISO' | 'ISO-NE' | 'SPP' | 'NONE';

export interface FederalBill {
  congress: number;
  type: string; // 'S', 'HR', 'HJRES', etc.
  number: string; // bill number, e.g. '4214'
  title: string;
  status: string; // 'Introduced' | 'Committee' | 'Passed Chamber' | 'Enacted' | 'Vetoed' | other text
  latestActionDate: string | null; // ISO date
  url: string; // congress.gov human URL
}

export interface FederalEO {
  documentNumber: string;
  title: string;
  signingDate: string | null; // ISO date
  citation: string;
  url: string;
  /** UX hint — most current EOs are favorable to DC siting. */
  posture: 'favorable' | 'unfavorable' | 'neutral';
}

export interface CongressionalRep {
  bioguideId: string | null;
  name: string;
  party: 'R' | 'D' | 'I' | 'Other' | null;
  chamber: 'house' | 'senate';
  state: string;
  district?: string; // House only
  email?: string;
  phone?: string;
  url?: string;
  /** Energy / Commerce / Natural Resources / Environment, etc. — best-effort match. */
  energyCommittees: string[];
}

export interface RtoJurisdiction {
  rto: RtoCode;
  /**
   * True if the site's RTO is FERC-jurisdictional (everything except ERCOT).
   * ERCOT is intra-Texas and outside FERC rate jurisdiction — surfaced as a
   * positive (lower threat) signal.
   */
  ferc: boolean;
  /** Brief, free-text reason for the determination. */
  reason: string;
}

export interface TribalProximity {
  /** Distance in miles to the nearest federally recognized reservation. null = data unavailable. */
  nearestMi: number | null;
  nearestName: string | null;
  /** True iff distance ≤ 50 mi — the trigger for Section 106 NHPA flag (only fires if a federal permit is needed). */
  within50Mi: boolean;
}

export interface FederalLayerData {
  // Score
  /** 0 (clean) … 3 (critical). */
  subScore: 0 | 1 | 2 | 3;
  band: RiskBand;
  /** Ordered, user-facing reasons that drove the score. */
  whyScored: string[];

  // 5 signals (one per row in the UI)
  signals: PoliticalSignal[];

  // Structured payloads behind the signals
  bills: FederalBill[];
  billsError: string | null;
  eos: FederalEO[];
  eosError: string | null;
  rto: RtoJurisdiction | null;
  tribal: TribalProximity | null;
  tribalError: string | null;
  /** v1: hard-coded null. Wired in a follow-up when CourtListener lands. */
  injunctions: null;

  // Reps panel
  reps: CongressionalRep[];
  repsError: string | null;
  resolvedDistrict: string | null; // 'TX-23'

  analyzedAt: number;
}

// ── Layer wrapper ───────────────────────────────────────────────────────

export type LayerKind = 'federal' | 'state' | 'county' | 'city' | 'submunicipal';

export interface PoliticalLayerStub {
  kind: Exclude<LayerKind, 'federal'>;
  status: 'stub';
  label: string;
}

export interface PoliticalLayerFederal {
  kind: 'federal';
  status: 'ok' | 'partial' | 'failed';
  data: FederalLayerData;
}

export interface PoliticalRadarResult {
  coordinates: { lat: number; lng: number };
  geohash5: string;
  /** Combined 0–100 risk score. v1 only computes the federal slice (3 pts). */
  combinedScore: number;
  combinedBand: RiskBand;
  layers: {
    federal: PoliticalLayerFederal;
    state: PoliticalLayerStub;
    county: PoliticalLayerStub;
    city: PoliticalLayerStub;
    submunicipal: PoliticalLayerStub;
  };
  analyzedAt: number;
  /** True when this result came from the Firestore cache rather than a fresh fetch. */
  fromCache: boolean;
}
