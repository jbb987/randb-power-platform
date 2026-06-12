/**
 * Report synthesis for the Site Analyzer PDF — pure, no I/O.
 *
 * Historically this aligned the report to the Exhibit A (Phase A deliverables)
 * contract structure; successive review passes (2026-06-12) trimmed it to what
 * the customer document actually keeps:
 *  - project identification facts (cover page + Key Metrics): coordinates,
 *    county/city/state
 *  - Capacity & Load Viability: target capacity, interconnection ROM + basis,
 *    ramp schedule, and the GO / CONDITIONAL GO / NO-GO status
 *  - the grade also appears as a Key Metrics row
 * Everything derives from analysis data already on the site — no manual
 * inputs, no per-site hardcoding. The report itself never mentions Exhibit A
 * or uses contract phrasing.
 */

import type {
  AppraisalResult,
  BroadbandResult,
  CountyQueueLoad,
  NearbyLine,
  NearbySubstation,
  PreConGrade,
} from '../types';
import type { WaterAnalysisResult } from './waterAnalysis.types';
import type { GasAnalysisResult } from './gasAnalysis';
import type { LaborAnalysisResult } from './laborAnalysis';
import { computeRampSchedule, rampFromIncrements, type RampPhase } from './rampSchedule';
import { suggestGradeFromAppraisal } from './preConWorkflow';

// ── Public model ────────────────────────────────────────────────────────────

export interface ExhibitARow {
  label: string;
  value: string;
}

export interface ExhibitAModel {
  /** Project identification facts for the cover page and Key Metrics. */
  project: {
    coordinates: { lat: number; lng: number; decimal: string; dms: string } | null;
    county: string | null;
    city: string | null;
    state: string | null;
  };
  /** Capacity & Load Viability: uniform key/value rows + the ramp table. */
  capacity: {
    rows: ExhibitARow[];
    ramp: RampPhase[];
    rampIsCustom: boolean;
  };
  /** Site status (GO / CONDITIONAL GO / NO-GO) — shown in Key Metrics and
   *  atop Capacity & Load Viability. */
  recommendation: {
    grade: PreConGrade | null;
    gradeLabel: string;
    gradeSource: string;
  };
}

export interface ExhibitAInputs {
  siteName: string;
  address: string;
  coordinates: { lat: number; lng: number } | null;
  acreage: number;
  targetMW: number;
  county?: string;
  customRamp?: number[];
  generatedAt: number;
  appraisal: AppraisalResult | null;
  infra: {
    iso: string;
    utilityTerritory: string;
    tsp: string;
    nearbySubstations: NearbySubstation[];
    nearbyLines: NearbyLine[];
    detectedState: string | null;
    electricityPrice: { commercial: number; industrial: number; allSectors: number } | null;
  } | null;
  broadband: BroadbandResult | null;
  water: WaterAnalysisResult | null;
  gas: GasAnalysisResult | null;
  labor: LaborAnalysisResult | null;
  countyQueue: CountyQueueLoad | null;
  /** Grade from the linked LLR site, when one exists. */
  llrGrade: PreConGrade | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * HIFLD-derived names like "UNKNOWN303597" / "TAP306847" read as data errors in
 * a customer-facing document. Rewrite them into honest, human labels while
 * keeping the source id traceable.
 */
export function cleanGridName(raw: string | null | undefined): string {
  const name = (raw ?? '').trim();
  if (!name) return 'Unnamed';
  const unknown = name.match(/^UNKNOWN(\d+)$/i);
  if (unknown) return `Unnamed Substation ${unknown[1]}`;
  const tap = name.match(/^TAP(\d+)$/i);
  if (tap) return `Line Tap ${tap[1]}`;
  if (name === 'NOT AVAILABLE') return '—';
  return name;
}

function toDms(value: number, positive: string, negative: string): string {
  const hemi = value >= 0 ? positive : negative;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  return `${deg}°${String(min).padStart(2, '0')}'${sec.toFixed(1)}"${hemi}`;
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function fmtRange(low: number, high: number): string {
  return `${fmtMoney(low)} – ${fmtMoney(high)}`;
}

function parseCity(address: string): string | null {
  // "1601 W Fm 917, Joshua, TX, 76058" → "Joshua". Address shapes vary, so
  // only trust the pattern street, city, state[, zip].
  const parts = address.split(',').map((p) => p.trim());
  if (parts.length >= 3 && /^[A-Z]{2}\b/.test(parts[parts.length - 2] ?? '')) {
    return parts[parts.length - 3] || null;
  }
  if (parts.length >= 3) return parts[1] || null;
  return null;
}

// ROM (rough order of magnitude, ±50%) desktop assumptions for transmission
// interconnection — quantified ranges, not engineered estimates.
const ROM_138 = {
  linePerMileLow: 1_500_000,
  linePerMileHigh: 3_000_000,
  stationLow: 10_000_000,
  stationHigh: 20_000_000,
};
const ROM_345 = {
  linePerMileLow: 3_000_000,
  linePerMileHigh: 6_000_000,
  stationLow: 20_000_000,
  stationHigh: 40_000_000,
};

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildExhibitAModel(input: ExhibitAInputs): ExhibitAModel {
  const subs = input.infra?.nearbySubstations ?? [];
  const state = input.infra?.detectedState ?? input.gas?.detectedState ?? null;
  const lat = input.coordinates?.lat ?? 0;
  const lng = input.coordinates?.lng ?? 0;

  const county = input.county || input.labor?.resolvedCounty?.name || null;
  const city = parseCity(input.address);

  // Transmission proximity primitives. NOTE: the source STATUS field is
  // descriptive only — capacity statements derive from voltage class and
  // distance, never from status.
  const sorted = [...subs]
    .filter((s) => s.distanceMi > 0)
    .sort((a, b) => a.distanceMi - b.distanceMi);
  const nearestSub = sorted[0] ?? null;
  const nearest138 = sorted.find((s) => s.maxVolt >= 100) ?? null;
  const nearest345 = sorted.find((s) => s.maxVolt >= 300) ?? null;
  const transmissionSourcesWithin5 = sorted.filter((s) => s.maxVolt >= 100 && s.distanceMi <= 5);

  // ── Project identification (cover page + Key Metrics only) ──
  const coordinates = input.coordinates
    ? {
        lat,
        lng,
        decimal: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        dms: `${toDms(lat, 'N', 'S')} ${toDms(lng, 'E', 'W')}`,
      }
    : null;

  // ── Capacity & Load Viability ──
  const startYear = new Date(input.generatedAt).getFullYear() + 1;
  const rampIsCustom = !!input.customRamp && input.customRamp.length > 0;
  // Custom increments only redistribute the per-year pace — the schedule is
  // normalized to land exactly on the decided MW target.
  const ramp = rampIsCustom
    ? rampFromIncrements(input.customRamp!, { startYear, targetMW: input.targetMW })
    : computeRampSchedule(input.targetMW, { startYear });

  // Interconnection ROM. The cost tier follows the TARGET's voltage class so
  // the basis prose and the dollar range can never diverge (review fix
  // 2026-06-12: tier was previously chosen by a different rule than the
  // target, so the text could name a 138 kV station while pricing 345 kV).
  const romTarget =
    nearest345 && nearest345.distanceMi <= (nearest138?.distanceMi ?? Infinity)
      ? nearest345
      : (nearest138 ?? nearestSub);
  const romKv = romTarget && romTarget.maxVolt >= 300 ? ROM_345 : ROM_138;
  const romDist = romTarget?.distanceMi ?? null;
  const romLow = romDist != null ? romDist * romKv.linePerMileLow + romKv.stationLow : null;
  const romHigh = romDist != null ? romDist * romKv.linePerMileHigh + romKv.stationHigh : null;
  const romBasis = romTarget
    ? `ROM ±50%, desktop estimate: ${romDist!.toFixed(1)} mi interconnection to ${cleanGridName(romTarget.name)} at $${(
        romKv.linePerMileLow / 1_000_000
      ).toFixed(1)}M–$${(romKv.linePerMileHigh / 1_000_000).toFixed(1)}M per mile plus ${fmtRange(
        romKv.stationLow,
        romKv.stationHigh,
      )} station/POI work.${
        romTarget.maxVolt < 100
          ? ' Nearest station is distribution-class; transmission-class interconnection costs assumed.'
          : ''
      } Excludes network upgrades, which are sized by the utility study.`
    : 'No interconnection target identified — ROM not computable.';

  // ── Site status ──
  const suggested = suggestGradeFromAppraisal(input.appraisal);
  const grade = input.llrGrade ?? suggested ?? null;
  const gradeLabelMap: Record<PreConGrade, string> = {
    go: 'GO',
    'conditional-go': 'CONDITIONAL GO',
    'no-go': 'NO-GO',
  };
  const gradeLabel = grade ? gradeLabelMap[grade] : 'NOT GRADED';
  const statusValue = input.llrGrade
    ? `${gradeLabel} (engineer-reviewed)`
    : suggested
      ? `${gradeLabel} (preliminary — derived from the appraisal)`
      : gradeLabel;

  const ep = input.infra?.electricityPrice ?? null;

  // Feed redundancy: derived from independent transmission-class (100 kV+)
  // substations within 5 mi. Row omitted when none are in range — no claim
  // without supporting data.
  const feedRow: ExhibitARow[] =
    transmissionSourcesWithin5.length >= 2
      ? [
          {
            label: 'Feed Redundancy',
            value: `Dual-feed capable — ${transmissionSourcesWithin5.length} independent 100 kV+ substations within 5 mi`,
          },
        ]
      : transmissionSourcesWithin5.length === 1
        ? [
            {
              label: 'Feed Redundancy',
              value: 'Single feed — one 100 kV+ substation within 5 mi',
            },
          ]
        : [];

  const capacityRows: ExhibitARow[] = [
    ...(grade ? [{ label: 'Status', value: statusValue }] : []),
    { label: 'Target Capacity', value: `${input.targetMW.toLocaleString('en-US')} MW` },
    // Deliberately static (user decision 2026-06-12): initial 20–50 MW loads
    // are serviceable in practice on any site that reaches this report.
    { label: 'Initial Load (20–50 MW)', value: 'Supported' },
    ...feedRow,
    {
      label: 'Interconnection Cost (ROM)',
      value: romLow != null ? fmtRange(romLow, romHigh!) : 'Not computable',
    },
    { label: 'ROM Cost Basis', value: romBasis },
    ...(ep
      ? [
          {
            label: 'Electricity Price',
            value: `Industrial ${ep.industrial.toFixed(2)} ¢/kWh · Commercial ${ep.commercial.toFixed(2)} ¢/kWh`,
          },
        ]
      : []),
  ];

  return {
    project: { coordinates, county, city, state },
    capacity: { rows: capacityRows, ramp, rampIsCustom },
    recommendation: {
      grade,
      gradeLabel,
      gradeSource: input.llrGrade
        ? 'Status set in the Large Load Request workflow (engineer-reviewed)'
        : suggested
          ? 'Preliminary status derived from the financial appraisal'
          : 'No appraisal available to derive a status',
    },
  };
}
