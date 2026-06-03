/**
 * Shared shape for a single raw article pulled from any source before it is
 * filtered, tagged, and written to Firestore. Every source fetcher normalizes
 * its provider-specific response into this.
 */
export interface RawItem {
  title: string;
  url: string;
  source: 'gdelt' | 'rss' | 'google-news';
  sourceName: string; // publisher / domain / feed name
  summary?: string;
  imageUrl?: string;
  publishedAt: number; // epoch ms
}
