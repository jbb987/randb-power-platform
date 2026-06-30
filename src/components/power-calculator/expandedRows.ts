import { PRIMARY_SCREEN_MI } from '../../lib/gridInfraQuery';

/**
 * Shared fallback selection for the Power-section grid tables: when the in-box
 * (~10mi) list is empty, fall back to the expanded-radius list. Returns the rows
 * to render and whether they came from the widened search.
 */
export function resolveExpandedRows<T>(
  primary: T[],
  expanded?: T[] | null,
): { rows: T[]; isExpanded: boolean } {
  const isExpanded = primary.length === 0 && (expanded?.length ?? 0) > 0;
  return { rows: primary.length > 0 ? primary : (expanded ?? []), isExpanded };
}

/** Banner text shown above a table whose rows came from the widened fallback. */
export function expandedBannerText(count: number, radiusMi?: number): string {
  return `None within the ${PRIMARY_SCREEN_MI} mi screen — showing ${count}${
    radiusMi ? ` within ${radiusMi} mi` : ''
  }.`;
}

/** Italic empty-state copy when even the widened search found nothing. */
export function emptyWithinCopy(radiusMi?: number): string {
  return radiusMi ? `${radiusMi} mi` : 'the search radius';
}
