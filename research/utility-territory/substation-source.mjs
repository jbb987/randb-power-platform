#!/usr/bin/env node
/**
 * Second-source test: does the nearest substation's OWNER identify the true
 * retail utility? Tests the no-API-key tiebreaker against the 8 ground-truth sites,
 * especially the ones interiority got wrong/tied (Ike Byrom, Sherman, Denison).
 *
 * Uses the same substation mirror the platform already queries.
 * RUN: node research/utility-territory/substation-source.mjs
 */
const SUBS = 'https://services1.arcgis.com/PMShNXB1carltgVf/arcgis/rest/services/Electric_Substations/FeatureServer/0';
const TIMEOUT = 25000;
const SITES = [
  { name: 'Kenefic Pit',      lat: 34.171606,   lng: -96.32142838, tokens: ['southeastern'] },
  { name: 'Joshua Pit',       lat: 32.4577,     lng: -97.4127,     tokens: ['oncor'] },
  { name: 'Sherman Property', lat: 33.6642,     lng: -96.5905,     tokens: ['oncor'] },
  { name: 'Denison Pit N',    lat: 33.71920473, lng: -96.55605165, tokens: ['oncor'] },
  { name: 'Combine Pit',      lat: 32.58691527, lng: -96.53423836, tokens: ['oncor'] },
  { name: 'Asherton TX',      lat: 28.444667,   lng: -99.750833,   tokens: ['aep', 'central power'] },
  { name: 'Airport Quarry',   lat: 33.18015,    lng: -96.57055,    tokens: ['oncor'] },
  { name: 'Ike Byrom Pit',    lat: 33.27515,    lng: -96.97605,    tokens: ['coserv', 'denton'] },
];
async function getJson(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  try {
    return await (await fetch(url, { signal: c.signal })).json();
  } finally {
    clearTimeout(t);
  }
}
function km(aLat, aLng, bLat, bLng) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (bLat - aLat) * d2r, dLng = (bLng - aLng) * d2r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * d2r) * Math.cos(bLat * d2r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
async function main() {
  // discover the OWNER-like field once
  const meta = await getJson(`${SUBS}?f=json`);
  const fields = (meta.fields || []).map((f) => f.name);
  const ownerKey = fields.find((f) => /owner/i.test(f)) || fields.find((f) => /util|oper|company/i.test(f));
  console.log('Substation fields:', fields.join(', '));
  console.log('Using owner field:', ownerKey, '\n');

  for (const s of SITES) {
    const d = 0.25; // ~25km box
    const env = encodeURIComponent(JSON.stringify({ xmin: s.lng - d, ymin: s.lat - d, xmax: s.lng + d, ymax: s.lat + d, spatialReference: { wkid: 4326 } }));
    const url = `${SUBS}/query?geometry=${env}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326&f=json`;
    const j = await getJson(url);
    const subs = (j.features || [])
      .map((f) => ({ owner: f.attributes[ownerKey], name: f.attributes.NAME, d: km(s.lat, s.lng, f.geometry.y, f.geometry.x) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
    console.log(`■ ${s.name}  (expect ~${s.tokens[0]})`);
    if (!subs.length) console.log('    no substations within ~25km');
    subs.forEach((x) => console.log(`    ${x.d.toFixed(1)}km  owner=${x.owner || '(none)'}  [${x.name}]`));
    const hit = subs.find((x) => s.tokens.some((t) => String(x.owner || '').toLowerCase().includes(t)));
    console.log(`    => nearest-owner identifies truth? ${hit ? 'YES (' + hit.owner + ')' : 'no'}\n`);
  }
}
main().catch((e) => console.error('fatal:', e.message));
