/**
 * Google News RSS source. Free, keyless. US-scoped via gl=US&ceid=US:en and the
 * `when:` recency operator. Each query is an RSS search feed.
 *
 * Note: item links are news.google.com redirect URLs, so the same story won't
 * URL-dedup against the GDELT/RSS copy — UI clusters those by titleKey instead.
 */

import Parser from 'rss-parser';
import { logger } from 'firebase-functions/v2';
import type { RawItem } from '../types';
import { parseTimestamp } from '../util';
import { GOOGLE_NEWS_QUERIES } from './config';

const parser = new Parser({ timeout: 15000 });

/** Google News headlines are "Headline - Publisher" — peel off the publisher. */
function splitPublisher(title: string): { title: string; publisher?: string } {
  const idx = title.lastIndexOf(' - ');
  if (idx > 0 && idx > title.length - 60) {
    return { title: title.slice(0, idx).trim(), publisher: title.slice(idx + 3).trim() };
  }
  return { title };
}

export async function fetchGoogleNews(): Promise<RawItem[]> {
  const out: RawItem[] = [];
  for (const q of GOOGLE_NEWS_QUERIES) {
    try {
      const url =
        'https://news.google.com/rss/search' +
        `?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
      const parsed = await parser.parseURL(url);
      for (const item of parsed.items) {
        if (!item.link || !item.title) continue;
        const { title, publisher } = splitPublisher(item.title);
        out.push({
          title,
          url: item.link,
          source: 'google-news',
          sourceName: publisher || 'Google News',
          summary: item.contentSnippet || undefined,
          publishedAt: parseTimestamp(item.isoDate),
        });
      }
    } catch (err) {
      logger.warn('fetchGoogleNews: query failed', err);
    }
  }
  return out;
}
