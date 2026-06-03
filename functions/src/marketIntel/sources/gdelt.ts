/**
 * GDELT DOC 2.0 ArtList source. Free, keyless, US-scoped. Returns recent news
 * articles mentioning data-center topic terms from US-based publishers.
 *
 * Docs: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
 */

import { logger } from 'firebase-functions/v2';
import type { RawItem } from '../types';
import { GDELT_TOPIC_QUERY } from './config';

interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  socialimage?: string;
  language?: string;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

/** GDELT seendate is `YYYYMMDDTHHMMSSZ` (or without the T). → epoch ms.
 *  Validates field ranges before `Date.UTC` so a corrupt value can't roll over
 *  into a far-future timestamp that would pin the article to the top forever. */
function parseSeendate(s?: string): number {
  if (!s) return Date.now();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})/);
  if (!m) return Date.now();
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const h = +m[4];
  const mi = +m[5];
  const se = +m[6];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return Date.now();
  const t = Date.UTC(y, mo - 1, d, h, mi, se);
  return Number.isFinite(t) ? t : Date.now();
}

/**
 * @param timespan GDELT relative window, e.g. '7d', '2d', '24h'.
 */
export async function fetchGdelt(timespan: string): Promise<RawItem[]> {
  const query = `${GDELT_TOPIC_QUERY} sourcecountry:US sourcelang:english`;
  const url =
    'https://api.gdeltproject.org/api/v2/doc/doc' +
    `?query=${encodeURIComponent(query)}` +
    '&mode=ArtList&format=json&maxrecords=250&sort=DateDesc' +
    `&timespan=${encodeURIComponent(timespan)}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GDELT ${res.status}: ${body.slice(0, 200)}`);
  }

  // GDELT occasionally returns an HTML/plaintext error with a 200 when a query
  // is rejected — guard the JSON parse so it doesn't poison the whole run.
  const raw = await res.text();
  let data: GdeltResponse;
  try {
    data = JSON.parse(raw) as GdeltResponse;
  } catch {
    logger.warn(`fetchGdelt: non-JSON response — ${raw.slice(0, 200)}`);
    return [];
  }

  return (data.articles ?? [])
    .filter((a) => a.url && a.title)
    .map((a) => ({
      title: a.title as string,
      url: a.url as string,
      source: 'gdelt' as const,
      sourceName: a.domain ?? 'gdelt',
      imageUrl: a.socialimage || undefined,
      publishedAt: parseSeendate(a.seendate),
    }));
}
