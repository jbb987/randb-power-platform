/**
 * Two-stage topic+event keyword classifier, shared across Cloud Functions.
 *
 * A text matches only if it contains BOTH a topic term AND an event/threat term
 * — far less noisy than a single flat list. An optional `alwaysInclude` list is
 * a passthrough for phrases that are intrinsically relevant (topic == event).
 *
 * Extracted from `politicalRadar/keywords.ts` (bill threat filter) so the
 * market-intelligence deal filter reuses the same engine. Each caller supplies
 * only its keyword lists.
 */

export interface ClassifyConfig {
  topics: string[];
  events: string[];
  alwaysInclude?: string[];
}

export interface ClassifyResult {
  matched: boolean;
  reason: string; // why it matched / didn't — debug aid stored on the doc
}

export function twoStageClassify(text: string, cfg: ClassifyConfig): ClassifyResult {
  const lower = (text || '').toLowerCase();
  if (!lower) return { matched: false, reason: 'empty text' };

  for (const phrase of cfg.alwaysInclude ?? []) {
    if (lower.includes(phrase)) return { matched: true, reason: `always-include: ${phrase}` };
  }

  const topic = cfg.topics.find((k) => lower.includes(k));
  if (!topic) return { matched: false, reason: 'no topic keyword' };

  const event = cfg.events.find((k) => lower.includes(k));
  if (!event) return { matched: false, reason: `topic-only (${topic})` };

  return { matched: true, reason: `${topic} + ${event.trim()}` };
}
