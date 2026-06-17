#!/usr/bin/env node
/**
 * Read-only: pull the known ground-truth sites + their coordinates from the
 * sites-registry Firestore collection, using the local gcloud ADC login.
 * No secrets are stored here — it reads the ADC file at runtime.
 *
 * RUN: node research/utility-territory/fetch-sites.mjs
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT = 'randb-site-valuator';
const ADC = join(homedir(), '.config/gcloud/application_default_credentials.json');
const NEEDLES = ['kenefic', 'joshua', 'sherman', 'denison', 'combine', 'airport', 'quarry', 'ike', 'brom', 'asherton'];

async function token() {
  const c = JSON.parse(readFileSync(ADC, 'utf8'));
  const body = new URLSearchParams({
    client_id: c.client_id,
    client_secret: c.client_secret,
    refresh_token: c.refresh_token,
    grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token mint failed: ' + JSON.stringify(j));
  return j.access_token;
}

// Decode Firestore REST "fields" wire format to plain JS (shallow + nested).
function decode(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('geoPointValue' in v) return { lat: v.geoPointValue.latitude, lng: v.geoPointValue.longitude };
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  return JSON.stringify(v);
}

function coordFields(obj, prefix = '') {
  const out = [];
  for (const [k, val] of Object.entries(obj || {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if ('lat' in val || 'lng' in val) out.push([path, JSON.stringify(val)]);
      else out.push(...coordFields(val, path));
    } else if (/lat|lng|lon|coord/i.test(k)) {
      out.push([path, String(val)]);
    }
  }
  return out;
}

async function main() {
  const tok = await token();
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'sites-registry' }], limit: 500 } }),
    },
  );
  const data = await r.json();
  if (data.error) throw new Error('Firestore error: ' + JSON.stringify(data.error));
  const docs = data.filter((x) => x.document).map((x) => ({
    id: x.document.name.split('/').pop(),
    fields: Object.fromEntries(Object.entries(x.document.fields || {}).map(([k, v]) => [k, decode(v)])),
  }));
  console.log(`Total sites in registry: ${docs.length}\n`);

  const TOP = ['lat', 'lng', 'latitude', 'longitude', 'coordinates', 'coords'];
  for (const d of docs) {
    const f = d.fields;
    const name = f.name || f.siteName || '(unnamed)';
    if (!NEEDLES.some((n) => String(name).toLowerCase().includes(n))) continue;
    const pairs = TOP.filter((k) => f[k] != null).map((k) => `${k}=${typeof f[k] === 'object' ? JSON.stringify(f[k]) : f[k]}`);
    const inputCoord = f.inputs && (f.inputs.coordinates || (f.inputs.lat != null ? `${f.inputs.lat},${f.inputs.lng}` : null));
    console.log(`■ ${String(name).padEnd(22)} id=${d.id}`);
    console.log(`    ${pairs.join('  ') || '(no top-level coords)'}${inputCoord ? `  inputs.coordinates=${inputCoord}` : ''}`);
    console.log(`    company=${f.companyName || f.owner || '—'}  utility(stored)=${JSON.stringify(f.infraResult?.utility ?? f.utility ?? null)}`);
  }
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
