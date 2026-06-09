/**
 * Customer Executive Summary synthesis layer.
 *
 * Collapses a fully-analyzed `SiteRegistryEntry` into a single display-ready
 * model consumed by BOTH the on-screen Executive Summary tab and the
 * downloadable PDF — so the two never drift. Pure, no IO.
 *
 * Each analysis section becomes a small "mini executive summary": a titled
 * block of label/value rows that mirror exactly what the full section reports
 * already display (same labels/formatting the user recognizes).
 *
 * Stored section results (`infraResult`, `gasResult`, …) are persisted as
 * `Record<string, unknown>`; we read them defensively and cast to the lib
 * result types (type-only imports, no runtime cost).
 */

import type { AppraisalResult, GridMwEstimate, SiteRegistryEntry } from '../types';
import type { InfraResult } from './infraLookup';
import { estimatePotentialMW } from './potentialMW';
import type { GasAnalysisResult } from './gasAnalysis';
import type { WaterAnalysisResult } from './waterAnalysis.types';
import type { TransportResult } from '../types/infrastructure';
import { formatCurrencyShort, formatDistanceMi, interstateLabel } from '../utils/format';
import { computeRampSchedule, DEFAULT_ANNUAL_CAP_MW, type RampPhase } from './rampSchedule';

export interface SummaryRow {
  label: string;
  value: string;
  /** Render the value in brand red (a standout positive). */
  accent?: boolean;
}

export interface SummarySection {
  key: string;
  title: string;
  rows: SummaryRow[];
}

/** Numbers backing the Valuation bar chart (current land vs energized). */
export interface ValuationViz {
  currentValue: number; // midpoint of low/high
  currentLabel: string; // formatted range or single value
  energizedValue: number;
  valueCreated: number;
}

export interface ExecutiveSummaryModel {
  targetMW: number;
  ramp: RampPhase[];
  fullByLabel: string; // calendar year of the last ramp phase
  valuation: ValuationViz | null;
  /** Grid interconnection-headroom estimate (suggested MW). Null when no usable grid data. */
  gridPotential: GridMwEstimate | null;
  sections: SummarySection[]; // location → power → … → transport
}

/**
 * Normalize a territory field to a display string. Current pipeline stores
 * iso/tsp/utilityTerritory as `string[]`, but legacy records may hold a plain
 * joined string — handle both so the summary never crashes on older data.
 */
function firstNonEmpty(value: string[] | string | undefined | null): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (!Array.isArray(value)) return null;
  const joined = value.filter(Boolean).join(' / ');
  return joined || null;
}

// ── Section builders ────────────────────────────────────────────────────────

function powerSection(infra: InfraResult | null): SummarySection {
  const sub = infra?.nearbySubstations?.[0];
  return {
    key: 'power',
    title: 'Power',
    rows: [
      { label: 'RTO / ISO', value: firstNonEmpty(infra?.iso) ?? 'Not Available' },
      { label: 'Utility Territory', value: firstNonEmpty(infra?.utilityTerritory) ?? 'Not Available' },
      { label: 'Transmission Provider', value: firstNonEmpty(infra?.tsp) ?? 'Not Available' },
      {
        label: 'Nearest Substation',
        value: sub
          ? `${Math.round(sub.maxVolt)} kV · ${formatDistanceMi(sub.distanceMi)} · ${sub.name}`
          : 'Not Available',
      },
    ],
  };
}

function connectivitySection(bb: SiteRegistryEntry['broadbandResult']): SummarySection {
  let fiber = 'N/A';
  let fiberAccent = false;
  if (bb) {
    if (bb.fiberAvailable) {
      fiber = 'Available';
      fiberAccent = true;
    } else if (bb.nearbyServiceBlocks?.some((b) => b.fiberAvailable)) {
      fiber = 'On Request (~2 mi)';
    } else if (bb.countyProviders?.some((p) => p.technology === 'Fiber')) {
      fiber =
        bb.nearestCountyFiberMi != null ? `In County (~${bb.nearestCountyFiberMi} mi)` : 'In County';
    } else {
      fiber = 'No';
    }
  }
  return {
    key: 'connectivity',
    title: 'Connectivity',
    rows: [
      { label: 'Fiber', value: fiber, accent: fiberAccent },
      {
        label: 'Best Download',
        value: bb?.maxDownload ? `${bb.maxDownload.toLocaleString()} Mbps` : 'N/A',
      },
    ],
  };
}

function waterSection(water: WaterAnalysisResult | null): SummarySection {
  const fz = water?.floodZone;
  const wet = water?.wetlands;
  return {
    key: 'water',
    title: 'Water',
    rows: [
      {
        label: 'Flood Risk',
        value: fz ? (fz.zone === 'UNMAPPED' ? 'Unmapped' : `Zone ${fz.zone}`) : 'N/A',
      },
      {
        label: 'Wetlands',
        value: wet ? (wet.hasWetlands ? `${wet.wetlands.length} Found` : 'None') : 'N/A',
      },
      { label: 'Drought', value: water?.drought?.levelLabel ?? 'N/A' },
      {
        label: 'Precipitation',
        value: water?.precipitation ? `${water.precipitation.avgAnnualInches} in/yr` : 'N/A',
      },
    ],
  };
}

function gasSection(gas: GasAnalysisResult | null): SummarySection {
  const cc = gas?.gasDemand?.combinedCycle ?? null;
  const pipe = gas?.pipelines?.[0] ?? null;
  return {
    key: 'gas',
    title: 'Gas',
    rows: [
      {
        label: 'Combined Cycle',
        value: cc ? `${cc.dailyDemandMMscf} MMscf/day · ${cc.annualDemandBcf} Bcf/yr` : 'N/A',
      },
      {
        label: 'Nearest Pipeline',
        value: pipe
          ? `${formatDistanceMi(pipe.distanceMiles)} · ${pipe.operator} (${pipe.type})`
          : 'N/A',
      },
    ],
  };
}

function transportSection(transport: TransportResult | null): SummarySection {
  const i0 = transport?.interstates?.[0];
  const a0 = transport?.airports?.[0];
  const r0 = transport?.railroads?.[0];
  const p0 = transport?.ports?.[0];
  return {
    key: 'transport',
    title: 'Transport',
    rows: [
      {
        label: 'Interstate',
        value: i0 ? `${interstateLabel(i0)} · ${formatDistanceMi(i0.distanceMi)}` : 'Not Available',
      },
      {
        label: 'Airport',
        value: a0 ? `${a0.name} · ${formatDistanceMi(a0.distanceMi)}` : 'Not Available',
      },
      {
        label: 'Railroad',
        value: r0 ? `${r0.owner} · ${formatDistanceMi(r0.distanceMi)}` : 'Not Available',
      },
      {
        label: 'Port',
        value: p0 ? `${p0.name} · ${formatDistanceMi(p0.distanceMi)}` : 'Not Available',
      },
    ],
  };
}

function locationSection(site: SiteRegistryEntry): SummarySection {
  return {
    key: 'location',
    title: 'Location',
    rows: [
      {
        label: 'Coordinates',
        value: site.coordinates
          ? `${site.coordinates.lat}, ${site.coordinates.lng}`
          : 'N/A',
      },
      { label: 'Address', value: site.address?.trim() || 'N/A' },
      {
        label: 'Acreage',
        value: site.acreage > 0 ? `${site.acreage.toLocaleString()} acres` : 'N/A',
      },
    ],
  };
}

function buildValuation(appraisal: AppraisalResult | null): ValuationViz | null {
  if (!appraisal) return null;
  const { currentValueLow: low, currentValueHigh: high, energizedValue, valueCreated } = appraisal;
  const currentValue = (low + high) / 2;
  const currentLabel =
    low > 0 || high > 0
      ? low === high
        ? formatCurrencyShort(low)
        : `${formatCurrencyShort(low)} – ${formatCurrencyShort(high)}`
      : 'N/A';
  return { currentValue, currentLabel, energizedValue, valueCreated };
}

export function buildExecutiveSummaryModel(
  site: SiteRegistryEntry,
  opts: { currentYear: number },
): ExecutiveSummaryModel {
  const targetMW = site.mwCapacity || 0;
  const startYear = opts.currentYear + 1;
  const ramp = computeRampSchedule(targetMW, { annualCapMW: DEFAULT_ANNUAL_CAP_MW, startYear });
  const lastPhase = ramp[ramp.length - 1];

  const infra = site.infraResult as unknown as InfraResult | null;
  const gas = site.gasResult as unknown as GasAnalysisResult | null;
  const water = site.waterResult as unknown as WaterAnalysisResult | null;
  const transport = site.transportResult as unknown as TransportResult | null;
  const bb = site.broadbandResult ?? null;

  // Always derive Grid Strength fresh from the stored infra. It's a cheap pure
  // compute, so we don't trust `site.gridMwEstimate` — older docs may hold a
  // stale shape from an earlier iteration and would crash the card.
  const gridPotential = infra ? estimatePotentialMW(infra) : null;

  return {
    targetMW,
    ramp,
    fullByLabel: lastPhase ? String(lastPhase.year) : '—',
    valuation: buildValuation(site.appraisalResult ?? null),
    gridPotential,
    sections: [
      locationSection(site),
      powerSection(infra),
      connectivitySection(bb),
      waterSection(water),
      gasSection(gas),
      transportSection(transport),
    ],
  };
}
