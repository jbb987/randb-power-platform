import type {
  AppraisalResult,
  PreConChecklistEntry,
  PreConChecklistItemStatus,
  PreConGrade,
  PreConLoaStatus,
  PreConLoaStep,
  PreConSite,
  PreConUtility,
} from '../types';

/** Auto-suggest a grade from appraisal financial metrics.
 *
 *  Thresholds on `returnMultiple` (energizedValue / mid currentValue):
 *    ≥ 3   → 'go'             — strong upside
 *    1.5–3 → 'conditional-go' — viable but tight
 *    < 1.5 → 'no-go'          — not worth pursuing
 *
 *  Returns undefined if the appraisal hasn't produced a meaningful multiple
 *  (e.g. acreage/ppa not yet entered). The user can always override. */
export function suggestGradeFromAppraisal(appraisal: AppraisalResult | null | undefined):
  | PreConGrade
  | undefined {
  if (!appraisal) return undefined;
  const m = appraisal.returnMultiple;
  if (!Number.isFinite(m) || m <= 0) return undefined;
  if (m >= 3) return 'go';
  if (m >= 1.5) return 'conditional-go';
  return 'no-go';
}

/** Ordered list of LOA timeline steps for the v1 generic template. Each
 *  utility key maps to this same array today; per-utility overrides drop in
 *  here later without touching call sites. */
const GENERIC_LOA_TIMELINE: PreConLoaStatus[] = [
  'not-started',
  'contact-utility',
  'project-manager',
  'engineer-packet',
  'packet-to-ercot',
  'letter-of-allocation',
];

export const LOA_TIMELINES: Record<PreConUtility, PreConLoaStatus[]> = {
  oncor: GENERIC_LOA_TIMELINE,
  aep: GENERIC_LOA_TIMELINE,
  coop: GENERIC_LOA_TIMELINE,
  other: GENERIC_LOA_TIMELINE,
};

/** Resolve the timeline for a site. Falls back to the generic timeline when
 *  no utility has been selected yet. */
export function timelineForUtility(utility: PreConUtility | undefined): PreConLoaStatus[] {
  if (!utility) return GENERIC_LOA_TIMELINE;
  return LOA_TIMELINES[utility] ?? GENERIC_LOA_TIMELINE;
}

/** Append a step to the audit trail. Pure — returns a new array, doesn't
 *  touch Firestore. The caller writes the result back via updatePreConSite. */
export function appendLoaStep(
  site: Pick<PreConSite, 'loaSteps'>,
  status: PreConLoaStatus,
  userId: string,
): PreConLoaStep[] {
  return [
    ...site.loaSteps,
    {
      status,
      enteredAt: Date.now(),
      enteredBy: userId,
    },
  ];
}

/** Default offset (days) from `PreConSite.createdAt` for each LOA step. Used
 *  to pre-populate `loaStepDates` on site creation so the timeline arrives
 *  pre-scheduled. Letter-of-allocation has no default — surfaces as "TBD"
 *  until the user manually sets it. Source: conversation 2026-05-27. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const LOA_STEP_DEFAULT_OFFSETS_DAYS: Partial<Record<PreConLoaStatus, number>> = {
  'contact-utility': 7,
  'project-manager': 21,
  'engineer-packet': 49,
  'packet-to-ercot': 63,
};

/** Build the initial `loaStepDates` map for a freshly created site by
 *  offsetting each defaulted step from `createdAt`. Steps without a default
 *  (e.g. letter-of-allocation) are omitted; UI renders them as "TBD". */
export function buildInitialLoaStepDates(
  createdAt: number,
): Partial<Record<PreConLoaStatus, number>> {
  const out: Partial<Record<PreConLoaStatus, number>> = {};
  for (const [status, days] of Object.entries(LOA_STEP_DEFAULT_OFFSETS_DAYS)) {
    if (typeof days === 'number') {
      out[status as PreConLoaStatus] = createdAt + days * ONE_DAY_MS;
    }
  }
  return out;
}

/** Resolve the display date for a step on a given site. Prefers a stored
 *  `loaStepDates[status]` (covers both the create-time defaults and any
 *  later user edits) and falls back to computing the default offset from
 *  `createdAt` for legacy sites whose `loaStepDates` was never populated.
 *  Returns undefined when the step has no default (letter-of-allocation)
 *  and the user hasn't set one. */
export function displayStepDate(
  site: Pick<PreConSite, 'loaStepDates' | 'createdAt'>,
  status: PreConLoaStatus,
): number | undefined {
  const stored = site.loaStepDates?.[status];
  if (typeof stored === 'number') return stored;
  const offsetDays = LOA_STEP_DEFAULT_OFFSETS_DAYS[status];
  if (typeof offsetDays === 'number') return site.createdAt + offsetDays * ONE_DAY_MS;
  return undefined;
}

// ── Document submission checklist ──────────────────────────────────────────
// Per-utility list of documents a Large Load Request must assemble before the
// utility will start its study. Mirrors LOA_TIMELINES: keyed by utility, with a
// generic fallback. Per-site completion status lives on PreConSite.documentChecklist.

/** One required (or conditional) document in a utility's submission package. */
export interface PreConChecklistItem {
  id: string;
  label: string;
  description: string;
  /** true = always part of the package (defaults to "missing"); false =
   *  conditional / only for larger studies (defaults to "n/a"). */
  required: boolean;
}

const ONCOR_CHECKLIST: PreConChecklistItem[] = [
  { id: 'ntp', label: 'Notice to Proceed', description: 'Written confirmation to start the official study — due within 30 days of the capacity-check result.', required: true },
  { id: 'load-questionnaire', label: 'Load Questionnaire', description: "Oncor's Commercial Load Questionnaire, completed.", required: true },
  { id: 'one-line', label: 'One-line diagram', description: 'Customer↔utility electrical interconnection one-line.', required: true },
  { id: 'site-plan', label: 'Detailed site plan', description: 'Site plan / survey showing proposed facilities vs. existing Oncor facilities.', required: true },
  { id: 'kmz', label: 'KMZ file', description: 'Site location/boundary KMZ for Oncor GIS (part of the site-plan deliverable).', required: true },
  { id: 'site-control', label: 'Proof of site control', description: 'Deed, PSA, lease, or signed option proving control of the parcel.', required: true },
  { id: 'dynamic-model', label: 'PSSE CMLD dynamic model', description: 'PSS®E composite load (CMLD) dynamic model — required for larger studies.', required: false },
  { id: 'test-fit', label: 'Test-fit design', description: 'Preliminary test-fit design of the proposed facilities — required for larger studies.', required: false },
  { id: 'equipment-selection', label: 'Equipment selection', description: 'Major equipment selection (transformers, switchgear) — required for larger studies.', required: false },
];

const GENERIC_CHECKLIST: PreConChecklistItem[] = [
  { id: 'ntp', label: 'Notice to Proceed', description: 'Written confirmation to start the official study.', required: true },
  { id: 'load-questionnaire', label: 'Load questionnaire', description: "The utility's load questionnaire / application, completed.", required: true },
  { id: 'one-line', label: 'One-line diagram', description: 'Customer↔utility electrical interconnection one-line.', required: true },
  { id: 'site-plan', label: 'Detailed site plan', description: 'Site plan / survey showing proposed facilities vs. existing utility facilities.', required: true },
  { id: 'site-control', label: 'Proof of site control', description: 'Deed, PSA, lease, or signed option proving control of the parcel.', required: true },
];

/** Per-utility document submission checklist. Mirrors LOA_TIMELINES. */
export const DOCUMENT_CHECKLISTS: Record<PreConUtility, PreConChecklistItem[]> = {
  oncor: ONCOR_CHECKLIST,
  aep: GENERIC_CHECKLIST,
  coop: GENERIC_CHECKLIST,
  other: GENERIC_CHECKLIST,
};

/** Resolve the checklist for a request. Defaults to Oncor when no utility is
 *  set — every current request is an Oncor large-load request. */
export function checklistForUtility(utility: PreConUtility | undefined): PreConChecklistItem[] {
  if (!utility) return ONCOR_CHECKLIST;
  return DOCUMENT_CHECKLISTS[utility] ?? ONCOR_CHECKLIST;
}

/** Effective status of one item: the stored value, else a default by
 *  requiredness (core → missing, conditional → n/a). */
export function effectiveChecklistStatus(
  item: PreConChecklistItem,
  checklist: Record<string, PreConChecklistEntry> | undefined,
): PreConChecklistItemStatus {
  return checklist?.[item.id]?.status ?? (item.required ? 'missing' : 'na');
}

/** Progress over a checklist. N-A items drop out of the denominator. Pure. */
export function checklistProgress(
  items: PreConChecklistItem[],
  checklist: Record<string, PreConChecklistEntry> | undefined,
): { provided: number; total: number; missing: PreConChecklistItem[] } {
  let provided = 0;
  let total = 0;
  const missing: PreConChecklistItem[] = [];
  for (const item of items) {
    const status = effectiveChecklistStatus(item, checklist);
    if (status === 'na') continue;
    total += 1;
    if (status === 'provided') provided += 1;
    else missing.push(item);
  }
  return { provided, total, missing };
}
