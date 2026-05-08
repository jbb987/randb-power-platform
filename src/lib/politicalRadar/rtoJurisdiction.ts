/**
 * RTO / FERC jurisdiction lookup for the federal political-radar layer.
 *
 * v1 uses a state-keyed lookup with a coarse exclusion polygon for the Texas
 * carve-outs (El Paso → WECC, far-east → MISO, panhandle → SPP). This is
 * sufficient for the federal-layer signal because the only binary that
 * matters here is "in ERCOT or not" — ERCOT is the single US RTO outside
 * FERC rate jurisdiction, so it's the only one that flips the federal
 * threat call.
 *
 * If we ever need true point-in-polygon RTO classification, swap this for a
 * shapefile join against HIFLD's RTO/ISO boundary layer.
 */

import type { RtoCode, RtoJurisdiction } from './types';

const STATE_TO_DEFAULT_RTO: Record<string, RtoCode> = {
  // ERCOT — handled with TX-specific carve-outs below
  TX: 'ERCOT',

  // PJM — mid-Atlantic + part of midwest
  PA: 'PJM',
  NJ: 'PJM',
  MD: 'PJM',
  DE: 'PJM',
  VA: 'PJM',
  DC: 'PJM',
  WV: 'PJM',
  OH: 'PJM',
  KY: 'PJM',
  NC: 'PJM',

  // MISO — upper midwest + lower Mississippi
  MN: 'MISO',
  IA: 'MISO',
  WI: 'MISO',
  MI: 'MISO',
  IL: 'MISO',
  IN: 'MISO',
  MO: 'MISO',
  AR: 'MISO',
  MS: 'MISO',
  LA: 'MISO',
  ND: 'MISO',
  SD: 'MISO',

  // SPP — central plains
  KS: 'SPP',
  OK: 'SPP',
  NE: 'SPP',
  NM: 'SPP', // east half is SPP, west is WECC; coarse default
  WY: 'SPP', // east half is SPP, west is WECC
  MT: 'SPP', // east half is SPP, west is WECC

  // CAISO
  CA: 'CAISO',

  // NYISO
  NY: 'NYISO',

  // ISO-NE
  ME: 'ISO-NE',
  NH: 'ISO-NE',
  VT: 'ISO-NE',
  MA: 'ISO-NE',
  RI: 'ISO-NE',
  CT: 'ISO-NE',

  // No RTO/ISO (bilateral) — FERC still applies but no organized market
  AL: 'NONE',
  GA: 'NONE',
  FL: 'NONE',
  SC: 'NONE',
  TN: 'NONE',
  AZ: 'NONE',
  UT: 'NONE',
  ID: 'NONE',
  CO: 'NONE',
  NV: 'NONE',
  OR: 'NONE',
  WA: 'NONE',
  AK: 'NONE',
  HI: 'NONE',
};

/** El Paso / Hudspeth carve-out — that corner is on the WECC side, not ERCOT. */
function isElPasoArea(lat: number, lng: number): boolean {
  return lat >= 30.6 && lat <= 32.5 && lng <= -104.6;
}

/** Far-eastern East Texas counties hooked to MISO (Entergy Texas footprint). */
function isEastTxMiso(lat: number, lng: number): boolean {
  return lat >= 30.0 && lat <= 33.7 && lng >= -94.6;
}

/** Texas Panhandle counties on SPP. */
function isTxPanhandleSpp(lat: number, lng: number): boolean {
  return lat >= 34.5 && lng >= -103.1 && lng <= -100.0;
}

export function classifyRto(state: string | null, lat: number, lng: number): RtoJurisdiction {
  const upper = state?.toUpperCase() ?? '';

  // Texas — most of the state is ERCOT, with three carve-outs.
  if (upper === 'TX') {
    if (isElPasoArea(lat, lng)) {
      return {
        rto: 'NONE',
        ferc: true,
        reason: 'El Paso / Hudspeth corner — WECC interconnect, FERC-jurisdictional.',
      };
    }
    if (isEastTxMiso(lat, lng)) {
      return {
        rto: 'MISO',
        ferc: true,
        reason: 'Far-east Texas (Entergy Texas / MISO South footprint), FERC-jurisdictional.',
      };
    }
    if (isTxPanhandleSpp(lat, lng)) {
      return {
        rto: 'SPP',
        ferc: true,
        reason: 'Texas Panhandle — SPP territory, FERC-jurisdictional.',
      };
    }
    return {
      rto: 'ERCOT',
      ferc: false,
      reason: 'ERCOT site — intra-Texas, outside FERC rate jurisdiction.',
    };
  }

  const rto = STATE_TO_DEFAULT_RTO[upper];
  if (!rto) {
    return {
      rto: 'NONE',
      ferc: true,
      reason: 'State outside the explicit RTO mapping; FERC orders apply by default.',
    };
  }

  if (rto === 'NONE') {
    return {
      rto: 'NONE',
      ferc: true,
      reason: 'No organized RTO/ISO; bilateral market with FERC oversight.',
    };
  }

  return {
    rto,
    ferc: true,
    reason: `${rto} territory — FERC orders and large-load tariffs apply.`,
  };
}
