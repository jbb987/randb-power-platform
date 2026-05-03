/**
 * Compute per-lease rollups from a sorted-by-YM monthly array, then allocate
 * to the lease's wells.
 *
 * Allocation V1:
 *   - Single-well lease: well gets 100% (allocated = false flag)
 *   - Multi-well lease:  each well gets 1/N share (allocated = true flag)
 *
 * Outputs per well:
 *   prodLifetimeOilBbl, prodLifetimeGasMcf, prodLifetimeCondBbl, prodLifetimeCsgdMcf
 *   prodFirst6moOilBblPerD, prodLast12moOilBblPerD
 *   prodFirst6moGasMcfPerD, prodLast12moGasMcfPerD
 *   prodFirstYearMonth, prodLastYearMonth, prodMonthsActive
 *   prodAllocated (boolean flag)
 *   prodWellsOnLease (count)
 *   prodArps_qi, prodArps_Di, prodArps_b, prodArps_eur (Arps fit, may be null)
 */
import { fitArpsDecline } from './dca.js';

const DAYS_PER_MONTH = 30.44; // average

/** Return monthly volumes sorted by YM ascending. */
function sortMonths(months) {
  return months.slice().sort((a, b) => a.ym.localeCompare(b.ym));
}

/** Sum, treating undefined/null as 0. */
function sum(arr, fn) {
  return arr.reduce((a, m) => a + (Number.isFinite(fn(m)) ? fn(m) : 0), 0);
}

/** Compute a per-lease rollup record from the ordered monthly volumes. */
export function computeLeaseRollup(leaseKey, months) {
  const sorted = sortMonths(months);
  if (sorted.length === 0) return null;

  // Trim trailing zero-volume tails so "last production" reflects actual stop
  let lastNonZeroIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if ((sorted[i].oil + sorted[i].gas + sorted[i].cond + sorted[i].csgd) > 0) {
      lastNonZeroIdx = i;
      break;
    }
  }
  if (lastNonZeroIdx === -1) {
    // Lease never produced anything reportable
    return null;
  }
  const active = sorted.slice(0, lastNonZeroIdx + 1);

  const lifetimeOil = sum(active, (m) => m.oil);
  const lifetimeGas = sum(active, (m) => m.gas);
  const lifetimeCond = sum(active, (m) => m.cond);
  const lifetimeCsgd = sum(active, (m) => m.csgd);

  const firstYM = active[0].ym;
  const lastYM = active[active.length - 1].ym;

  const first6 = active.slice(0, 6);
  const last12 = active.slice(-12);

  const first6OilTotal = sum(first6, (m) => m.oil);
  const first6GasTotal = sum(first6, (m) => m.gas);
  const last12OilTotal = sum(last12, (m) => m.oil);
  const last12GasTotal = sum(last12, (m) => m.gas);

  // Rate = total volume / (months × days/month)
  const first6OilRate = first6.length > 0 ? first6OilTotal / (first6.length * DAYS_PER_MONTH) : 0;
  const first6GasRate = first6.length > 0 ? first6GasTotal / (first6.length * DAYS_PER_MONTH) : 0;
  const last12OilRate = last12.length > 0 ? last12OilTotal / (last12.length * DAYS_PER_MONTH) : 0;
  const last12GasRate = last12.length > 0 ? last12GasTotal / (last12.length * DAYS_PER_MONTH) : 0;

  // Arps fits — pick whichever stream has more data (oil for oil leases,
  // gas for gas leases). Lease key starts with "O" or "G" so we know.
  const isOilLease = leaseKey.startsWith('O|');
  const monthlyForFit = isOilLease ? active.map((m) => m.oil) : active.map((m) => m.gas);
  const arps = fitArpsDecline(monthlyForFit);

  return {
    prodFirstYearMonth: ymFormat(firstYM),
    prodLastYearMonth: ymFormat(lastYM),
    prodMonthsActive: active.length,
    prodLifetimeOilBbl: Math.round(lifetimeOil),
    prodLifetimeGasMcf: Math.round(lifetimeGas),
    prodLifetimeCondBbl: Math.round(lifetimeCond),
    prodLifetimeCsgdMcf: Math.round(lifetimeCsgd),
    prodFirst6moOilBblPerD: round1(first6OilRate),
    prodFirst6moGasMcfPerD: round1(first6GasRate),
    prodLast12moOilBblPerD: round1(last12OilRate),
    prodLast12moGasMcfPerD: round1(last12GasRate),
    prodArpsQi: arps?.qi ?? null,
    prodArpsDi: arps?.Di ?? null,
    prodArpsB:  arps?.b  ?? null,
    prodArpsEur: arps?.eur ?? null,
  };
}

/** Allocate a lease rollup to its wells. */
export function allocateToWells(leaseRollup, wells) {
  const wellCount = wells.length;
  if (wellCount === 0) return [];
  const ratio = 1 / wellCount;
  const allocated = wellCount > 1;

  return wells.map((w) => ({
    api: w.api,
    wellNo: w.wellNo,
    record: {
      ...scaleVolumeFields(leaseRollup, ratio),
      prodFirstYearMonth: leaseRollup.prodFirstYearMonth,
      prodLastYearMonth: leaseRollup.prodLastYearMonth,
      prodMonthsActive: leaseRollup.prodMonthsActive,
      prodArpsQi: leaseRollup.prodArpsQi,
      prodArpsDi: leaseRollup.prodArpsDi,
      prodArpsB:  leaseRollup.prodArpsB,
      prodArpsEur: leaseRollup.prodArpsEur != null ? Math.round(leaseRollup.prodArpsEur * ratio) : null,
      prodAllocated: allocated,
      prodWellsOnLease: wellCount,
    },
  }));
}

const VOLUME_FIELDS = [
  'prodLifetimeOilBbl',
  'prodLifetimeGasMcf',
  'prodLifetimeCondBbl',
  'prodLifetimeCsgdMcf',
  'prodFirst6moOilBblPerD',
  'prodFirst6moGasMcfPerD',
  'prodLast12moOilBblPerD',
  'prodLast12moGasMcfPerD',
];

function scaleVolumeFields(rollup, ratio) {
  const out = {};
  for (const k of VOLUME_FIELDS) {
    const v = rollup[k];
    if (v == null) continue;
    out[k] = k.endsWith('PerD') ? round1(v * ratio) : Math.round(v * ratio);
  }
  return out;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function ymFormat(ym) {
  // ym is YYYYMM string; convert to YYYY-MM
  if (!ym || ym.length !== 6) return null;
  return `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;
}
