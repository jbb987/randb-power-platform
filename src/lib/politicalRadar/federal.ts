/**
 * Federal layer orchestrator.
 *
 * Pulls the five federal signals in parallel, builds the user-facing signal
 * rows, and computes a 0–3 sub-score per the rubric in the brief:
 *
 *   0 (clean)    — no threatening bills, non-FERC RTO, no tribal proximity,
 *                  favorable EO posture
 *   1 (watch)    — ≥1 relevant bill in committee OR tribal proximity flag
 *   2 (elevated) — bill passed one chamber OR active FERC large-load docket
 *                  affecting site's RTO (FERC docket scraping is v2)
 *   3 (critical) — federal moratorium law passed OR active federal court
 *                  injunction against similar projects in the region
 *                  (court tracking is v2; flag stays unknown for now)
 *
 * Each signal's status falls into one of:
 *   confirmed_clean | positive | watch | elevated | critical | unknown
 * The "unknown" state is reserved for actual data-fetch failures so the UI
 * never paints green over a coverage gap.
 */

import type {
  FederalBill,
  FederalEO,
  FederalLayerData,
  PoliticalSignal,
  RiskBand,
  RtoJurisdiction,
  TribalProximity,
} from './types';
import { fetchFederalBills } from './congressBills';
import { fetchExecutiveOrders } from './executiveOrders';
import { fetchTribalProximity } from './tribalProximity';
import { fetchCongressionalReps } from './congressionalReps';
import { classifyRto } from './rtoJurisdiction';
import { detectStateFromCoords } from '../solarAverages';

function bandFor(score: 0 | 1 | 2 | 3): RiskBand {
  if (score === 0) return 'clean';
  if (score === 1) return 'watch';
  if (score === 2) return 'elevated';
  return 'critical';
}

function billsSignal(bills: FederalBill[], error: string | null): PoliticalSignal {
  if (error) {
    return {
      key: 'bills',
      label: 'Federal bills',
      status: 'unknown',
      summary: 'Bill data unavailable.',
      detail: error,
    };
  }

  const enacted = bills.find((b) => b.status === 'Enacted');
  if (enacted) {
    return {
      key: 'bills',
      label: 'Federal bills',
      status: 'critical',
      summary: `${enacted.type}.${enacted.number} enacted — ${enacted.title.slice(0, 80)}`,
      detail: `Latest action ${enacted.latestActionDate ?? 'date unknown'}.`,
    };
  }

  const passedChamber = bills.find((b) => b.status === 'Passed Chamber');
  if (passedChamber) {
    return {
      key: 'bills',
      label: 'Federal bills',
      status: 'elevated',
      summary: `${passedChamber.type}.${passedChamber.number} passed one chamber — ${passedChamber.title.slice(0, 80)}`,
      detail: `Latest action ${passedChamber.latestActionDate ?? 'date unknown'}.`,
    };
  }

  if (bills.length === 0) {
    return {
      key: 'bills',
      label: 'Federal bills',
      status: 'confirmed_clean',
      summary: 'No active federal bills targeting DC / large-load projects.',
    };
  }

  // At least one bill in committee / introduced
  const top = bills[0];
  return {
    key: 'bills',
    label: 'Federal bills',
    status: 'watch',
    summary: `${top.type}.${top.number} ${top.status.toLowerCase()} — ${top.title.slice(0, 80)}`,
    detail:
      bills.length > 1 ? `Plus ${bills.length - 1} more matching bill(s) tracked.` : undefined,
  };
}

function rtoSignal(rto: RtoJurisdiction): PoliticalSignal {
  if (rto.rto === 'ERCOT' && !rto.ferc) {
    return {
      key: 'rto',
      label: 'RTO / FERC jurisdiction',
      status: 'positive',
      summary: 'ERCOT site — FERC rate jurisdiction does not apply.',
      detail: rto.reason,
    };
  }
  if (rto.rto === 'NONE') {
    return {
      key: 'rto',
      label: 'RTO / FERC jurisdiction',
      status: 'watch',
      summary: 'No organized RTO/ISO; bilateral market.',
      detail: rto.reason,
    };
  }
  return {
    key: 'rto',
    label: 'RTO / FERC jurisdiction',
    status: 'watch',
    summary: `${rto.rto} territory — FERC orders apply; surface any active large-load dockets.`,
    detail: rto.reason,
  };
}

function eosSignal(eos: FederalEO[], error: string | null): PoliticalSignal {
  if (error) {
    return {
      key: 'eos',
      label: 'Executive orders',
      status: 'unknown',
      summary: 'EO data unavailable.',
      detail: error,
    };
  }
  if (eos.length === 0) {
    return {
      key: 'eos',
      label: 'Executive orders',
      status: 'confirmed_clean',
      summary: 'No recent EOs touching DC siting.',
    };
  }
  const unfavorable = eos.filter((e) => e.posture === 'unfavorable');
  if (unfavorable.length > 0) {
    return {
      key: 'eos',
      label: 'Executive orders',
      status: 'elevated',
      summary: `${unfavorable.length} unfavorable EO(s) recent — review carefully.`,
      detail: unfavorable.map((e) => e.title).join(' • '),
    };
  }
  const favorable = eos.filter((e) => e.posture === 'favorable');
  return {
    key: 'eos',
    label: 'Executive orders',
    status: 'positive',
    summary:
      favorable.length > 0
        ? 'Favorable EO posture (permitting / AI-infra / energy-emergency framings).'
        : 'Recent EOs are neutral toward DC siting.',
    detail: eos
      .slice(0, 3)
      .map((e) => e.title)
      .join(' • '),
  };
}

function tribalSignal(t: TribalProximity | null, error: string | null): PoliticalSignal {
  if (error || !t) {
    return {
      key: 'tribal',
      label: 'Tribal proximity',
      status: 'unknown',
      summary: 'Tribal-area data unavailable.',
      detail: error ?? 'No data returned.',
    };
  }
  if (t.within50Mi) {
    return {
      key: 'tribal',
      label: 'Tribal proximity',
      status: 'watch',
      summary: `Reservation within ${t.nearestMi} mi (${t.nearestName ?? 'unnamed'}).`,
      detail:
        'If a federal permit is required (NEPA / 404), Section 106 NHPA consultation may be triggered.',
    };
  }
  return {
    key: 'tribal',
    label: 'Tribal proximity',
    status: 'confirmed_clean',
    summary: t.nearestMi
      ? `No tribal proximity (nearest reservation ${t.nearestMi} mi away).`
      : 'No federally recognized reservations within search radius.',
  };
}

/** Court signal — placeholder until CourtListener integration in v2. */
function courtSignal(): PoliticalSignal {
  return {
    key: 'court',
    label: 'Federal court actions',
    status: 'unknown',
    summary: 'Court tracking not yet wired (CourtListener pipeline is v2).',
    detail:
      'No automated check for active federal injunctions against DC projects in the site\'s circuit. Manual diligence still required.',
  };
}

// ── Score computation ──────────────────────────────────────────────────

function computeScore(signals: PoliticalSignal[]): { score: 0 | 1 | 2 | 3; why: string[] } {
  const why: string[] = [];
  let score: 0 | 1 | 2 | 3 = 0;

  for (const s of signals) {
    if (s.status === 'critical') {
      score = 3;
      why.push(`Critical: ${s.summary}`);
    } else if (s.status === 'elevated' && score < 2) {
      score = 2;
      why.push(`Elevated: ${s.summary}`);
    } else if (s.status === 'watch' && score < 1) {
      score = 1;
      why.push(`Watch: ${s.summary}`);
    } else if (s.status === 'elevated' || s.status === 'watch') {
      // score already at or above this level — still record contributors
      why.push(`${s.label}: ${s.summary}`);
    } else if (s.status === 'positive') {
      why.push(`Positive: ${s.summary}`);
    } else if (s.status === 'confirmed_clean') {
      why.push(`Clean: ${s.summary}`);
    } else if (s.status === 'unknown') {
      // Unknowns don't move the score — but they should be visible.
      why.push(`Unknown: ${s.label} — ${s.summary}`);
    }
  }

  return { score, why };
}

// ── Public entry point ─────────────────────────────────────────────────

export interface FederalAnalysisInput {
  lat: number;
  lng: number;
}

export async function analyzeFederalLayer(input: FederalAnalysisInput): Promise<FederalLayerData> {
  const { lat, lng } = input;

  // Resolve state first — RTO classification needs it. Other fetchers run
  // in parallel without needing it.
  const statePromise = detectStateFromCoords(lat, lng);

  const [bills, eos, tribal, reps] = await Promise.all([
    fetchFederalBills(),
    fetchExecutiveOrders(),
    fetchTribalProximity(lat, lng),
    fetchCongressionalReps(lat, lng),
  ]);

  const state = await statePromise;
  const rto = classifyRto(state, lat, lng);

  // Build the 5 signal rows in display order (matches the brief: bills,
  // RTO, EOs, tribal, court).
  const sBills = billsSignal(bills.bills, bills.error);
  const sRto = rtoSignal(rto);
  const sEos = eosSignal(eos.eos, eos.error);
  const sTribal = tribalSignal(tribal.data, tribal.error);
  const sCourt = courtSignal();
  const signals = [sBills, sRto, sEos, sTribal, sCourt];

  const { score, why } = computeScore(signals);

  return {
    subScore: score,
    band: bandFor(score),
    whyScored: why,
    signals,
    bills: bills.bills,
    billsError: bills.error,
    eos: eos.eos,
    eosError: eos.error,
    rto,
    tribal: tribal.data,
    tribalError: tribal.error,
    injunctions: null,
    reps: reps.reps,
    repsError: reps.error,
    resolvedDistrict: reps.resolvedDistrict,
    analyzedAt: Date.now(),
  };
}
