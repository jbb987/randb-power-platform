/**
 * Streams OG_LEASE_CYCLE_DATA_TABLE.dsv and builds an in-memory hash
 * aggregation: Map<leaseKey, MonthlyAggregate[]>.
 *
 * Each MonthlyAggregate represents one (lease, year-month) cycle. We keep
 * all months per lease so that downstream we can compute first/last/IP
 * windows and fit decline curves.
 *
 * Memory: ~800K leases × ~100 months × 32 bytes = ~2.5 GB. Cloud Run with
 * 8 GiB has headroom.
 */
import { parseDsvStream, buildColumnIndex, getStr, getNumber } from './dsv.js';

/**
 * Stream-aggregates OG_LEASE_CYCLE_DATA_TABLE.dsv. Filters at parse time
 * by `targetLeaseKeys` (Set<string>) so memory holds only the leases we
 * care about — without filtering this OOMs at ~7 GB heap when 100M+ rows
 * accumulate.
 *
 * Lease key uses the PUBLIC district code from DISTRICT_NAME (col 29),
 * not the internal DISTRICT_NO (col 2), so the key matches what we built
 * from IWAR records in Firestore.
 */
export async function aggregateLeaseCycles(byteStream, targetLeaseKeys) {
  const byLease = new Map();
  let header = null;
  let rowCount = 0;
  let keptCount = 0;

  for await (const r of parseDsvStream(byteStream)) {
    if (r.isHeader) {
      header = buildColumnIndex(r.headerCols);
      console.log(`[aggregate] header: ${r.headerCols.length} cols`);
      continue;
    }
    if (!header) continue;

    rowCount++;
    if (rowCount % 5_000_000 === 0) {
      console.log(`[aggregate] ${rowCount.toLocaleString()} rows scanned, kept ${keptCount.toLocaleString()} (${byLease.size.toLocaleString()} leases)`);
    }

    const ogCode = getStr(r.rowCols, header, 'OIL_GAS_CODE');
    const districtName = getStr(r.rowCols, header, 'DISTRICT_NAME');
    const leaseNo = getStr(r.rowCols, header, 'LEASE_NO');
    if (!ogCode || !districtName || !leaseNo) continue;

    // Filter — strip leading zeros on lease no to match the IWAR-derived key
    const ln = leaseNo.replace(/^0+/, '') || '0';
    const leaseKey = `${ogCode}|${districtName}|${ln}`;
    if (targetLeaseKeys && !targetLeaseKeys.has(leaseKey)) continue;

    const ym = getStr(r.rowCols, header, 'CYCLE_YEAR_MONTH');
    if (!ym) continue;

    keptCount++;

    let arr = byLease.get(leaseKey);
    if (!arr) {
      arr = [];
      byLease.set(leaseKey, arr);
    }

    arr.push({
      ym, // YYYYMM string
      // Volumes (whole units; PDQ stores integers)
      oil: getNumber(r.rowCols, header, 'LEASE_OIL_PROD_VOL') ?? 0,
      gas: getNumber(r.rowCols, header, 'LEASE_GAS_PROD_VOL') ?? 0,
      cond: getNumber(r.rowCols, header, 'LEASE_COND_PROD_VOL') ?? 0,
      csgd: getNumber(r.rowCols, header, 'LEASE_CSGD_PROD_VOL') ?? 0,
    });
  }

  console.log(`[aggregate] done: scanned ${rowCount.toLocaleString()} rows, kept ${keptCount.toLocaleString()} for ${byLease.size.toLocaleString()} target leases`);
  return byLease;
}
