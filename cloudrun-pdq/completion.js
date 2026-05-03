/**
 * Builds the lease → wells map by streaming OG_WELL_COMPLETION_DATA_TABLE.dsv.
 * Result: Map<leaseKey, Array<{api, wellNo, county}>> where leaseKey =
 * `${OIL_GAS_CODE}|${DISTRICT_NO}|${LEASE_NO}`.
 *
 * The completion file is small (~58 MB) so we hold it all in memory.
 */
import { parseDsvStream, buildColumnIndex, getStr } from './dsv.js';

export async function loadCompletionMap(byteStream) {
  const leaseToWells = new Map();
  let header = null;
  let rowCount = 0;
  let leaseCount = 0;

  for await (const r of parseDsvStream(byteStream)) {
    if (r.isHeader) {
      header = buildColumnIndex(r.headerCols);
      console.log(`[completion] header: ${r.headerCols.length} cols`);
      continue;
    }
    if (!header) continue;
    const ogCode = getStr(r.rowCols, header, 'OIL_GAS_CODE');
    // Use DISTRICT_NAME (public, e.g. 6E, 7B, 7C, 8A) to match the lease
    // key format used by aggregate.js and the IWAR-derived target set.
    // DISTRICT_NO is internal numeric and does NOT match.
    const district = getStr(r.rowCols, header, 'DISTRICT_NAME');
    const leaseNo = getStr(r.rowCols, header, 'LEASE_NO');
    const apiCounty = getStr(r.rowCols, header, 'API_COUNTY_CODE');
    const apiUnique = getStr(r.rowCols, header, 'API_UNIQUE_NO');
    const wellNo = getStr(r.rowCols, header, 'WELL_NO');
    const county = getStr(r.rowCols, header, 'COUNTY_NAME');

    if (!ogCode || !district || !leaseNo || !apiCounty || !apiUnique) continue;
    rowCount++;

    const api = `${apiCounty.padStart(3, '0')}${apiUnique.padStart(5, '0')}`;
    // Strip leading zeros on lease number — same normalization aggregate.js uses
    const ln = leaseNo.replace(/^0+/, '') || '0';
    const leaseKey = `${ogCode}|${district}|${ln}`;

    let arr = leaseToWells.get(leaseKey);
    if (!arr) {
      arr = [];
      leaseToWells.set(leaseKey, arr);
      leaseCount++;
    }
    arr.push({ api, wellNo, county });
  }

  console.log(`[completion] indexed ${leaseCount.toLocaleString()} leases, ${rowCount.toLocaleString()} well rows`);
  return leaseToWells;
}
