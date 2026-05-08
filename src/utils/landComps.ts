import type { LandComp, FilteredCompResult } from '../types';

// ── Claude Prompt ────────────────────────────────────────────────────────

export const CLAUDE_LANDID_PROMPT = `I'm uploading a LandID comparable sales PDF. Please extract all comparable properties (skip the subject property "A") and output ONLY a CSV table with these exact headers — no markdown, no explanation, no extra text:

Address,County,Sale Date,Total Price,Acres,Price Per Acre,Land Use,Parcel ID

Rules:
- Wrap addresses in quotes if they contain commas
- Sale Date as YYYY-MM-DD
- Total Price as plain number (no $ or commas)
- Acres as decimal number
- Price Per Acre as plain number (no $ or commas)
- Land Use as-is from the PDF (e.g. Agricultural, Residential, Vacant)
- If a field is missing or N/A, leave it empty
- One row per comparable, no blank lines
- Skip any property with no sale price`;

// ── CSV Parser ───────────────────────────────────────────────────────────

function parseNumber(raw: string): number {
  const cleaned = raw.replace(/[$,]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Parse RFC-4180-ish CSV line, handling quoted fields with commas. */
function splitCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseLandCompsCsv(csv: string): LandComp[] {
  const lines = csv
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  // Skip header row
  const comps: LandComp[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvRow(lines[i]);
    if (fields.length < 6) continue;

    const totalPrice = parseNumber(fields[3]);
    const acres = parseNumber(fields[4]);
    const pricePerAcre = parseNumber(fields[5]) || (acres > 0 ? totalPrice / acres : 0);

    if (totalPrice === 0 && pricePerAcre === 0) continue; // skip entries with no price data

    comps.push({
      id: crypto.randomUUID(),
      address: fields[0] || '',
      county: fields[1] || '',
      saleDate: fields[2] || '',
      totalPrice,
      acres,
      pricePerAcre,
      landUse: fields[6] || '',
      parcelId: fields[7] || '',
    });
  }

  return comps;
}

// ── Stats ────────────────────────────────────────────────────────────────

export interface CompStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
  cv: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function computeCompStats(comps: LandComp[]): CompStats {
  const values = comps
    .map((c) => c.pricePerAcre)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, median: 0, p25: 0, p75: 0, cv: 0 };
  }
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const variance = values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length;
  const cv = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;
  return {
    count: values.length,
    min: values[0],
    max: values[values.length - 1],
    mean,
    median: percentile(values, 50),
    p25: percentile(values, 25),
    p75: percentile(values, 75),
    cv,
  };
}

// ── Scoring & Smart Filtering ───────────────────────────────────────────

const RAW_LAND_KEYWORDS = ['AGRI', 'VACANT', 'FARM', 'PASTURE', 'CROPLAND', 'RANCH'];
const SEMI_RAW_KEYWORDS = ['MISC', 'UNDEVELOPED', 'UNIMPROVED'];

export function scoreComp(comp: LandComp, subjectAcres: number): number {
  let score = 0;
  const use = (comp.landUse || '').toUpperCase();

  // Land use (25 pts)
  if (RAW_LAND_KEYWORDS.some((kw) => use.includes(kw))) score += 25;
  else if (SEMI_RAW_KEYWORDS.some((kw) => use.includes(kw))) score += 20;
  else if (use.includes('RESID') && comp.acres >= 5) score += 10;

  // Acreage similarity (30 pts)
  if (subjectAcres > 0 && comp.acres > 0) {
    const ratio = Math.min(comp.acres, subjectAcres) / Math.max(comp.acres, subjectAcres);
    score += ratio * 30;
  }

  // Recency (20 pts)
  if (comp.saleDate) {
    const days = (Date.now() - new Date(comp.saleDate).getTime()) / 86_400_000;
    if (days <= 90) score += 20;
    else if (days <= 180) score += 15;
    else if (days <= 365) score += 10;
    else if (days <= 730) score += 5;
  }

  // Price sanity (10 pts)
  if (comp.pricePerAcre >= 1000 && comp.pricePerAcre <= 500000) score += 10;

  // Data completeness (5 pts)
  if (comp.address && comp.saleDate && comp.landUse) score += 5;

  return score;
}

export function filterComps(comps: LandComp[], subjectAcres: number): FilteredCompResult {
  if (comps.length === 0) {
    return {
      active: [],
      excluded: [],
      medianPricePerAcre: 0,
      activeCount: 0,
      totalCount: 0,
      warnings: [],
    };
  }

  // Score all comps
  const scored = comps.map((c) => ({ ...c, score: scoreComp(c, subjectAcres) }));
  scored.sort((a, b) => b.score - a.score);

  // Respect manual overrides: force-included stay in, force-excluded stay out
  const forceIncluded: typeof scored = scored.filter(
    (c) => c.manualOverride === true && c.excluded === false,
  );
  const forceExcluded: typeof scored = scored.filter(
    (c) => c.manualOverride === true && c.excluded === true,
  );
  const autoPool = scored.filter((c) => !c.manualOverride);

  // Take top 20 from auto pool
  const topAuto = autoPool.slice(0, 20);
  const autoExcluded = autoPool.slice(20);

  // IQR trim on the auto candidates (if 5+)
  let activeCandidates = [...forceIncluded, ...topAuto];
  let trimmedOut: typeof activeCandidates = [];

  if (activeCandidates.length >= 5) {
    const prices = activeCandidates.map((c) => c.pricePerAcre).sort((a, b) => a - b);
    const q1 = percentile(prices, 25);
    const q3 = percentile(prices, 75);
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;

    const kept: typeof activeCandidates = [];
    for (const c of activeCandidates) {
      // Never IQR-trim force-included comps
      if (c.manualOverride === true && c.excluded === false) {
        kept.push(c);
      } else if (c.pricePerAcre >= lower && c.pricePerAcre <= upper) {
        kept.push(c);
      } else {
        trimmedOut.push(c);
      }
    }
    // Only use trimmed set if we still have enough
    if (kept.length >= Math.min(3, comps.length)) {
      activeCandidates = kept;
    } else {
      trimmedOut = [];
    }
  }

  // Mark excluded
  const activeIds = new Set(activeCandidates.map((c) => c.id));
  const active = activeCandidates.map((c) => ({ ...c, excluded: false }));
  const excluded = [...forceExcluded, ...autoExcluded, ...trimmedOut].map((c) => ({
    ...c,
    excluded: true as const,
  }));
  // Also mark any remaining scored comps not in active/excluded
  for (const c of scored) {
    if (!activeIds.has(c.id) && !excluded.some((e) => e.id === c.id)) {
      excluded.push({ ...c, excluded: true });
    }
  }

  // Compute median from active
  const activeValues = active
    .map((c) => c.pricePerAcre)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const medianPricePerAcre = activeValues.length > 0 ? percentile(activeValues, 50) : 0;

  // Warnings
  const warnings: string[] = [];
  if (active.length < 5)
    warnings.push('Fewer than 5 comparable sales — estimate may be less reliable');
  if (active.length >= 2) {
    const stats = computeCompStats(active);
    if (stats.cv > 60) warnings.push('High variance in comparable sales (CV > 60%)');
  }

  return {
    active,
    excluded: excluded.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    medianPricePerAcre,
    activeCount: active.length,
    totalCount: comps.length,
    warnings,
  };
}
