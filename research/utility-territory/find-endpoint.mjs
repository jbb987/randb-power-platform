#!/usr/bin/env node
/** Discover a LIVE Electric Retail Service Territories feature service and test Kenefic. */
const TIMEOUT = 20000;
async function j(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { Accept: 'application/json' } });
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
const KEN = { x: -96.32142838, y: 34.171606 };
async function probe(svc) {
  // svc is a FeatureServer/MapServer base; try layer 0..30 quickly via the svc itself
  for (const layer of [svc.replace(/\/$/, ''), svc.replace(/\/$/, '') + '/0']) {
    try {
      const meta = await j(`${layer}?f=json`);
      if (!meta || meta.error || (!meta.fields && !meta.layers)) continue;
      if (meta.layers && !meta.fields) continue; // service root, need a layer
      const geom = encodeURIComponent(JSON.stringify({ x: KEN.x, y: KEN.y, spatialReference: { wkid: 4326 } }));
      const q = await j(
        `${layer}/query?geometry=${geom}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`,
      );
      const feats = (q.features || []).map((f) => {
        const a = f.attributes;
        const nk = Object.keys(a).find((k) => /^name$/i.test(k)) || Object.keys(a).find((k) => /name/i.test(k));
        return nk ? a[nk] : Object.keys(a).join(',');
      });
      return { layer, ok: true, name: meta.name, feats };
    } catch (e) {
      /* next */
    }
  }
  return { ok: false };
}
async function main() {
  const search = await j(
    'https://www.arcgis.com/sharing/rest/search?q=' +
      encodeURIComponent('title:"Electric Retail Service Territories" type:"Feature Service"') +
      '&num=20&f=json',
  );
  const items = (search.results || []).filter((r) => r.url).map((r) => ({ title: r.title, owner: r.owner, url: r.url }));
  console.log(`Found ${items.length} candidate feature services:\n`);
  for (const it of items) {
    process.stdout.write(`• ${it.title} [${it.owner}]\n  ${it.url}\n`);
    const res = await probe(it.url);
    if (res.ok) console.log(`  ✓ LIVE → Kenefic returns: ${JSON.stringify(res.feats)}\n`);
    else console.log('  ✗ no response / no point hit\n');
  }
}
main().catch((e) => console.error('FAILED:', e.message));
