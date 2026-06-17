#!/usr/bin/env node
/**
 * Audit EVERY site in sites-registry with the new retail-utility resolver
 * (point-in-polygon on Electric Retail Service Territories, ranked by interiority,
 * confidence-tiered). Flags the sites that need a human look — i.e. the other
 * "Kenefics" hiding in the registry.
 *
 * Read-only. RUN: node research/utility-territory/audit-all-sites.mjs
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT = 'randb-site-valuator';
const ADC = join(homedir(), '.config/gcloud/application_default_credentials.json');
const ENDPOINT =
  'https://services6.arcgis.com/BAJNi3EgCdtQ1BCG/arcgis/rest/services/Electric_Retail_Service_Territories/FeatureServer/0';
const TIMEOUT = 30000;
const CONF_RATIO = 1.5; // #1 interiority must beat #2 by this to auto-pick

async function token() {
  const c = JSON.parse(readFileSync(ADC, 'utf8'));
  const body = new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token, grant_type: 'refresh_token' });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  if (!j.access_token) throw new Error('token: ' + JSON.stringify(j));
  return j.access_token;
}
function dec(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('nullValue' in v) return null;
  return undefined;
}
async function getJson(url, opts) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { ...opts, signal: c.signal });
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
function mPerDeg(lat) {
  return { x: 111320 * Math.cos((lat * Math.PI) / 180), y: 110540 };
}
function edgeDist(rings, lat, lng) {
  const m = mPerDeg(lat);
  const px = lng * m.x, py = lat * m.y;
  let min = Infinity;
  for (const ring of rings) {
    const p = ring.map(([x, y]) => [x * m.x, y * m.y]);
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i], [bx, by] = p[i + 1];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-12;
      let tt = ((px - ax) * dx + (py - ay) * dy) / l2;
      tt = Math.max(0, Math.min(1, tt));
      min = Math.min(min, Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy)));
    }
  }
  return min;
}
const pt = (lat, lng) => encodeURIComponent(JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }));

async function resolve(lat, lng) {
  const base = `${ENDPOINT}/query?geometry=${pt(lat, lng)}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects`;
  const j = await getJson(`${base}&outFields=NAME,TYPE,CUSTOMERS&returnGeometry=false&f=json`);
  if (j.error) throw new Error(JSON.stringify(j.error));
  let cands = (j.features || []).map((f) => ({ name: f.attributes.NAME, type: f.attributes.TYPE }));
  if (cands.length <= 1) return { cands, ranked: cands, conf: cands.length === 1 ? 'HIGH' : 'NONE' };
  const g = await getJson(`${base}&outFields=NAME,TYPE,CUSTOMERS&returnGeometry=true&outSR=4326&geometryPrecision=4&f=json`);
  const withGeom = (g.features || []).map((f) => ({
    name: f.attributes.NAME,
    type: f.attributes.TYPE,
    edge: edgeDist(f.geometry?.rings || [], lat, lng),
  }));
  const ranked = withGeom.sort((a, b) => b.edge - a.edge);
  const ratio = ranked[1].edge > 0 ? ranked[0].edge / ranked[1].edge : Infinity;
  return { cands: withGeom, ranked, conf: ratio >= CONF_RATIO ? 'HIGH' : 'LOW', ratio };
}

const inUS = (lat, lng) => lat > 17 && lat < 72 && lng > -180 && lng < -66;

async function main() {
  const tok = await token();
  const data = await getJson(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`,
    { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'sites-registry' }], limit: 500 } }) },
  );
  if (data.error) throw new Error('Firestore: ' + JSON.stringify(data.error));
  const sites = data
    .filter((x) => x.document)
    .map((x) => {
      const f = Object.fromEntries(Object.entries(x.document.fields || {}).map(([k, v]) => [k, dec(v)]));
      const co = f.coordinates || {};
      return { name: f.name || '(unnamed)', lat: co.lat ?? f.lat, lng: co.lng ?? f.lng };
    })
    .filter((s) => s.lat != null && s.lng != null);

  console.error(`Auditing ${sites.length} sites…\n`);
  const rows = [];
  for (const s of sites) {
    if (!inUS(s.lat, s.lng)) { rows.push({ ...s, flag: 'NON-US', best: '-', list: [] }); continue; }
    try {
      const r = await resolve(s.lat, s.lng);
      const best = r.ranked[0];
      const top3 = r.ranked.slice(0, 3).map((c) => `${c.name}${c.type === 'COOPERATIVE' ? ' (coop)' : ''}`);
      let flag;
      if (r.conf === 'NONE') flag = 'NO-COVERAGE';
      else if (r.conf === 'HIGH') flag = best.type === 'COOPERATIVE' ? 'CONFIDENT-COOP' : 'CONFIDENT';
      else flag = 'REVIEW';
      rows.push({ ...s, flag, best: best ? best.name : '-', conf: r.conf, list: top3 });
    } catch (e) {
      rows.push({ ...s, flag: 'ERR', best: e.message, list: [] });
    }
    process.stderr.write('.');
  }
  console.error('\n');

  const order = ['REVIEW', 'CONFIDENT-COOP', 'NO-COVERAGE', 'ERR', 'CONFIDENT', 'NON-US'];
  rows.sort((a, b) => order.indexOf(a.flag) - order.indexOf(b.flag) || a.name.localeCompare(b.name));
  for (const r of rows) {
    console.log(`[${r.flag}] ${r.name}  (${r.lat}, ${r.lng})`);
    if (r.flag === 'REVIEW') console.log(`    pick one → ${r.list.join('  |  ')}`);
    else if (r.best && r.flag !== 'NON-US' && r.flag !== 'NO-COVERAGE') console.log(`    → ${r.best}`);
  }
  const count = (f) => rows.filter((r) => r.flag === f).length;
  console.log('\n=== Summary ===');
  console.log(`CONFIDENT (IOU/muni):  ${count('CONFIDENT')}`);
  console.log(`CONFIDENT-COOP:        ${count('CONFIDENT-COOP')}   <- co-ops today's heuristic would mislabel`);
  console.log(`REVIEW (show 2-3):     ${count('REVIEW')}`);
  console.log(`NO-COVERAGE:           ${count('NO-COVERAGE')}`);
  console.log(`NON-US / ERR:          ${count('NON-US')} / ${count('ERR')}`);
  console.log(`Total audited:         ${rows.length}`);
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
