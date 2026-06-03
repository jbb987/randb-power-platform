/**
 * Pure helpers for the market-intelligence listener: URL canonicalization +
 * hashing (the dedup key) and title normalization (near-dup clustering in the
 * UI). No Firestore, no network — trivially unit-testable.
 */

import { createHash } from 'crypto';

/**
 * Canonical URL form used for deduplication. Lowercases the host, strips common
 * tracking params (utm_*, fbclid, gclid, ref), drops the hash fragment and any
 * trailing slash. Falls back to the trimmed raw string if the URL won't parse.
 */
export function normalizeUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  try {
    const u = new URL(trimmed);
    const drop: string[] = [];
    u.searchParams.forEach((_v, k) => {
      if (/^utm_/i.test(k) || k === 'fbclid' || k === 'gclid' || k === 'ref') drop.push(k);
    });
    drop.forEach((k) => u.searchParams.delete(k));
    const path = u.pathname.replace(/\/+$/, '') || '/';
    const qs = u.searchParams.toString();
    return `${u.protocol}//${u.host.toLowerCase()}${path}${qs ? `?${qs}` : ''}`;
  } catch {
    return trimmed;
  }
}

/** Deterministic Firestore doc id for a normalized URL (the dedup mechanism). */
export function urlHash(normalizedUrl: string): string {
  return createHash('sha256').update(normalizedUrl).digest('hex').slice(0, 40);
}

/**
 * Parse an ISO/RFC date string to epoch ms, falling back to "now" when it's
 * missing OR present-but-unparseable. Guards against `Date.parse` returning NaN
 * (a truthy-looking value) flowing into Firestore and breaking `orderBy`.
 */
export function parseTimestamp(iso?: string): number {
  if (!iso) return Date.now();
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Date.now();
}

/**
 * Normalized title used to cluster the same story reported by many outlets.
 * Lowercased, punctuation stripped, whitespace collapsed.
 */
export function titleKey(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
