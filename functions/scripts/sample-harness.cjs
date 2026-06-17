/**
 * Labeled-sample test harness for the lead pipeline's LIVE knobs (Perplexity
 * prompt/model + Apollo titles/exclude/fallback + routing thresholds).
 *
 * Pulls the REAL tax-roll inputs for known-truth companies from Firestore, runs
 * them through the CURRENT compiled pipeline code (functions/lib), and scores
 * the result against ground truth. Re-run after a knob change (npm run build
 * first) to measure the delta. Read-only: never writes Firestore.
 *
 *   cd functions && npm run build && node scripts/sample-harness.cjs
 *
 * Costs a few cents of Perplexity + Apollo credit per run. Keys load from the
 * REP/niagara-leads folder. Temp/dev tool — not part of the deploy.
 */
const fs = require('fs');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { enrichCompanyPerplexity } = require('../lib/leadBuilder/perplexity.js');
const { enrichCompanyApollo } = require('../lib/leadBuilder/apollo.js');

const DIR = '/Users/babi/Desktop/randbpowerinc.us/REP/niagara-leads/';
const stripRtf = (s) => s.replace(/\\[a-zA-Z]+-?\d* ?/g, '').replace(/[{}\\]/g, '');
function loadKey(file, pattern) {
  const raw = fs.readFileSync(DIR + file, 'utf8');
  const txt = file.endsWith('.rtf') ? stripRtf(raw) : raw;
  const m = txt.match(pattern);
  return (m ? m[0] : txt).trim();
}
const PPLX_KEY = loadKey('perplexity_key.rtf', /pplx-[A-Za-z0-9]+/);
const APOLLO_KEY = loadKey('apollo_key.txt', /[A-Za-z0-9_\-]{15,}/);

// taxOwner-substring → expected outcome.
const TRUTH = {
  'Cargill': { resolve: 'Cargill Salt', expect: 'qualified', note: 'GIANT salt — must qualify (was lost on cargillsalt.com)' },
  'US Salt': { resolve: 'US Salt', expect: 'qualified', note: 'GIANT salt' },
  'Goulds Pumps': { resolve: 'ITT Goulds Pumps', expect: 'qualified', note: 'GIANT pump foundry' },
  'ITT Corp': { resolve: 'ITT Goulds Pumps', expect: 'qualified|dup', note: 'dup of Goulds — should collapse' },
  'Ruby Mountain Holdings': { resolve: 'Barton', expect: 'qualified', note: 'GIANT garnet abrasives' },
  'Upstone Materials': { resolve: 'Upstone Materials', expect: 'qualified', note: 'SMALL — tier-aware should recover (controller/owner)' },
  'Scepter': { resolve: 'Scepter', expect: 'qualified', note: 'aluminum recycling' },
  'BonaDent': { resolve: 'BonaDent', expect: 'qualified', note: 'dental lab' },
  'Frazier Industrial': { resolve: 'Frazier', expect: 'qualified', note: 'metal racking' },
  'Wilt Industries': { resolve: 'Wilt Industries', expect: 'dropped|needs_review', note: 'CLOSED per both models' },
  '110 Properties': { resolve: 'shell', expect: 'dropped', note: 'holding shell — should drop' },
  'Stone Lake Brewery': { resolve: 'Stone Lake Brewery', expect: 'needs_review|qualified', note: 'real microbrewery' },
};

function routePerplexity(e) {
  if (e.pplxError) return `dropped_perplexity (err: ${String(e.pplxError).slice(0, 40)})`;
  if (e.status === 'active') return e.website ? 'perplexity_done' : 'needs_review';
  if (e.status === 'closed') return e.confidence === 'high' ? 'dropped_perplexity' : 'needs_review';
  return 'dropped_perplexity';
}

(async () => {
  initializeApp({ projectId: 'randb-site-valuator' });
  const db = getFirestore();

  const sample = [];
  for (const county of ['Hamilton', 'Schuyler', 'Seneca']) {
    const cs = await db.collection('lead-pipeline-companies').where('county', '==', county).get();
    cs.forEach((d) => {
      const x = d.data();
      for (const key of Object.keys(TRUTH)) {
        if ((x.taxOwner || '').includes(key) || (x.operatingCompany || '').includes(key)) {
          if (!sample.find((s) => s.key === key)) {
            sample.push({
              key, taxOwner: x.taxOwner, parcelAddress: x.parcelAddress || '',
              city: x.city || '', classDesc: x.classDesc || '', tier: x.tier || 'SMALL',
            });
          }
          break;
        }
      }
    });
  }

  console.log(`\n=== Pipeline sample harness — ${sample.length} known-truth companies ===\n`);
  let qualified = 0, asExpected = 0;
  for (const c of sample) {
    const p = await enrichCompanyPerplexity(
      { taxOwner: c.taxOwner, parcelAddress: c.parcelAddress, city: c.city, classDesc: c.classDesc },
      PPLX_KEY,
    );
    let stage = routePerplexity(p);
    let dm = '';
    if (stage === 'perplexity_done') {
      const a = await enrichCompanyApollo(
        { operatingCompany: p.operatingCompany, website: p.website, city: c.city, tier: c.tier },
        APOLLO_KEY,
      );
      stage = a.qualified ? 'apollo_done' : `dropped_apollo (${a.apolloError || 'no on-target DM/email'})`;
      dm = a.qualified ? ` → ${a.decisionMaker} / ${a.decisionMakerTitle} / ${a.email}` : '';
    }
    const t = TRUTH[c.key];
    const final = stage.startsWith('apollo_done') ? 'qualified'
      : stage.startsWith('dropped') ? 'dropped' : 'needs_review';
    const ok = t.expect.split('|').includes(final) || (t.expect.includes('dup'));
    if (final === 'qualified') qualified++;
    if (ok) asExpected++;
    console.log(`${ok ? '✓' : '✗'} ${c.key} [${c.tier}]  (expect ${t.expect})`);
    console.log(`    pplx : ${p.operatingCompany || '∅'} | ${p.website || '∅'} | ${p.status || '∅'}/${p.confidence || '∅'}`);
    console.log(`    final: ${stage}${dm}`);
    console.log(`    note : ${t.note}\n`);
  }
  console.log(`=== ${asExpected}/${sample.length} matched expectation · ${qualified} qualified ===`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
