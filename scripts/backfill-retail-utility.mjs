#!/usr/bin/env node
/**
 * Backfill human-confirmed serving retail utilities for the sites whose truth we
 * know (confirmed by R&B after contacting the utilities). Writes the top-level
 * `retailUtilityConfirmedName` field on each sites-registry doc — authoritative,
 * survives re-analysis. Other sites resolve automatically via resolveRetailUtility
 * on their next analysis; audit-all-sites.mjs lists the ones needing review.
 *
 * Read-only by default. RUN:
 *   node scripts/backfill-retail-utility.mjs            (dry run — prints plan)
 *   node scripts/backfill-retail-utility.mjs --confirm  (writes)
 *
 * Auth: local gcloud ADC (same as the other migration scripts).
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT = 'randb-site-valuator';
const ADC = join(homedir(), '.config/gcloud/application_default_credentials.json');
const WRITE = process.argv.includes('--confirm');

// Confirmed by R&B (contacted the utilities). Match is by exact registry name.
const TRUTH = {
  'Kenefic Pit': 'Southeastern Electric Cooperative',
  'Joshua Pit': 'Oncor Electric Delivery',
  'Sherman Property': 'Oncor Electric Delivery',
  'Denison Pit North': 'Oncor Electric Delivery',
  'Combine Pit': 'Oncor Electric Delivery',
  'Airport Quarry': 'Oncor Electric Delivery',
  'Ike Byrom Pit': 'CoServ (Denton County Electric Cooperative)',
  'Asherton TX': 'AEP Texas',
};

async function token() {
  const c = JSON.parse(readFileSync(ADC, 'utf8'));
  const body = new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token, grant_type: 'refresh_token' });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  if (!j.access_token) throw new Error('token: ' + JSON.stringify(j));
  return j.access_token;
}

async function main() {
  const tok = await token();
  const auth = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
  const q = await (
    await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'sites-registry' }], limit: 500, select: { fields: [{ fieldPath: 'name' }] } } }),
    })
  ).json();
  if (q.error) throw new Error('Firestore: ' + JSON.stringify(q.error));
  const byName = new Map();
  for (const x of q.filter((r) => r.document)) {
    byName.set(x.document.fields?.name?.stringValue, x.document.name.split('/').pop());
  }

  console.log(`${WRITE ? 'WRITING' : 'DRY RUN'} — ${Object.keys(TRUTH).length} confirmations\n`);
  let done = 0,
    missing = 0;
  for (const [name, utility] of Object.entries(TRUTH)) {
    const id = byName.get(name);
    if (!id) {
      console.log(`  ✗ NOT FOUND in registry: "${name}"`);
      missing++;
      continue;
    }
    console.log(`  ${name}  →  ${utility}   (${id})`);
    if (WRITE) {
      const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/sites-registry/${id}?updateMask.fieldPaths=retailUtilityConfirmedName`;
      const res = await fetch(url, { method: 'PATCH', headers: auth, body: JSON.stringify({ fields: { retailUtilityConfirmedName: { stringValue: utility } } }) });
      if (!res.ok) console.log(`     ! write failed: HTTP ${res.status} ${await res.text()}`);
      else done++;
    }
  }
  console.log(`\n${WRITE ? `Wrote ${done}` : 'Would write ' + (Object.keys(TRUTH).length - missing)} · missing ${missing}`);
  if (!WRITE) console.log('Re-run with --confirm to apply.');
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
