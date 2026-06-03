/**
 * Centralized source configuration for the market-intelligence listener.
 *
 * Feed URLs, search queries, and the GDELT topic query live here (not inlined
 * across the three source files) so the "data-center deal" topic vocabulary is
 * edited in one place and stays close to the `keywords.ts` classifier.
 */

/** Topic clause for the GDELT DOC 2.0 query (country/lang appended by the source). */
export const GDELT_TOPIC_QUERY =
  '("data center" OR "data centre" OR "data centers" OR hyperscale OR colocation)';

/** Verified working public trade-press RSS (probed 2026-06-03). Data Center
 *  Frontier has no clean public feed (/feed/ 404s, /?feed=rss2 malformed) — its
 *  stories still arrive via Google News + GDELT, so it isn't listed. A broken
 *  feed only logs a warning (per-feed try/catch) and surfaces in the meta doc's
 *  emptySources. */
export const RSS_FEEDS: ReadonlyArray<{ url: string; name: string }> = [
  { url: 'https://www.datacenterdynamics.com/en/rss/', name: 'Data Center Dynamics' },
  { url: 'https://www.datacenterknowledge.com/rss.xml', name: 'Data Center Knowledge' },
];

/** Google News RSS search queries (US-scoped + recency applied by the source). */
export const GOOGLE_NEWS_QUERIES: ReadonlyArray<string> = [
  '"data center" (approved OR investment OR campus OR megawatt) when:7d',
  'hyperscale data center (announced OR billion OR acres OR groundbreaking) when:7d',
];
