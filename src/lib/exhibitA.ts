/**
 * Exhibit A (Phase A Deliverables) synthesis — pure, no I/O.
 *
 * Builds the contract-aligned report model (General Project Information,
 * Capacity & Load Viability, ERCOT/SPP grid-specific requirements, data-center
 * metrics, constraints & fatal flaws, and the Go / Conditional Go / No-Go
 * recommendation) entirely from data the analysis sections already produce.
 * Nothing here is manually entered or site-hardcoded; every derived figure
 * states its basis so the report stays presentation-of-data, with assumptions
 * labeled where Exhibit A demands quantified ranges (ROM = ±50% desktop
 * estimate, not an engineering study).
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
import { classifyRto } from './politicalRadar/rtoJurisdiction';
import { computeRampSchedule, rampFromIncrements, type RampPhase } from './rampSchedule';
import { suggestGradeFromAppraisal } from './preConWorkflow';

// ── Public model ────────────────────────────────────────────────────────────

export interface ExhibitARow {
  label: string;
  value: string;
}

export interface ExhibitAFlaw {
  severity: 'fatal' | 'risk' | 'watch';
  title: string;
  detail: string;
}

export interface ExhibitAModel {
  /** §1 General Project Information */
  project: {
    rows: ExhibitARow[];
    coordinates: { lat: number; lng: number; decimal: string; dms: string } | null;
    county: string | null;
    city: string | null;
    state: string | null;
  };
  /** §2 Capacity & Load Viability */
  capacity: {
    rows: ExhibitARow[];
    ramp: RampPhase[];
    rampIsCustom: boolean;
    firmnessNote: string;
    energizationNote: string;
  };
  /** §3 (ERCOT) or §4 (SPP), selected by the site's grid */
  grid: {
    kind: 'ercot' | 'spp' | 'other';
    sectionTitle: string;
    rows: ExhibitARow[];
    queueProjects: Array<{ name: string; mw: number; fuel: string; cod: string }>;
    romAssumptions: string;
    notes: ExhibitARow[];
  };
  /** §6 Data Center-Specific Metrics */
  dataCenter: { rows: ExhibitARow[] };
  /** §7 Constraints & Fatal Flaws */
  flaws: ExhibitAFlaw[];
  /** §8 Recommendations */
  recommendation: {
    grade: PreConGrade | null;
    gradeLabel: string;
    gradeSource: string;
    rows: ExhibitARow[];
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
  if (unknown) return `Unnamed (HIFLD ${unknown[1]})`;
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

function quarterOf(ts: number): string {
  const d = new Date(ts);
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
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
// interconnection. Deliberately wide, deliberately labeled — Exhibit A asks
// for quantified ranges, not engineered estimates.
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
  const lines = input.infra?.nearbyLines ?? [];
  const state = input.infra?.detectedState ?? input.gas?.detectedState ?? null;
  const lat = input.coordinates?.lat ?? 0;
  const lng = input.coordinates?.lng ?? 0;
  const rto = input.coordinates ? classifyRto(state, lat, lng) : null;
  const isoLabel = input.infra?.iso || rto?.rto || 'Unknown';
  const kind: 'ercot' | 'spp' | 'other' = isoLabel.toUpperCase().includes('ERCOT')
    ? 'ercot'
    : isoLabel.toUpperCase().includes('SPP')
      ? 'spp'
      : 'other';

  const county = input.county || input.labor?.resolvedCounty?.name || null;
  const city = parseCity(input.address);

  // Transmission proximity primitives (substations carry distance; lines don't).
  const sorted = [...subs].sort((a, b) => a.distanceMi - b.distanceMi);
  const nearestSub = sorted[0] ?? null;
  const nearest138 = sorted.find((s) => s.maxVolt >= 100) ?? null;
  const nearest345 = sorted.find((s) => s.maxVolt >= 300) ?? null;
  const capacitySubs = sorted.filter((s) => /capacity/i.test(s.status));
  const sources138Within5 = sorted.filter((s) => s.maxVolt >= 100 && s.distanceMi <= 5);
  const voltageLevels = Array.from(
    new Set([...subs.map((s) => s.maxVolt), ...lines.map((l) => l.voltage)].filter((v) => v > 0)),
  ).sort((a, b) => b - a);

  const ownerCounts = new Map<string, number>();
  for (const o of [...subs.map((s) => s.owner), ...lines.map((l) => l.owner)]) {
    const name = (o ?? '').trim();
    if (!name || name === '—') continue;
    ownerCounts.set(name, (ownerCounts.get(name) ?? 0) + 1);
  }
  const transmissionOwners = [...ownerCounts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);

  // ── §1 General Project Information ──
  const coordinates = input.coordinates
    ? {
        lat,
        lng,
        decimal: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        dms: `${toDms(lat, 'N', 'S')} ${toDms(lng, 'E', 'W')}`,
      }
    : null;

  const lseNote =
    kind === 'ercot'
      ? `Competitive choice area — the load-serving entity is the customer's retail electric provider (REP); delivery service by ${input.infra?.utilityTerritory || 'the TDU'}.`
      : kind === 'spp'
        ? `${input.infra?.utilityTerritory || 'The local utility'} serves as load-serving entity under SPP open-access transmission.`
        : input.infra?.utilityTerritory || 'See utility territory.';

  const projectRows: ExhibitARow[] = [
    { label: 'Applicable Grid (ISO / RTO)', value: isoLabel },
    ...(rto && rto.rto !== 'NONE'
      ? []
      : rto
        ? [{ label: 'Jurisdiction Note', value: 'FERC-jurisdictional / non-RTO area' }]
        : []),
    {
      label: 'Transmission Owner(s)',
      value:
        transmissionOwners.length > 0
          ? transmissionOwners.slice(0, 3).join('; ')
          : 'Not identified in HIFLD data',
    },
    { label: 'Transmission Service Provider', value: input.infra?.tsp || 'N/A' },
    { label: 'Load-Serving Entity (LSE)', value: lseNote },
    {
      label: 'Property Acreage',
      value: `${input.acreage.toLocaleString('en-US', { maximumFractionDigits: 1 })} acres`,
    },
    {
      label: 'Jurisdiction (City / County / State)',
      value: [city ?? '—', county ?? '—', state ?? '—'].join(' / '),
    },
    ...(coordinates
      ? [
          { label: 'Coordinates (decimal)', value: coordinates.decimal },
          { label: 'Coordinates (DMS)', value: coordinates.dms },
        ]
      : []),
    {
      label: 'Proximity to Transmission',
      value: nearestSub
        ? `Nearest substation ${cleanGridName(nearestSub.name)} at ${nearestSub.distanceMi.toFixed(1)} mi (${Math.round(nearestSub.maxVolt)} kV)` +
          (nearest345 ? `; nearest 345 kV element ${nearest345.distanceMi.toFixed(1)} mi` : '')
        : 'No substations identified within the analysis radius',
    },
    {
      label: 'Fiber Proximity',
      value: input.broadband
        ? input.broadband.fiberAvailable
          ? `Fiber available on-site (${
              input.broadband.providers
                .filter((p) => p.technology === 'Fiber')
                .map((p) => p.providerName)
                .join(', ') || 'see provider table'
            })`
          : 'No fiber reported at the site census block — see Broadband section for nearby and county availability'
        : 'Broadband analysis not run',
    },
  ];

  // ── §2 Capacity & Load Viability ──
  const startYear = new Date(input.generatedAt).getFullYear() + 1;
  const rampIsCustom = !!input.customRamp && input.customRamp.length > 0;
  const ramp = rampIsCustom
    ? rampFromIncrements(input.customRamp!, { startYear })
    : computeRampSchedule(input.targetMW, { startYear });

  const cq = input.countyQueue;
  const medianDays = cq?.median_time_to_cod_days ?? null;
  let energizationValue: string;
  let energizationNote: string;
  if (medianDays && medianDays > 0) {
    const lowTs = input.generatedAt + medianDays * 0.75 * 86_400_000;
    const highTs = input.generatedAt + medianDays * 1.25 * 86_400_000;
    energizationValue = `${quarterOf(lowTs)} – ${quarterOf(highTs)}`;
    energizationNote = `Indicative window derived from the county interconnection queue's median time-to-COD (${Math.round(
      medianDays / 30.4,
    )} months over ${cq?.completed_sample_size ?? 0} completed projects), ±25%. Actual energization is set by the ${
      kind === 'spp' ? 'SPP transmission service study' : 'TSP/ERCOT study'
    } process and utility construction scheduling.`;
  } else {
    energizationValue = 'Insufficient county queue sample — see note';
    energizationNote =
      'The county interconnection queue has too few completed projects to derive a local median time-to-COD. Large-load energization windows in this market typically run 24–48 months from study initiation, dependent on the utility study process and required network upgrades.';
  }

  const initialSupport = nearestSub
    ? nearestSub.distanceMi <= 5
      ? `Supported by indicators — ${cleanGridName(nearestSub.name)} (${Math.round(nearestSub.maxVolt)} kV) at ${nearestSub.distanceMi.toFixed(1)} mi`
      : `Indicators weak — nearest substation ${nearestSub.distanceMi.toFixed(1)} mi`
    : 'No substation identified in the analysis radius';
  const scalableSupport = nearest138
    ? nearest138.distanceMi <= 5
      ? `Supported by indicators — ${Math.round(nearest138.maxVolt)} kV substation at ${nearest138.distanceMi.toFixed(1)} mi${
          nearest345 ? `, 345 kV element at ${nearest345.distanceMi.toFixed(1)} mi` : ''
        }`
      : `Possible — nearest 100 kV+ substation ${nearest138.distanceMi.toFixed(1)} mi`
    : 'No 100 kV+ substation identified — 100 MW+ load would require new transmission infrastructure';

  const capacityRows: ExhibitARow[] = [
    { label: 'Target Capacity', value: `${input.targetMW.toLocaleString('en-US')} MW` },
    {
      label: 'Estimated Deliverable Capacity',
      value:
        capacitySubs.length > 0
          ? `${capacitySubs.length} nearby substation(s) flagged "Capacity Available" (nearest: ${cleanGridName(capacitySubs[0].name)}, ${capacitySubs[0].distanceMi.toFixed(1)} mi, ${Math.round(capacitySubs[0].maxVolt)} kV)`
          : 'No nearby substations flagged "Capacity Available" in HIFLD data — deliverable MW requires utility confirmation',
    },
    { label: 'Initial Load (20–50 MW)', value: initialSupport },
    { label: 'Scalable Load (100 MW+)', value: scalableSupport },
    { label: 'Availability Timeline', value: energizationValue },
    {
      label: 'Transmission Constraints',
      value: cq
        ? `County queue: ${cq.active_count} active project(s) / ${Math.round(cq.active_mw).toLocaleString('en-US')} MW competing for delivery capacity; ${cq.in_service_count} in service (${Math.round(cq.in_service_mw).toLocaleString('en-US')} MW)`
        : 'County interconnection queue data not available for this site',
    },
    {
      label: 'Congestion / Curtailment Indicators',
      value:
        cq?.withdrawal_rate_5y != null
          ? `${Math.round(cq.withdrawal_rate_5y * 100)}% of county queue MW withdrawn over 5 years (sample ${cq.completed_sample_size}) — elevated rates signal study-phase constraints`
          : 'No statistically meaningful county withdrawal-rate sample',
    },
  ];

  const firmnessNote =
    'Firm vs. non-firm allocation is determined exclusively by the transmission provider’s interconnection/delivery study. The figures above are desktop indicators from public infrastructure and queue data; they do not constitute confirmed deliverable capacity.';

  // ── §3 / §4 grid-specific ──
  const romBase =
    nearest345 && nearest345.distanceMi <= (nearest138?.distanceMi ?? Infinity) ? ROM_345 : ROM_138;
  const romTarget = nearest138 ?? nearestSub;
  const romKv = romTarget ? (romTarget.maxVolt >= 300 ? ROM_345 : romBase) : ROM_138;
  const romDist = romTarget?.distanceMi ?? null;
  const romLow = romDist != null ? romDist * romKv.linePerMileLow + romKv.stationLow : null;
  const romHigh = romDist != null ? romDist * romKv.linePerMileHigh + romKv.stationHigh : null;
  const romAssumptions = romTarget
    ? `ROM ±50%, desktop estimate: ${romDist!.toFixed(1)} mi interconnection to ${cleanGridName(romTarget.name)} at $${(
        romKv.linePerMileLow / 1_000_000
      ).toFixed(1)}M–$${(romKv.linePerMileHigh / 1_000_000).toFixed(1)}M per mile plus ${fmtRange(
        romKv.stationLow,
        romKv.stationHigh,
      )} station/POI work. Excludes network upgrades, which are sized by the utility study.`
    : 'No interconnection target identified — ROM not computable.';

  const queueProjects = (cq?.top_active ?? []).slice(0, 8).map((p) => ({
    name: p.name ? cleanGridName(p.name) : 'Undisclosed project',
    mw: p.mw,
    fuel: p.fuel,
    cod: p.cod ?? '—',
  }));

  const lflApplicable = kind === 'ercot' && input.targetMW >= 75;
  const gridRows: ExhibitARow[] =
    kind === 'spp'
      ? [
          { label: 'Transmission Owner', value: transmissionOwners[0] ?? 'Not identified' },
          {
            label: 'Voltage Levels Nearby',
            value:
              voltageLevels.length > 0
                ? voltageLevels.map((v) => `${Math.round(v)} kV`).join(' / ')
                : 'N/A',
          },
          {
            label: 'SPP Generation Interconnection Queue (county)',
            value: cq
              ? `${cq.active_count} active / ${Math.round(cq.active_mw).toLocaleString('en-US')} MW`
              : 'No county data',
          },
          {
            label: 'Available Transmission Service',
            value:
              'Firm vs. non-firm point-to-point service is allocated through SPP’s Transmission Service Request (TSR) and Aggregate Transmission Service Study (ATSS) processes — see note below.',
          },
          {
            label: 'Delivery Point Indicators',
            value: nearestSub
              ? `${cleanGridName(nearestSub.name)} (${Math.round(nearestSub.maxVolt)} kV, ${nearestSub.distanceMi.toFixed(1)} mi)`
              : 'None identified',
          },
          {
            label: 'Interconnection Cost (ROM)',
            value: romLow != null ? fmtRange(romLow, romHigh!) : 'Not computable',
          },
          {
            label: 'Queue / Cost-Allocation Risk',
            value: medianDays
              ? `County median time-to-COD ${Math.round(medianDays / 30.4)} months; ATSS cost allocation finalized only at study completion`
              : 'ATSS cost allocation finalized only at study completion; queue timing data sparse for this county',
          },
        ]
      : [
          { label: 'Transmission Service Provider (TSP)', value: input.infra?.tsp || 'N/A' },
          {
            label: 'Voltage Levels Nearby',
            value:
              voltageLevels.length > 0
                ? voltageLevels.map((v) => `${Math.round(v)} kV`).join(' / ')
                : 'N/A',
          },
          {
            label: 'Substations with Available Capacity',
            value:
              capacitySubs.length > 0
                ? capacitySubs
                    .slice(0, 4)
                    .map(
                      (s) =>
                        `${cleanGridName(s.name)} (${Math.round(s.maxVolt)} kV, ${s.distanceMi.toFixed(1)} mi)`,
                    )
                    .join('; ')
                : 'None flagged in HIFLD data — utility confirmation required',
          },
          {
            label: 'Known Generation Interconnection Requests (county)',
            value: cq
              ? `${cq.active_count} active / ${Math.round(cq.active_mw).toLocaleString('en-US')} MW — top projects listed below`
              : 'No county queue data',
          },
          {
            label: 'Competing Large-Load Visibility',
            value:
              'ERCOT does not publish a public large-load interconnection queue; competing load is visible only through the TSP. Generation queue activity above is the public proxy for grid activity in the county.',
          },
          {
            label: 'POI Feasibility',
            value: romTarget
              ? `Primary candidate: ${cleanGridName(romTarget.name)} (${Math.round(romTarget.maxVolt)} kV) at ${romTarget.distanceMi.toFixed(1)} mi — within typical gen-tie/load-tie range`
              : 'No candidate POI identified within the analysis radius',
          },
          {
            label: 'Interconnection Cost (ROM)',
            value: romLow != null ? fmtRange(romLow, romHigh!) : 'Not computable',
          },
          {
            label: 'Network Upgrade Responsibility',
            value:
              'In ERCOT, transmission network upgrades are funded by the TSP and socialized through postage-stamp transmission rates; the customer funds its interconnection facilities (line, metering, station work).',
          },
          {
            label: 'ERCOT Large Flexible Load (LFL)',
            value: lflApplicable
              ? `Applicable — at ${input.targetMW.toLocaleString('en-US')} MW this site exceeds ERCOT's 75 MW LFL threshold: interconnection requires the ERCOT LFL review process, and curtailment-responsiveness expectations apply.`
              : 'Below the 75 MW LFL threshold at the modeled capacity.',
          },
          {
            label: 'Demand Response / Curtailment Exposure',
            value:
              'ERCOT market exposure is manageable through 4CP avoidance and Emergency Response Service participation; LFL-class loads are expected to be curtailable during scarcity events.',
          },
        ];

  // ── §6 Data Center-Specific Metrics ──
  const dcRows: ExhibitARow[] = [
    {
      label: 'Redundancy Potential (dual feed)',
      value:
        sources138Within5.length >= 2
          ? `${sources138Within5.length} independent 100 kV+ substations within 5 mi — dual-feed architecture is plausible (${sources138Within5
              .slice(0, 3)
              .map((s) => cleanGridName(s.name))
              .join(', ')})`
          : sources138Within5.length === 1
            ? 'Single 100 kV+ source within 5 mi — dual feed would require a second, longer interconnection'
            : 'No 100 kV+ source within 5 mi — dual-feed potential not indicated',
    },
    {
      label: 'Substation Proximity for Expansion',
      value: nearestSub
        ? `Nearest station ${nearestSub.distanceMi.toFixed(1)} mi; on-site switchyard land requirement is covered by the ${input.acreage.toLocaleString('en-US', { maximumFractionDigits: 0 })}-acre parcel (typical 345/138 kV yard: 5–15 acres)`
        : 'No station identified',
    },
    {
      label: 'Fiber + Power Corridor Alignment',
      value: input.broadband?.fiberAvailable
        ? 'Fiber present at the site census block and transmission infrastructure within range — corridor alignment achievable'
        : 'Fiber not reported on-site; last-mile build would parallel the power interconnection corridor',
    },
    {
      label: 'Cooling Water Context',
      value: input.water
        ? `${input.water.precipitation ? `${input.water.precipitation.avgAnnualInches.toFixed(1)} in avg annual precipitation` : 'Precipitation data unavailable'}${
            input.water.drought ? `; current drought status ${input.water.drought.levelLabel}` : ''
          } — see Water & Environmental section`
        : 'Water analysis not run',
    },
  ];

  // ── §7 Constraints & Fatal Flaws ──
  const flaws: ExhibitAFlaw[] = [];
  const wfz = input.water?.floodZone;
  if (wfz && /high/i.test(wfz.riskLevel)) {
    flaws.push({
      severity: 'fatal',
      title: 'High-risk FEMA flood zone',
      detail: `Zone ${wfz.zone} (${wfz.description}). Substation and building siting would require flood mitigation or is infeasible.`,
    });
  }
  if (!nearestSub) {
    flaws.push({
      severity: 'fatal',
      title: 'No transmission infrastructure in range',
      detail:
        'No substations identified within the analysis radius — interconnection economics are prohibitive.',
    });
  } else if (nearestSub.distanceMi > 10) {
    flaws.push({
      severity: 'risk',
      title: 'Distant interconnection',
      detail: `Nearest substation is ${nearestSub.distanceMi.toFixed(1)} mi away — line cost and routing risk are elevated.`,
    });
  }
  if (nearestSub && !nearest138) {
    flaws.push({
      severity: 'risk',
      title: 'No 100 kV+ infrastructure nearby',
      detail:
        'Only distribution-class infrastructure identified — large-load service requires new transmission-class facilities.',
    });
  }
  const wet = input.water?.wetlands;
  if (wet?.hasWetlands && wet.nearestWetlandFt != null && wet.nearestWetlandFt < 1000) {
    flaws.push({
      severity: 'watch',
      title: 'Wetlands within 1,000 ft',
      detail: `Nearest mapped wetland ${Math.round(wet.nearestWetlandFt)} ft from the site point — Section 404 permitting may constrain layout.`,
    });
  }
  if (input.water?.drought && /D[34]/.test(input.water.drought.currentLevel)) {
    flaws.push({
      severity: 'watch',
      title: 'Severe drought conditions',
      detail: `${input.water.drought.levelLabel} at analysis time — relevant if evaporative cooling or new water supply is planned.`,
    });
  }
  if (input.broadband && !input.broadband.fiberAvailable) {
    flaws.push({
      severity: 'watch',
      title: 'No on-site fiber reported',
      detail:
        'FCC block data reports no fiber at the site; last-mile construction budget required.',
    });
  }
  if (cq && cq.active_mw > 1000) {
    flaws.push({
      severity: 'watch',
      title: 'Heavy county queue activity',
      detail: `${Math.round(cq.active_mw).toLocaleString('en-US')} MW active in the county queue — competition for delivery capacity and study throughput.`,
    });
  }
  if (
    input.gas &&
    (input.gas.pipelines.length === 0 || input.gas.pipelines[0].distanceMiles > 15)
  ) {
    flaws.push({
      severity: 'watch',
      title: 'Gas supply distance',
      detail:
        input.gas.pipelines.length === 0
          ? 'No transmission pipelines identified nearby.'
          : `Nearest pipeline ${input.gas.pipelines[0].distanceMiles.toFixed(1)} mi — on-site generation backup economics affected.`,
    });
  }

  // ── §8 Recommendations ──
  const suggested = suggestGradeFromAppraisal(input.appraisal);
  const grade = input.llrGrade ?? suggested ?? null;
  const gradeLabelMap: Record<PreConGrade, string> = {
    go: 'GO',
    'conditional-go': 'CONDITIONAL GO',
    'no-go': 'NO-GO',
  };
  const fatalCount = flaws.filter((f) => f.severity === 'fatal').length;
  const riskCount = flaws.filter((f) => f.severity === 'risk').length;
  const likelihood =
    fatalCount > 0
      ? 'Low — fatal flaw identified'
      : capacitySubs.length > 0 && nearest138 && nearest138.distanceMi <= 5 && riskCount === 0
        ? 'High — capacity-flagged substations nearby, transmission-class infrastructure within 5 mi, no elevated risks'
        : nearest138
          ? 'Moderate — transmission-class infrastructure in range; utility study required to confirm'
          : 'Low — no transmission-class infrastructure identified';

  const capitalItems: string[] = [];
  let capLow = 0;
  let capHigh = 0;
  if (romLow != null && romHigh != null) {
    capLow += romLow;
    capHigh += romHigh;
    capitalItems.push('power interconnection (ROM)');
  }
  if (input.gas?.lateralEstimate) {
    capLow += input.gas.lateralEstimate.estimatedTotalCost.low;
    capHigh += input.gas.lateralEstimate.estimatedTotalCost.high;
    capitalItems.push('gas lateral');
  }

  const recommendationRows: ExhibitARow[] = [
    {
      label: 'Power Availability',
      value:
        capacitySubs.length > 0
          ? `${capacitySubs.length} capacity-flagged substation(s) nearby; voltage levels ${voltageLevels
              .slice(0, 3)
              .map((v) => `${Math.round(v)} kV`)
              .join(' / ')}`
          : nearest138
            ? `Transmission-class infrastructure within ${nearest138.distanceMi.toFixed(1)} mi; capacity unconfirmed`
            : 'Weak — no transmission-class infrastructure identified',
    },
    {
      label: 'Client Cost Indicators',
      value:
        capitalItems.length > 0
          ? `${fmtRange(capLow, capHigh)} indicative pre-construction capital (${capitalItems.join(' + ')}), excluding land and network upgrades`
          : 'Insufficient data to compute',
    },
    { label: 'Infrastructure Timeline', value: energizationValue },
    {
      label: 'Expected Funding Requirements',
      value: input.appraisal
        ? `Land basis ${fmtMoney((input.appraisal.currentValueLow + input.appraisal.currentValueHigh) / 2)} plus the capital items above; utility study deposits and security per TSP tariff`
        : 'Run land valuation for the funding picture',
    },
    {
      label: 'Key Risks',
      value:
        flaws.length > 0
          ? flaws
              .slice(0, 4)
              .map((f) => f.title)
              .join('; ')
          : 'No fatal flaws or elevated risks identified from the data sources analyzed',
    },
    { label: 'Likelihood of Securing Capacity', value: likelihood },
  ];

  return {
    project: { rows: projectRows, coordinates, county, city, state },
    capacity: { rows: capacityRows, ramp, rampIsCustom, firmnessNote, energizationNote },
    grid: {
      kind,
      sectionTitle:
        kind === 'spp'
          ? 'SPP-Specific Requirements'
          : kind === 'ercot'
            ? 'ERCOT-Specific Requirements'
            : 'Grid-Specific Requirements',
      rows: gridRows,
      queueProjects,
      romAssumptions,
      notes:
        kind === 'spp'
          ? [
              {
                label: 'TSR Viability',
                value:
                  'Long-term firm service viability depends on ATSS results and upgrade cost allocation; non-firm service is typically available sooner at curtailment risk.',
              },
            ]
          : [],
    },
    dataCenter: { rows: dcRows },
    flaws,
    recommendation: {
      grade,
      gradeLabel: grade ? gradeLabelMap[grade] : 'NOT GRADED',
      gradeSource: input.llrGrade
        ? 'Grade set in the Large Load Request workflow (engineer-reviewed)'
        : suggested
          ? 'Preliminary grade auto-suggested from the financial appraisal — pending LLR engineer review'
          : 'No appraisal available to suggest a grade',
      rows: recommendationRows,
    },
  };
}
