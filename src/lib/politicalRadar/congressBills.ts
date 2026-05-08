/**
 * Congress.gov bill search for the federal political-radar layer.
 *
 * API: https://api.congress.gov/v3/bill?api_key=…
 * Auth: free key, registered at api.congress.gov/sign-up
 * Set VITE_CONGRESS_API_KEY in .env.local — without it this module returns
 * `{ bills: [], error: 'Congress.gov API key not configured' }` so the UI
 * surfaces an honest "data unavailable" instead of a misleading green.
 *
 * Filtering happens client-side: the v3 endpoint has no full-text search,
 * so we pull the latest N introduced bills and grep titles for the DC-threat
 * keyword set. Good enough for v1 — moves to LegiScan or a server-side
 * search index when the noise level demands it.
 */

import { cachedFetch, TTL_SHORT } from '../requestCache';
import type { FederalBill } from './types';

const KEYWORDS = [
  'data center',
  'data centers',
  'ai moratorium',
  'artificial intelligence moratorium',
  'large load',
  'large-load',
  'interconnection',
  'colocation',
  'co-location',
  'electricity rate',
];

interface CongressApiBillRow {
  congress: number;
  type?: string;
  number?: string | number;
  title?: string;
  latestAction?: { actionDate?: string; text?: string };
  url?: string;
}

interface CongressApiResponse {
  bills?: CongressApiBillRow[];
}

function classifyStatus(actionText: string | undefined): string {
  if (!actionText) return 'Introduced';
  const t = actionText.toLowerCase();
  if (t.includes('became public law') || t.includes('signed by president')) return 'Enacted';
  if (t.includes('vetoed')) return 'Vetoed';
  if (t.includes('passed senate') || t.includes('passed house') || t.includes('passed/agreed'))
    return 'Passed Chamber';
  if (t.includes('committee') || t.includes('referred to')) return 'Committee';
  if (t.includes('introduced')) return 'Introduced';
  return 'In Progress';
}

function matchesKeywords(title: string): boolean {
  const lower = title.toLowerCase();
  return KEYWORDS.some((k) => lower.includes(k));
}

function buildHumanUrl(b: CongressApiBillRow): string {
  const type = (b.type || '').toLowerCase();
  return `https://www.congress.gov/bill/${b.congress}th-congress/${type}-bill/${b.number}`;
}

export interface CongressBillsResult {
  bills: FederalBill[];
  error: string | null;
}

export async function fetchFederalBills(): Promise<CongressBillsResult> {
  const apiKey = import.meta.env.VITE_CONGRESS_API_KEY as string | undefined;
  if (!apiKey) {
    return { bills: [], error: 'Congress.gov API key not configured (VITE_CONGRESS_API_KEY).' };
  }

  // 250 most-recent bills sorted by latest action. The endpoint has no full
  // text search; we filter titles client-side. Cap is 250 per request.
  const url = `https://api.congress.gov/v3/bill?api_key=${apiKey}&limit=250&sort=updateDate+desc`;
  const cacheKey = 'congress-bills:latest:250';

  try {
    const data = await cachedFetch<CongressApiResponse>(
      cacheKey,
      async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Congress.gov API ${res.status}`);
        return (await res.json()) as CongressApiResponse;
      },
      TTL_SHORT,
    );

    const matches = (data.bills ?? [])
      .filter((b) => b.title && matchesKeywords(b.title))
      .map<FederalBill>((b) => ({
        congress: b.congress,
        type: (b.type ?? '').toUpperCase(),
        number: String(b.number ?? ''),
        title: b.title ?? '',
        status: classifyStatus(b.latestAction?.text),
        latestActionDate: b.latestAction?.actionDate ?? null,
        url: buildHumanUrl(b),
      }))
      // Cap displayed bills — surface the few most relevant.
      .slice(0, 8);

    return { bills: matches, error: null };
  } catch (err) {
    return {
      bills: [],
      error: err instanceof Error ? err.message : 'Congress.gov fetch failed',
    };
  }
}
