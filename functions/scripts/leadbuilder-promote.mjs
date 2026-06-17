/**
 * One-off PROMOTE (preview of P6's "promote" button). Takes the pipeline
 * companies at stage 'apollo_done' and writes them into the `leads` collection
 * (mapping pipeline fields → the Lead schema), assigned to an admin, then marks
 * each pipeline row 'promoted'. Run from functions/ (needs firebase-admin + ADC).
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT = 'randb-site-valuator';
initializeApp({ projectId: PROJECT });
const db = getFirestore();

function clean(o) {
  const r = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = v;
  return r;
}

async function pickAssignee() {
  for (const email of ['jb@randbpowerinc.us', 'jb@randbpowersolutions.com']) {
    const q = await db.collection('users').where('email', '==', email).limit(1).get();
    if (!q.empty) return { uid: q.docs[0].id, name: email.split('@')[0] };
  }
  const admins = await db.collection('users').where('role', '==', 'admin').limit(1).get();
  if (!admins.empty) return { uid: admins.docs[0].id, name: (admins.docs[0].data().email || 'admin').split('@')[0] };
  return { uid: 'unassigned', name: 'Unassigned' };
}

const assignee = await pickAssignee();
const comps = await db.collection('lead-pipeline-companies').where('stage', '==', 'apollo_done').get();
console.log(`Promoting ${comps.size} qualified companies → leads (assigned to ${assignee.name})\n`);

let n = 0;
for (const doc of comps.docs) {
  const c = doc.data();
  const ref = db.collection('leads').doc();
  const now = Date.now();
  await ref.set(
    clean({
      id: ref.id,
      assignedTo: assignee.uid,
      assignedToName: assignee.name,
      businessName: c.operatingCompany || c.taxOwner || 'Unknown',
      phone: c.orgPhone || '',
      email: c.email || '',
      description: c.description || '',
      decisionMakerName: c.decisionMaker || '',
      decisionMakerRole: c.decisionMakerTitle || '',
      status: 'new',
      notes: [],
      source: 'lead-builder',
      sourcePipelineId: c.id,
      tier: c.tier,
      energyIntensity: c.energyIntensity,
      operatingCompany: c.operatingCompany,
      website: c.website,
      linkedinUrl: c.linkedinUrl,
      apolloPersonId: c.apolloPersonId,
      mobileStatus: 'none',
      createdAt: now,
      updatedAt: now,
    }),
  );
  await doc.ref.update({ stage: 'promoted', promotedLeadId: ref.id, updatedAt: now });
  console.log(`  ✓ ${c.operatingCompany || c.taxOwner} → lead ${ref.id}`);
  n++;
}
console.log(`\nDone — ${n} leads promoted into the Leads tool.`);
process.exit(0);
