#!/usr/bin/env node
/**
 * Retail-utility territory validation harness.
 *
 * WHY: The Site Analyzer derives "Utility Territory" from the most frequent
 * transmission-line OWNER near a coordinate (src/lib/infraLookup.ts ->
 * deriveUtility). That names the transmission owner, never the retail/
 * distribution utility — so co-ops (which own little high-voltage transmission)
 * are invisible. This script tests whether a point-in-polygon lookup against
 * the canonical "Electric Retail Service Territories" polygon dataset would
 * return the CORRECT serving utility for sites where we already know the truth.
 *
 * It is read-only and hits public ArcGIS REST endpoints. No API key required.
 * (Optional: set NREL_API_KEY to also test NREL's utility lookup as a 2nd vote.)
 *
 * RUN:  node research/utility-territory/territory-test.mjs
 * Node 18+ (native fetch). Tested on Node 24.
 *
 * If every endpoint times out from your network, the polygon dataset is just
 * being flaky that day — the test logic is sound; re-run later or add a mirror
 * to ENDPOINTS below.
 */

// ---------------------------------------------------------------------------
// GROUND TRUTH. Coordinates marked verified:false are my approximations
// (town centers) — REPLACE with the exact site coords from the platform for a
// trustworthy result, especially near utility boundaries. Two are unknown.
// ---------------------------------------------------------------------------
// Exact coordinates pulled from sites-registry (Firestore) 2026-06-17.
const SITES = [
  { name: 'Kenefic Pit',     lat: 34.171606,   lng: -96.32142838, verified: true, expect: { label: 'Southeastern Electric Cooperative', tokens: ['southeastern electric'] } },
  { name: 'Joshua Pit',      lat: 32.4577,     lng: -97.4127,     verified: true, expect: { label: 'Oncor',  tokens: ['oncor'] } },
  { name: 'Sherman Property',lat: 33.6642,     lng: -96.5905,     verified: true, expect: { label: 'Oncor',  tokens: ['oncor'] } },
  { name: 'Denison Pit N',   lat: 33.71920473, lng: -96.55605165, verified: true, expect: { label: 'Oncor',  tokens: ['oncor'] } },
  { name: 'Combine Pit',     lat: 32.58691527, lng: -96.53423836, verified: true, expect: { label: 'Oncor',  tokens: ['oncor'] } },
  { name: 'Asherton TX',     lat: 28.444667,   lng: -99.750833,   verified: true, expect: { label: 'AEP Texas', tokens: ['aep texas', 'aep ', 'central power'] } },
  { name: 'Airport Quarry',  lat: 33.18015,    lng: -96.57055,    verified: true, expect: { label: 'Oncor',  tokens: ['oncor'] } },
  // CoServ = dba of Denton County Electric Cooperative; dataset abbreviates ELECTRIC->ELEC.
  { name: 'Ike Byrom Pit',   lat: 33.27515,    lng: -96.97605,    verified: true, expect: { label: 'CoServ', tokens: ['coserv', 'denton county elec coop', 'denton county electric coop'] } },
];

// Candidate Electric Retail Service Territories services, tried in order until
// one answers. All host the same ORNL/HIFLD/EIA polygon layer.
// Live mirrors of the same ORNL/HIFLD polygon layer (discovered via ArcGIS
// Online search 2026-06-17; NASA NCCS was down). Tried in order.
const ENDPOINTS = [
  'https://services6.arcgis.com/BAJNi3EgCdtQ1BCG/arcgis/rest/services/Electric_Retail_Service_Territories/FeatureServer/0',
  'https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0',
  'https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Electric_Retail_Service_Territories/FeatureServer/0',
];

const TIMEOUT_MS = 25000;

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// Pull a utility name + type out of an ArcGIS feature regardless of exact schema.
function readFeature(attrs) {
  const nameKey = Object.keys(attrs).find((k) => /^name$/i.test(k)) || Object.keys(attrs).find((k) => /name/i.test(k));
  const typeKey = Object.keys(attrs).find((k) => /^type$/i.test(k));
  const custKey = Object.keys(attrs).find((k) => /cust/i.test(k));
  return {
    name: nameKey ? attrs[nameKey] : '(no NAME field)',
    type: typeKey ? attrs[typeKey] : '',
    customers: custKey ? attrs[custKey] : '',
    raw: attrs,
  };
}

async function queryPoint(endpoint, lat, lng) {
  const geom = encodeURIComponent(JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }));
  const url =
    `${endpoint}/query?geometry=${geom}&geometryType=esriGeometryPoint&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`;
  const j = await getJson(url);
  if (j.error) throw new Error('ArcGIS error: ' + JSON.stringify(j.error));
  return (j.features || []).map((f) => readFeature(f.attributes || {}));
}

// Optional independent second opinion.
async function queryNrel(lat, lng) {
  const key = process.env.NREL_API_KEY;
  if (!key) return null;
  const url = `https://developer.nrel.gov/api/utility_rates/v3.json?api_key=${key}&lat=${lat}&lon=${lng}`;
  try {
    const j = await getJson(url);
    return j?.outputs?.utility_name || '(none)';
  } catch (e) {
    return 'NREL err: ' + e.message;
  }
}

function matches(candidates, tokens) {
  return candidates.some((c) => {
    const n = norm(c.name);
    return tokens.some((tok) => n.includes(norm(tok)));
  });
}

async function pickEndpoint() {
  for (const ep of ENDPOINTS) {
    try {
      const meta = await getJson(`${ep}?f=json`);
      if (meta && (meta.fields || meta.name)) {
        const fieldNames = (meta.fields || []).map((f) => f.name);
        console.log(`Using endpoint: ${ep}`);
        console.log(`  layer: ${meta.name || '(unnamed)'} | ${fieldNames.length} fields`);
        console.log(`  fields: ${fieldNames.join(', ') || '(none reported)'}\n`);
        return ep;
      }
    } catch (e) {
      console.log(`  endpoint unavailable (${ep}): ${e.message}`);
    }
  }
  return null;
}

async function main() {
  console.log('=== Retail-utility territory validation ===\n');
  const ep = await pickEndpoint();
  if (!ep) {
    console.error('\nNo Electric Retail Service Territories endpoint responded. Add a mirror to ENDPOINTS and retry.');
    process.exit(1);
  }

  let recall = 0, // dataset contains the correct utility somewhere in the hits
    naive = 0, // first hit (no disambiguation) is correct
    overlaps = 0,
    tested = 0;

  for (const s of SITES) {
    if (s.skip || s.lat == null || s.lng == null) {
      console.log(`SKIP  ${s.name} (no coordinates)`);
      continue;
    }
    tested++;
    let candidates = [];
    try {
      candidates = await queryPoint(ep, s.lat, s.lng);
    } catch (e) {
      console.log(`ERR   ${s.name.padEnd(18)} query failed: ${e.message}`);
      continue;
    }
    const present = matches(candidates, s.expect.tokens); // recall
    const firstOk = candidates.length > 0 && matches([candidates[0]], s.expect.tokens); // naive precision
    if (present) recall++;
    if (firstOk) naive++;
    if (candidates.length > 1) overlaps++;
    const tag = !present ? 'MISS ' : firstOk ? 'OK   ' : 'AMBIG';
    console.log(`${tag} ${s.name.padEnd(18)} expect: ${s.expect.label}`);
    if (candidates.length === 0) console.log('        (no polygon — coverage gap)');
    candidates.forEach((c, i) =>
      console.log(`        ${i === 0 ? '→' : ' '} ${c.name}${c.type ? ` [${c.type}]` : ''}${c.customers ? ` cust=${c.customers}` : ''}`),
    );
    if (candidates.length > 1) console.log(`        ⚠ ${candidates.length} overlapping polygons — first-result is unreliable`);
    const nrel = await queryNrel(s.lat, s.lng);
    if (nrel) console.log(`        NREL 2nd-opinion: ${nrel}`);
    console.log('');
  }

  console.log('=== Summary (n=' + tested + ') ===');
  console.log(`Recall   (correct utility present in polygon hits): ${recall}/${tested} = ${Math.round((recall / tested) * 100)}%`);
  console.log(`Naive    (first hit correct, no disambiguation):     ${naive}/${tested} = ${Math.round((naive / tested) * 100)}%`);
  console.log(`Overlaps (>1 polygon, needs disambiguation):         ${overlaps}/${tested}`);
  console.log('\nReading: recall = ceiling if we disambiguate well; naive = what "take first" gives.');
  console.log("Today's transmission-owner heuristic structurally misses both co-ops (Kenefic, Ike Byrom).");
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
