/**
 * Federal Register executive-order search for the political-radar federal
 * layer.
 *
 * API: https://www.federalregister.gov/api/v1/documents.json
 * No auth, CORS-friendly.
 *
 * The current EO posture is mostly favorable to DC siting (permitting
 * accelerators, AI infra orders, energy-emergency framings). We classify each
 * matched EO heuristically — keyword-driven — and return a `posture` field
 * the UI uses to colour the row green/red. v1 keeps the heuristic small and
 * commented; future versions can swap in a curated list once we know which
 * EOs Babi wants surfaced.
 */

import { cachedFetch, TTL_SHORT } from '../requestCache';
import type { FederalEO } from './types';

const FAVORABLE_HINTS = [
  'streamlin',
  'accelerat',
  'permitting',
  'infrastructure',
  'artificial intelligence',
  'energy emergency',
  'energy independence',
  'unleash',
  'expedite',
];

const UNFAVORABLE_HINTS = [
  'moratorium',
  'pause',
  'restrict',
  'limit on',
  'prohibition',
];

interface FrApiDocument {
  document_number?: string;
  title?: string;
  signing_date?: string;
  citation?: string;
  html_url?: string;
  type?: string;
}

interface FrApiResponse {
  results?: FrApiDocument[];
}

function classifyPosture(title: string): 'favorable' | 'unfavorable' | 'neutral' {
  const lower = title.toLowerCase();
  if (UNFAVORABLE_HINTS.some((h) => lower.includes(h))) return 'unfavorable';
  if (FAVORABLE_HINTS.some((h) => lower.includes(h))) return 'favorable';
  return 'neutral';
}

export interface ExecutiveOrdersResult {
  eos: FederalEO[];
  error: string | null;
}

/**
 * Fetch recent presidential documents (EOs + memoranda) that mention any of
 * the data-center / AI-infra / permitting / energy-emergency keywords.
 */
export async function fetchExecutiveOrders(): Promise<ExecutiveOrdersResult> {
  const params = new URLSearchParams({
    'conditions[type][]': 'PRESDOCU',
    'conditions[presidential_document_type][]': 'executive_order',
    'conditions[term]':
      'data center OR "artificial intelligence" OR permitting OR "energy emergency"',
    'order': 'newest',
    'per_page': '20',
    'fields[]': 'document_number',
  });
  // We need the title fields too — easier to add them as repeat keys.
  for (const f of ['title', 'signing_date', 'citation', 'html_url', 'type']) {
    params.append('fields[]', f);
  }

  const url = `https://www.federalregister.gov/api/v1/documents.json?${params.toString()}`;

  try {
    const data = await cachedFetch<FrApiResponse>(
      url,
      async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Federal Register API ${res.status}`);
        return (await res.json()) as FrApiResponse;
      },
      TTL_SHORT,
    );

    const eos: FederalEO[] = (data.results ?? [])
      .filter((d) => !!d.title && !!d.document_number)
      .map<FederalEO>((d) => ({
        documentNumber: d.document_number ?? '',
        title: d.title ?? '',
        signingDate: d.signing_date ?? null,
        citation: d.citation ?? '',
        url: d.html_url ?? '',
        posture: classifyPosture(d.title ?? ''),
      }))
      .slice(0, 8);

    return { eos, error: null };
  } catch (err) {
    return {
      eos: [],
      error: err instanceof Error ? err.message : 'Federal Register fetch failed',
    };
  }
}
