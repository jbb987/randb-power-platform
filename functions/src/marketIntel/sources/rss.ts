/**
 * Trade-press RSS source. These feeds only cover data-center industry news, so
 * they're high-signal — we keep all parseable items and let the keyword filter
 * (and per-item state tagging) decide what's a US deal downstream.
 */

import Parser from 'rss-parser';
import { logger } from 'firebase-functions/v2';
import type { RawItem } from '../types';
import { parseTimestamp } from '../util';
import { RSS_FEEDS } from './config';

const parser = new Parser({ timeout: 15000 });

export async function fetchRss(): Promise<RawItem[]> {
  const out: RawItem[] = [];
  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of parsed.items) {
        if (!item.link || !item.title) continue;
        out.push({
          title: item.title,
          url: item.link,
          source: 'rss',
          sourceName: feed.name,
          summary: item.contentSnippet || item.content || undefined,
          publishedAt: parseTimestamp(item.isoDate),
        });
      }
    } catch (err) {
      // One bad feed must not kill the rest.
      logger.warn(`fetchRss: feed failed — ${feed.name}`, err);
    }
  }
  return out;
}
