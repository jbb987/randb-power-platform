/**
 * BLS Public Data API v2 — labor data fetchers for the Site Analyzer.
 *
 * Two datasets:
 * - QCEW (Quarterly Census of Employment & Wages): county-level employment +
 *   average weekly wage by NAICS supersector. ~6-month lag.
 * - OEWS (Occupational Employment & Wage Statistics): state-level employment +
 *   hourly wage percentiles (P10–P90) by SOC major group. Annual.
 *
 * The BLS public API is CORS-enabled. A registered key (free, instant) raises
 * the per-IP quota from 25 to 500 requests/day. Set VITE_BLS_API_KEY to use it.
 *
 * Series ID formats:
 *   QCEW: ENU{areaFips5}{datatype1}{size1}{ownership1}{industryCode}
 *   OEWS: OEUS{areaCode7}{industry6}{occ6}{datatype2}   (state area = "{stateFips}00000")
 */

import { cachedFetch, TTL_INFRASTRUCTURE } from './requestCache';

// Routed through the Cloudflare Worker (prod) / Vite dev proxy at /api/bls so the
// BLS registrationkey is injected server-side and never ships in the client bundle.
const BLS_API_URL = '/api/bls/publicAPI/v2/timeseries/data/';

// ── Static lookups ──────────────────────────────────────────────────────────

/**
 * BLS QCEW supersectors used for the private-sector industry breakdown.
 * These are the 10 standard NAICS-aligned supersectors that QCEW publishes
 * employment + wage data for at the county level.
 */
const QCEW_SUPERSECTORS: Array<{ code: string; name: string }> = [
  { code: '1011', name: 'Natural Resources & Mining' },
  { code: '1012', name: 'Construction' },
  { code: '1013', name: 'Manufacturing' },
  { code: '1021', name: 'Trade, Transportation & Utilities' },
  { code: '1022', name: 'Information' },
  { code: '1023', name: 'Financial Activities' },
  { code: '1024', name: 'Professional & Business Services' },
  { code: '1025', name: 'Education & Health Services' },
  { code: '1026', name: 'Leisure & Hospitality' },
  { code: '1027', name: 'Other Services' },
];

/**
 * Top 8 SOC major groups by national employment share. Covers ~60% of US
 * workers and is consistent with how BLS-style labor reports typically
 * present occupational mixes.
 */
const OEWS_MAJOR_GROUPS: Array<{ code: string; name: string }> = [
  { code: '430000', name: 'Office & Administrative Support' },
  { code: '410000', name: 'Sales & Related' },
  { code: '350000', name: 'Food Preparation & Serving' },
  { code: '530000', name: 'Transportation & Material Moving' },
  { code: '290000', name: 'Healthcare Practitioners' },
  { code: '250000', name: 'Education / Training' },
  { code: '510000', name: 'Production' },
  { code: '470000', name: 'Construction & Extraction' },
];

// ── BLS API client ──────────────────────────────────────────────────────────

interface BlsSeriesData {
  year: string;
  period: string;
  periodName: string;
  value: string;
}

interface BlsSeries {
  seriesID: string;
  data: BlsSeriesData[];
}

interface BlsResponse {
  status: string;
  message?: string[];
  Results?: { series: BlsSeries[] };
}

async function blsPost(
  seriesIds: string[],
  startYear: number,
  endYear: number,
): Promise<BlsResponse> {
  // BLS rejects CORS preflight (HTTP 405 on OPTIONS), so we have to keep this
  // a "simple request": application/x-www-form-urlencoded + flat fields. The
  // server accepts a comma-separated seriesid list in this format.
  const params = new URLSearchParams();
  params.set('seriesid', seriesIds.join(','));
  params.set('startyear', String(startYear));
  params.set('endyear', String(endYear));
  // registrationkey is injected server-side by the /api/bls proxy.

  const res = await fetch(BLS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`BLS HTTP ${res.status}`);
  const json = (await res.json()) as BlsResponse;
  if (json.status !== 'REQUEST_SUCCEEDED') {
    throw new Error(`BLS request failed: ${(json.message ?? []).join('; ')}`);
  }
  return json;
}

/**
 * Split a series-ID list into chunks the BLS API will accept in one request.
 * Limit is 25 without a key, 50 with one.
 */
async function blsBatched(
  seriesIds: string[],
  startYear: number,
  endYear: number,
): Promise<Map<string, BlsSeries>> {
  // Prod: the /api/bls proxy injects the key → 50/request. Dev: keyless → 25.
  const chunkSize = import.meta.env.DEV ? 25 : 50;
  const out = new Map<string, BlsSeries>();
  for (let i = 0; i < seriesIds.length; i += chunkSize) {
    const chunk = seriesIds.slice(i, i + chunkSize);
    const json = await blsPost(chunk, startYear, endYear);
    for (const s of json.Results?.series ?? []) {
      out.set(s.seriesID, s);
    }
  }
  return out;
}

function latestValue(s: BlsSeries | undefined): number | null {
  const d = s?.data?.[0];
  if (!d) return null;
  const n = parseFloat(d.value);
  return Number.isFinite(n) ? n : null;
}

function latestPeriodLabel(s: BlsSeries | undefined): string | null {
  const d = s?.data?.[0];
  return d ? `${d.periodName} ${d.year}` : null;
}

// ── QCEW: industries by county ─────────────────────────────────────────────

export interface QcewIndustryRow {
  code: string;
  name: string;
  employed: number | null;
  avgWeeklyWage: number | null;
}

export interface QcewCountyResult {
  rows: QcewIndustryRow[];
  vintage: string;
}

/**
 * Fetch private-sector industry breakdown for a county. Returns one row per
 * NAICS supersector (10 rows max), filtered to those with non-zero employment.
 */
export async function fetchQcewByCounty(countyFips: string): Promise<QcewCountyResult> {
  return cachedFetch(
    `bls:qcew:${countyFips}`,
    async () => {
      const currentYear = new Date().getFullYear();
      const startYear = currentYear - 2;

      const seriesIds: string[] = [];
      for (const ss of QCEW_SUPERSECTORS) {
        seriesIds.push(`ENU${countyFips}105${ss.code}`); // dt=1 emp, size=0, ownership=5 private
        seriesIds.push(`ENU${countyFips}405${ss.code}`); // dt=4 avg weekly wage
      }

      const map = await blsBatched(seriesIds, startYear, currentYear);

      let vintage: string | null = null;
      const rows: QcewIndustryRow[] = QCEW_SUPERSECTORS.map((ss) => {
        const emp = map.get(`ENU${countyFips}105${ss.code}`);
        const wage = map.get(`ENU${countyFips}405${ss.code}`);
        if (!vintage) vintage = latestPeriodLabel(wage) ?? latestPeriodLabel(emp);
        return {
          code: ss.code,
          name: ss.name,
          employed: latestValue(emp),
          avgWeeklyWage: latestValue(wage),
        };
      }).filter((r) => r.employed != null && r.employed > 0);

      return {
        rows,
        vintage: vintage ? `BLS QCEW · ${vintage}` : 'BLS QCEW',
      };
    },
    TTL_INFRASTRUCTURE,
  );
}

// ── OEWS: occupations + wage percentiles by state ──────────────────────────

export interface OewsOccupationWageRow {
  socCode: string;
  socName: string;
  employed: number | null;
  wages: { p10: number; p25: number; p50: number; p75: number; p90: number } | null;
  suppressed: boolean;
}

export interface OewsStateResult {
  rows: OewsOccupationWageRow[];
  vintage: string;
}

const OEWS_DATATYPES = {
  emp: '01',
  p10: '06',
  p25: '07',
  p50: '08',
  p75: '09',
  p90: '10',
} as const;

/**
 * Fetch top SOC major groups for a state — employment + hourly wage
 * percentiles (P10/P25/P50/P75/P90). State-level is a deliberate fallback
 * from MSA-level: MSA resolution requires a server-side proxy that the
 * browser doesn't have today (see laborAnalysis.ts:resolveGeographies).
 */
export async function fetchOewsByState(stateFips: string): Promise<OewsStateResult> {
  return cachedFetch(
    `bls:oews:state:${stateFips}`,
    async () => {
      const currentYear = new Date().getFullYear();
      // OEWS is annual and lags by ~12–18 months, so we widen the window to
      // include the prior calendar year. Without this, fresh starts in early
      // year N return empty arrays because year N-1 data isn't published yet.
      const startYear = currentYear - 2;
      const area = `${stateFips}00000`;

      const seriesIds: string[] = [];
      const idFor = (occ: string, dt: string) => `OEUS${area}000000${occ}${dt}`;
      for (const m of OEWS_MAJOR_GROUPS) {
        for (const dt of Object.values(OEWS_DATATYPES)) {
          seriesIds.push(idFor(m.code, dt));
        }
      }

      const map = await blsBatched(seriesIds, startYear, currentYear);

      let vintage: string | null = null;
      const rows: OewsOccupationWageRow[] = OEWS_MAJOR_GROUPS.map((m) => {
        const employed = latestValue(map.get(idFor(m.code, OEWS_DATATYPES.emp)));
        const p10 = latestValue(map.get(idFor(m.code, OEWS_DATATYPES.p10)));
        const p25 = latestValue(map.get(idFor(m.code, OEWS_DATATYPES.p25)));
        const p50 = latestValue(map.get(idFor(m.code, OEWS_DATATYPES.p50)));
        const p75 = latestValue(map.get(idFor(m.code, OEWS_DATATYPES.p75)));
        const p90 = latestValue(map.get(idFor(m.code, OEWS_DATATYPES.p90)));
        if (!vintage) vintage = latestPeriodLabel(map.get(idFor(m.code, OEWS_DATATYPES.p50)));
        const allPctsPresent =
          p10 != null && p25 != null && p50 != null && p75 != null && p90 != null;
        return {
          socCode: m.code.replace(/^(\d{2})(\d{4})$/, '$1-$2'),
          socName: m.name,
          employed,
          wages: allPctsPresent ? { p10: p10!, p25: p25!, p50: p50!, p75: p75!, p90: p90! } : null,
          suppressed: !allPctsPresent,
        };
      });

      return {
        rows,
        vintage: vintage ? `BLS OEWS · ${vintage}` : 'BLS OEWS',
      };
    },
    TTL_INFRASTRUCTURE,
  );
}
