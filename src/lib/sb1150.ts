/**
 * Texas SB 1150 — the hard plugging trigger that creates motivated sellers.
 *
 * Effective Sept 1, 2027, any well that is BOTH:
 *   - 25+ years old (since original completion)        AND
 *   - 15+ years inactive (since last production / shut-in)
 * must be either plugged or returned to production.
 *
 * A "trigger date" is the calendar date when a well first satisfies BOTH
 * conditions and the SB 1150 effective date has passed:
 *
 *     trigger = max( completionDate + 25 yrs, shutInDate + 15 yrs, 2027-09-01 )
 *
 * For wells already past trigger today, we surface "past trigger" — these
 * are wells the operator MUST resolve and is most motivated to deal on.
 */
import type { WellEnrichment } from '../types';

const SB1150_EFFECTIVE = new Date('2027-09-01T00:00:00Z');

/** Add `years` to a Date, preserving month/day. */
function addYears(d: Date, years: number): Date {
  const out = new Date(d.getTime());
  out.setUTCFullYear(out.getUTCFullYear() + years);
  return out;
}

/** Whole months between two Dates (a → b, can be negative). */
function monthsBetween(a: Date, b: Date): number {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12
       + (b.getUTCMonth()    - a.getUTCMonth());
}

export interface Sb1150Status {
  /** Date the well first triggers (will be in the past for some wells). */
  triggerDate: Date;
  /** Whole months from today until trigger. Negative = already past. */
  monthsToTrigger: number;
  /** Already past the trigger date as of today. */
  pastTrigger: boolean;
  /** Computed window for filter UX: 'past' | '<12mo' | '<24mo' | '<36mo' | '>36mo'. */
  bucket: 'past' | '<12mo' | '<24mo' | '<36mo' | '>36mo';
}

export const SB1150_BUCKETS = ['past', '<12mo', '<24mo', '<36mo', '>36mo'] as const;
export type Sb1150Bucket = typeof SB1150_BUCKETS[number];

export function computeSb1150(data: WellEnrichment, now: Date = new Date()): Sb1150Status | null {
  // Need both completion + shut-in dates to compute. If a well is producing
  // (no shut-in date) the trigger doesn't apply — there's no inactive clock.
  if (!data.iwarOriginalCompletionDate) return null;
  if (!data.iwarShutInDate) return null;

  // iwarOriginalCompletionDate is "YYYY-MM-DD"; iwarShutInDate is "YYYY-MM"
  const completion = parseDate(data.iwarOriginalCompletionDate);
  const shutIn = parseDate(`${data.iwarShutInDate}-01`);
  if (!completion || !shutIn) return null;

  const age25 = addYears(completion, 25);
  const inactive15 = addYears(shutIn, 15);

  // The latest of the three drivers wins.
  const triggerMs = Math.max(age25.getTime(), inactive15.getTime(), SB1150_EFFECTIVE.getTime());
  const triggerDate = new Date(triggerMs);
  const monthsToTrigger = monthsBetween(now, triggerDate);
  const pastTrigger = monthsToTrigger < 0;

  let bucket: Sb1150Bucket;
  if (pastTrigger) bucket = 'past';
  else if (monthsToTrigger < 12) bucket = '<12mo';
  else if (monthsToTrigger < 24) bucket = '<24mo';
  else if (monthsToTrigger < 36) bucket = '<36mo';
  else bucket = '>36mo';

  return { triggerDate, monthsToTrigger, pastTrigger, bucket };
}

function parseDate(s: string): Date | null {
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

/** Format YYYY-MM-DD without timezone shifting. */
export function formatTriggerDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Human-readable pressure label, e.g. "in 14 mo" or "8 mo past". */
export function formatTriggerPressure(s: Sb1150Status): string {
  if (s.pastTrigger) return `${Math.abs(s.monthsToTrigger)} mo past`;
  return `in ${s.monthsToTrigger} mo`;
}
