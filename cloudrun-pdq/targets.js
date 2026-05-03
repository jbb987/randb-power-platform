/**
 * Load the set of API#s we actually want to enrich with production data.
 * For the reactivation use case, that's wells in IWAR (inactive register)
 * or on the Orphan list. ~120K APIs total.
 *
 * Also build the corresponding lease-key set so we can FILTER the 100M-row
 * PDQ lease cycle stream at parse time instead of holding all leases in
 * memory (which OOMs at 7 GB).
 *
 * Lease key shape: `${OIL_GAS_CODE}|${DISTRICT_NAME}|${LEASE_NO}` — uses the
 * PUBLIC district code (e.g. 6E, 7B, 8A) since both IWAR and PDQ's
 * DISTRICT_NAME column carry the public form.
 */
import { Firestore } from '@google-cloud/firestore';

const COLLECTION = 'tx-wells-enriched';

const db = new Firestore();

function makeLeaseKey(ogCode, district, leaseNo) {
  if (!ogCode || !district || !leaseNo) return null;
  // Strip any leading zeros from lease no the Firestore record may have
  // saved it with — the PDQ DSV emits it without padding too.
  const ln = String(leaseNo).replace(/^0+/, '') || '0';
  const og = String(ogCode).trim().toUpperCase();
  const dist = String(district).trim();
  return `${og}|${dist}|${ln}`;
}

/**
 * Returns { apis: Set<string>, leaseKeys: Set<string> }.
 * Reads ~120K docs from Firestore. ~30-60 sec.
 */
export async function loadTargetSets() {
  const startedAt = Date.now();
  console.log('[targets] scanning Firestore for IWAR + Orphan APIs and lease keys…');

  const apis = new Set();
  const leaseKeys = new Set();

  const stream = db
    .collection(COLLECTION)
    .select(
      'iwarShutInDate',
      'orphanListed',
      'iwarOilGasCode',
      'iwarDistrict',
      'iwarLeaseNumber',
    )
    .stream();

  let scanned = 0;
  for await (const doc of stream) {
    scanned++;
    const d = doc.data();
    if (d.iwarShutInDate || d.orphanListed === true) {
      apis.add(doc.id);
      const lk = makeLeaseKey(d.iwarOilGasCode, d.iwarDistrict, d.iwarLeaseNumber);
      if (lk) leaseKeys.add(lk);
    }
    if (scanned % 50_000 === 0) {
      console.log(`[targets] scanned ${scanned.toLocaleString()}, kept ${apis.size.toLocaleString()} apis, ${leaseKeys.size.toLocaleString()} lease keys`);
    }
  }

  console.log(`[targets] done in ${Math.round((Date.now() - startedAt) / 1000)}s — ${apis.size.toLocaleString()} APIs, ${leaseKeys.size.toLocaleString()} lease keys`);
  return { apis, leaseKeys };
}

// Backward-compat shim (server.js previously called loadTargetApiSet)
export async function loadTargetApiSet() {
  const { apis } = await loadTargetSets();
  return apis;
}

export { makeLeaseKey };
