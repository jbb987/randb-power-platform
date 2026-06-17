#!/usr/bin/env node
/**
 * Disambiguation experiment.
 *
 * Every site falls inside 2-6 overlapping service-territory polygons (recall is
 * 100%, naive "first hit" precision is 25%). This script fetches the polygon
 * GEOMETRY for each candidate and ranks them by several signals, then scores
 * each ranking against the known truth:
 *   - precision@1 : top-ranked candidate is the true utility ("for sure")
 *   - recall@2/@3 : true utility is within the top 2 / top 3 ("show a few")
 *
 * Signals compared:
 *   interiority : distance from the point to the polygon boundary (most interior wins)
 *   areaAsc     : smallest containing polygon first
 *   custDesc    : largest customer count first
 *
 * Read-only, public ArcGIS, no key. RUN: node research/utility-territory/disambiguate.mjs
 */
const ENDPOINT =
  'https://services6.arcgis.com/BAJNi3EgCdtQ1BCG/arcgis/rest/services/Electric_Retail_Service_Territories/FeatureServer/0';
const TIMEOUT = 30000;

const SITES = [
  { name: 'Kenefic Pit',      lat: 34.171606,   lng: -96.32142838, tokens: ['southeastern electric'] },
  { name: 'Joshua Pit',       lat: 32.4577,     lng: -97.4127,     tokens: ['oncor'] },
  { name: 'Sherman Property', lat: 33.6642,     lng: -96.5905,     tokens: ['oncor'] },
  { name: 'Denison Pit N',    lat: 33.71920473, lng: -96.55605165, tokens: ['oncor'] },
  { name: 'Combine Pit',      lat: 32.58691527, lng: -96.53423836, tokens: ['oncor'] },
  { name: 'Asherton TX',      lat: 28.444667,   lng: -99.750833,   tokens: ['aep texas', 'central power'] },
  { name: 'Airport Quarry',   lat: 33.18015,    lng: -96.57055,    tokens: ['oncor'] },
  { name: 'Ike Byrom Pit',    lat: 33.27515,    lng: -96.97605,    tokens: ['coserv', 'denton county elec coop'] },
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const isTrue = (name, tokens) => tokens.some((t) => norm(name).includes(norm(t)));

async function getJson(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { Accept: 'application/json' } });
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// planar metric approx around a latitude — fine for RANKING at site scale
function mPerDeg(lat) {
  const latR = (lat * Math.PI) / 180;
  return { x: 111320 * Math.cos(latR), y: 110540 };
}
function distPtSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-12;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx,
    cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
// min distance (meters) from point to any ring edge; + shoelace area (m^2, abs)
function geomStats(rings, lat, lng) {
  const m = mPerDeg(lat);
  const px = lng * m.x,
    py = lat * m.y;
  let minD = Infinity,
    area = 0;
  for (const ring of rings) {
    const pts = ring.map(([x, y]) => [x * m.x, y * m.y]);
    for (let i = 0; i < pts.length - 1; i++) {
      minD = Math.min(minD, distPtSeg(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
    }
    let a = 0;
    for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    area += Math.abs(a) / 2;
  }
  return { edgeDistM: minD, areaM2: area };
}

async function candidatesFor(s) {
  const geom = encodeURIComponent(JSON.stringify({ x: s.lng, y: s.lat, spatialReference: { wkid: 4326 } }));
  const url =
    `${ENDPOINT}/query?geometry=${geom}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=NAME,TYPE,CUSTOMERS&returnGeometry=true&outSR=4326&geometryPrecision=6&f=json`;
  const j = await getJson(url);
  if (j.error) throw new Error(JSON.stringify(j.error));
  return (j.features || []).map((f) => {
    const a = f.attributes;
    const st = geomStats(f.geometry?.rings || [], s.lat, s.lng);
    const cust = Number(a.CUSTOMERS);
    return {
      name: a.NAME,
      type: a.TYPE,
      customers: cust === -999999 ? null : cust,
      edgeDistM: st.edgeDistM,
      areaKm2: st.areaM2 / 1e6,
    };
  });
}

const RANKERS = {
  interiority: (c) => [...c].sort((a, b) => b.edgeDistM - a.edgeDistM),
  areaAsc: (c) => [...c].sort((a, b) => a.areaKm2 - b.areaKm2),
  custDesc: (c) => [...c].sort((a, b) => (b.customers ?? -1) - (a.customers ?? -1)),
};

async function main() {
  console.log('=== Disambiguation experiment (n=' + SITES.length + ') ===\n');
  const score = Object.fromEntries(Object.keys(RANKERS).map((k) => [k, { p1: 0, r2: 0, r3: 0 }]));

  for (const s of SITES) {
    let cands;
    try {
      cands = await candidatesFor(s);
    } catch (e) {
      console.log(`ERR ${s.name}: ${e.message}`);
      continue;
    }
    console.log(`■ ${s.name}  (${cands.length} candidates)`);
    // show interiority ranking with stats
    const ranked = RANKERS.interiority(cands);
    ranked.forEach((c, i) => {
      const star = isTrue(c.name, s.tokens) ? ' ★TRUE' : '';
      console.log(
        `    ${i + 1}. ${c.name} [${c.type}]  edge=${(c.edgeDistM / 1000).toFixed(1)}km  area=${Math.round(c.areaKm2)}km²  cust=${c.customers ?? 'n/a'}${star}`,
      );
    });
    for (const [k, rank] of Object.entries(RANKERS)) {
      const r = rank(cands);
      const idx = r.findIndex((c) => isTrue(c.name, s.tokens));
      if (idx === 0) score[k].p1++;
      if (idx >= 0 && idx < 2) score[k].r2++;
      if (idx >= 0 && idx < 3) score[k].r3++;
    }
    console.log('');
  }

  // Conservative decision rule (no second source): only auto-pick when safe.
  let safeConfident = 0, safeConfidentCorrect = 0, review = 0, reviewHasTruth = 0;
  console.log('=== Conservative decision (show shortlist when a blanket IOU competes with a co-op) ===');
  for (const s of SITES) {
    let cands;
    try { cands = await candidatesFor(s); } catch { continue; }
    const ranked = RANKERS.interiority(cands);
    const top = ranked[0];
    const hasCoop = cands.some((c) => c.type === 'COOPERATIVE');
    const ratio = ranked[1] ? (ranked[1].edgeDistM > 0 ? top.edgeDistM / ranked[1].edgeDistM : Infinity) : Infinity;
    let decision, pick;
    if (cands.length === 1) { decision = 'CONFIDENT'; pick = top; }
    else if (top.type === 'COOPERATIVE' && ratio >= 1.5) { decision = 'CONFIDENT'; pick = top; }
    else if (top.type !== 'COOPERATIVE' && hasCoop) { decision = 'SHORTLIST'; }
    else if (ratio >= 1.5) { decision = 'CONFIDENT'; pick = top; }
    else decision = 'SHORTLIST';

    if (decision === 'CONFIDENT') {
      safeConfident++;
      const ok = isTrue(pick.name, s.tokens);
      if (ok) safeConfidentCorrect++;
      console.log(`  CONFIDENT ${s.name.padEnd(18)} → ${pick.name} ${ok ? '✓' : '✗ WRONG'}`);
    } else {
      review++;
      const top3 = ranked.slice(0, 3);
      const has = top3.some((c) => isTrue(c.name, s.tokens));
      if (has) reviewHasTruth++;
      console.log(`  SHORTLIST ${s.name.padEnd(18)} → ${top3.map((c) => c.name.split(' ').slice(0, 2).join(' ')).join(' | ')} ${has ? '(truth present ✓)' : '(truth MISSING ✗)'}`);
    }
  }
  console.log(`\n  Auto-picked: ${safeConfident}/${SITES.length} — wrong auto-picks: ${safeConfident - safeConfidentCorrect}`);
  console.log(`  Shortlisted: ${review}/${SITES.length} — truth in top-3: ${reviewHasTruth}/${review}`);
  console.log('  => goal: ZERO wrong auto-picks, and every shortlist contains the truth.\n');

  const n = SITES.length;
  console.log('=== Ranking signal scoreboard ===');
  console.log('signal'.padEnd(13), 'precision@1', 'recall@2', 'recall@3');
  for (const [k, v] of Object.entries(score)) {
    console.log(
      k.padEnd(13),
      `${v.p1}/${n} (${Math.round((v.p1 / n) * 100)}%)`.padEnd(12),
      `${v.r2}/${n} (${Math.round((v.r2 / n) * 100)}%)`.padEnd(10),
      `${v.r3}/${n} (${Math.round((v.r3 / n) * 100)}%)`,
    );
  }
  console.log('\nBaselines: naive-first=25% p@1, recall-any=100%. Goal: p@1 high, or r@2/@3 = 100% to show a safe shortlist.');
}

main().catch((e) => console.error('fatal:', e.message));
