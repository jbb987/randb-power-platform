/**
 * Lead Builder backend test driver. Creates a pipeline job for a county, then
 * auto-approves the cost gates as each stage completes (in production the admin
 * approves these in the UI), and prints the qualified leads at the end.
 *
 * Prereq: Application Default Credentials — run once:  gcloud auth application-default login
 * Run from the functions/ dir so firebase-admin resolves:
 *   node scripts/leadbuilder-test.mjs Hamilton
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const county = process.argv[2] || 'Hamilton';
const PROJECT = 'randb-site-valuator';

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const now = Date.now();
const jobRef = db.collection('lead-pipeline-jobs').doc();
await jobRef.set({
  county,
  state: 'NY',
  scope: 'industrial',
  status: 'ingesting',
  requestedBy: 'test-harness',
  createdAt: now,
  updatedAt: now,
});
console.log(`Created job ${jobRef.id} — ${county} County, NY (industrial). Waiting for the pipeline…\n`);

let last = '';
const start = Date.now();
const TIMEOUT_MS = 12 * 60 * 1000;

while (Date.now() - start < TIMEOUT_MS) {
  await sleep(5000);
  const job = (await jobRef.get()).data() ?? {};
  const status = job.status;
  if (status !== last) {
    const t = new Date().toISOString().slice(11, 19);
    console.log(`[${t}] status: ${status}${job.counts ? '  ' + JSON.stringify(job.counts) : ''}`);
    last = status;
  }
  if (status === 'awaiting_perplexity_approval') {
    console.log('   → auto-approving Perplexity stage');
    await jobRef.update({ status: 'enriching_perplexity', updatedAt: Date.now() });
  } else if (status === 'awaiting_apollo_approval') {
    console.log('   → auto-approving Apollo stage');
    await jobRef.update({ status: 'enriching_apollo', updatedAt: Date.now() });
  } else if (status === 'review' || status === 'error') {
    if (status === 'error') console.log('   ERROR:', job.error);
    break;
  }
}

const comps = await db.collection('lead-pipeline-companies').where('jobId', '==', jobRef.id).get();
const byStage = {};
comps.forEach((d) => {
  const s = d.data().stage;
  byStage[s] = (byStage[s] || 0) + 1;
});
console.log('\n=== RESULT ===');
console.log('companies by stage:', byStage);

const qualified = comps.docs.map((d) => d.data()).filter((c) => c.stage === 'apollo_done');
console.log(`\nqualified leads: ${qualified.length}`);
for (const c of qualified.slice(0, 12)) {
  console.log(
    `  [${c.tier}] ${(c.operatingCompany || c.taxOwner || '').slice(0, 32).padEnd(32)} | ` +
      `${(c.decisionMaker || '?').padEnd(20)} ${(c.decisionMakerTitle || '').slice(0, 22).padEnd(22)} | ` +
      `${c.email || 'no email'} | ${c.website || ''}`,
  );
}
process.exit(0);
