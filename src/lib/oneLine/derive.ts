// Pure electrical derivation: turns an OneLineSpec into the concrete numbers
// the layout draws. No I/O, fully unit-testable.

import type { OneLineSpec } from './types';

export interface Derived {
  pf: number;
  deliveryKV: number;
  mvKV: number;
  utilizationV: number;
  feeds: number; // 1 or 2

  ultimateMW: number;
  ultimateMVA: number;
  phase1MW: number;
  phased: boolean;

  mvaPerXfmr: number;
  xfmrTotal: number; // step-down transformers at ultimate buildout
  xfmrPhase1: number; // energized in phase 1
  firmMVA: number; // (N-1) * mvaPerXfmr  (N-1 redundancy)
  installedMVA: number;

  conductor: string;
  feedAmps: number; // per feed at delivery kV

  padMVA: number;
  rmuCellsShown: number; // representative count drawn

  xfmrPriA: number; // main xfmr primary amps @ deliveryKV
  xfmrSecA: number; // main xfmr secondary amps @ mvKV
  padPriA: number; // pad xfmr primary amps @ mvKV
  padSecA: number; // pad xfmr secondary amps @ utilization V

  mainBusA: number;
  mvBusA: number;

  phase1Year?: number;
  phase2Year?: number;
}

/** 3-phase line current. kv in kilovolts, returns amps. */
function ampsKV(mw: number, kv: number, pf: number): number {
  return (mw * 1000) / (Math.sqrt(3) * kv * pf);
}

/** Smallest N (>=2) such that (N-1) units carry the load — N-1 firm sizing.
 *  Guards against non-positive / non-finite inputs so a bad form value (a typed
 *  0, negative, or a 0 power factor making the load Infinity) can't spin forever. */
function nMinusOneCount(mva: number, perUnit: number): number {
  if (!(perUnit > 0) || !Number.isFinite(mva) || mva <= 0) return 2;
  let n = 2;
  while ((n - 1) * perUnit < mva) n++;
  return n;
}

/** Standard transformer ratings the auto-picker may choose from (MVA). */
const STANDARD_MVA = [75, 100, 150, 250];
/** Aim to keep the drawn transformer count at or below this when auto-picking. */
const TARGET_MAX_XFMR = 4;

/** Pick the smallest standard transformer size whose N-1 count stays readable,
 *  so a big site uses fewer/larger units instead of dozens of small ones. Falls
 *  back to the largest standard size for very large loads. */
function autoPickMva(loadMVA: number): number {
  return (
    STANDARD_MVA.find((s) => nMinusOneCount(loadMVA, s) <= TARGET_MAX_XFMR) ??
    STANDARD_MVA[STANDARD_MVA.length - 1]
  );
}

export function deriveElectrical(spec: OneLineSpec): Derived {
  // Positive-only guards: a typed 0 / negative slips past `??` (only null/undefined
  // are caught) and would otherwise divide-by-zero or spin nMinusOneCount forever.
  const pf = spec.powerFactor && spec.powerFactor > 0 ? spec.powerFactor : 0.97;
  const deliveryKV = spec.deliveryKV ?? 138;
  const mvKV = spec.mvKV ?? 13.8;
  const utilizationV = spec.utilizationV ?? 480;
  const feeds = (spec.feeds ?? 'dual') === 'dual' ? 2 : 1;

  const ultimateMW = spec.ultimateMW;
  const ultimateMVA = ultimateMW / pf;
  // Explicit positive size wins; otherwise auto-pick a standard size that keeps
  // the transformer count readable (small sites stay small, big sites use big units).
  const mvaPerXfmr =
    spec.mvaPerXfmr && spec.mvaPerXfmr > 0 ? spec.mvaPerXfmr : autoPickMva(ultimateMVA);

  const xfmrTotal = nMinusOneCount(ultimateMVA, mvaPerXfmr);

  const phase1MW = spec.phase1MW ?? ultimateMW;
  const phased = phase1MW < ultimateMW;
  const xfmrPhase1 = Math.min(nMinusOneCount(phase1MW / pf, mvaPerXfmr), xfmrTotal);

  const conductor =
    spec.conductor ?? (ultimateMW >= 150 ? '1192.5 kcmil ACSR' : '795 kcmil ACSR');

  const padMVA = spec.padMVA ?? 2.5;

  return {
    pf,
    deliveryKV,
    mvKV,
    utilizationV,
    feeds,
    ultimateMW,
    ultimateMVA,
    phase1MW,
    phased,
    mvaPerXfmr,
    xfmrTotal,
    xfmrPhase1,
    firmMVA: (xfmrTotal - 1) * mvaPerXfmr,
    installedMVA: xfmrTotal * mvaPerXfmr,
    conductor,
    feedAmps: ampsKV(ultimateMW, deliveryKV, pf),
    padMVA,
    rmuCellsShown: 4,
    xfmrPriA: ampsKV(mvaPerXfmr, deliveryKV, 1),
    xfmrSecA: ampsKV(mvaPerXfmr, mvKV, 1),
    padPriA: ampsKV(padMVA, mvKV, 1),
    padSecA: (padMVA * 1e6) / (Math.sqrt(3) * utilizationV),
    mainBusA: spec.mainBusA ?? 1200,
    mvBusA: 3000,
    phase1Year: spec.phase1Year,
    phase2Year: spec.phase2Year,
  };
}
