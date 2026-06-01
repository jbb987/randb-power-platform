#!/usr/bin/env node
/**
 * One-shot migration from the legacy flat-category document system into the
 * customer-rooted folder & document system.
 *
 * What it does
 * ============
 *  Pass 1 — CRM documents
 *    For every doc in `crm-documents`:
 *      - Ensure a folder exists at the customer root for that doc's legacy
 *        `category` (e.g. "Legal", "Invoices"). Created on demand only for
 *        categories that actually have content.
 *      - Create a `DocumentRecord` in the new `documents` collection with
 *        the doc's metadata and `folderId` pointing at the matching folder.
 *      - Storage blob is NOT moved. The new record's `storagePath` is the
 *        same path the legacy doc used; blobs stay where they are.
 *
 *  Pass 2 — Construction jobs
 *    For every doc in `construction-jobs`:
 *      - Resolve a `companyId` from the job (first of companyIds[] or
 *        subcontractorIds[]). Jobs with neither are logged and skipped.
 *      - Ensure the customer has a "Construction Projects" container folder
 *        at its root (kind=system, systemRole=construction-root).
 *      - Create a `Project` record in `customer-projects` with the job's
 *        name, status, dates, etc., and a `rootFolderId` pointing at a fresh
 *        per-project folder named after the job.
 *      - For each doc in the job's `documents` subcollection: group by
 *        legacy `category` (Permits / Plans / Contracts / …), create
 *        per-category folders under the project root, create
 *        `DocumentRecord`s.
 *      - For each photo in the job's `photos` subcollection: create a
 *        "Photos" folder under the project root, create one
 *        `DocumentRecord` per photo (mimeType `image/jpeg`, storagePath =
 *        the original `fullPath`). The thumbnail blob (`thumbPath`) is
 *        not referenced from the new record — blobs stay in Storage so
 *        nothing is lost, but the UI gets the full-res URL only.
 *
 * Idempotency
 * ===========
 * Every record the script creates has a deterministic id derived from the
 * source:
 *   • Customer category folder    cat_{companyId}_{category}
 *   • Customer construction-root  cust_{companyId}_construction-root
 *   • Project root folder         proj_{jobId}_root
 *   • Project category folder     proj_{jobId}_{category}
 *   • Project photos folder       proj_{jobId}_photos
 *   • Project record              {jobId}    (mirrors the legacy job id)
 *   • CRM document record         crmDoc_{originalDocId}
 *   • Job document record         jobDoc_{jobId}_{originalDocId}
 *   • Job photo record            jobPhoto_{jobId}_{originalPhotoId}
 *
 * Before creating any record the script checks `getDoc(...)` and skips if it
 * already exists. Safe to re-run as many times as you like; each run reports
 * what it actually wrote vs. what was already present.
 *
 * The script NEVER deletes legacy data. The original `crm-documents` and
 * `construction-jobs/{}/documents` and `construction-jobs/{}/photos`
 * collections stay readable. Storage blobs are never moved.
 *
 * Usage
 * =====
 * Run from inside the functions/ directory so the script can resolve
 * `firebase-admin` from functions/node_modules. (The repo root doesn't
 * depend on firebase-admin.)
 *
 *   # Default is dry-run — script logs everything it WOULD do but writes nothing.
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=../path/to/service-account.json \
 *   node ../scripts/migrate-to-folder-system.mjs
 *
 *   # Actually write to Firestore.
 *   node ../scripts/migrate-to-folder-system.mjs --confirm
 *
 *   # Only Pass 1 (CRM), or only Pass 2 (jobs).
 *   node ../scripts/migrate-to-folder-system.mjs --confirm --pass=crm
 *   node ../scripts/migrate-to-folder-system.mjs --confirm --pass=jobs
 *
 *   # Limit the script to N customers / N jobs (smoke-test on a slice first).
 *   node ../scripts/migrate-to-folder-system.mjs --confirm --limit=5
 *
 * Recommended workflow:
 *   1. Export prod Firestore → import into a staging Firebase project.
 *   2. Set GOOGLE_APPLICATION_CREDENTIALS to the staging project's key.
 *   3. Run --dry-run, scan the summary for unexpected skips/errors.
 *   4. Run --confirm against staging. Verify the new collections look right.
 *   5. Switch credentials to prod, repeat (3) and (4).
 */

import admin from 'firebase-admin';

// ── CLI args ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = !args.includes('--confirm');
const passArg = args.find((a) => a.startsWith('--pass='))?.split('=')[1] ?? 'both';
const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1];
const limit = limitArg ? Number(limitArg) : Infinity;

if (!['both', 'crm', 'jobs'].includes(passArg)) {
  console.error(`Unknown --pass value "${passArg}". Use crm | jobs | both.`);
  process.exit(1);
}

console.log(`[migrate] mode: ${dryRun ? 'DRY RUN — no writes' : 'CONFIRMED — writes enabled'}`);
console.log(`[migrate] pass: ${passArg}`);
if (limit !== Infinity) console.log(`[migrate] limit: ${limit}`);

// ── Firebase Admin init ─────────────────────────────────────────────────

admin.initializeApp(); // reads GOOGLE_APPLICATION_CREDENTIALS

const db = admin.firestore();

// ── Constants (mirror src/types/index.ts) ────────────────────────────────

const FOLDERS = 'folders';
const DOCUMENTS = 'documents';
const CUSTOMER_PROJECTS = 'customer-projects';

const CRM_CATEGORY_LABELS = {
  legal: 'Legal',
  invoice: 'Invoices',
  contract: 'Contracts',
  deliverable: 'Deliverables',
  photo: 'Photos',
  other: 'Other',
};

const JOB_CATEGORY_LABELS = {
  permit: 'Permits',
  plan: 'Plans',
  contract: 'Contracts',
  invoice: 'Invoices',
  inspection: 'Inspections',
  safety: 'Safety',
  other: 'Other',
};

// ── Stats ────────────────────────────────────────────────────────────────

const stats = {
  foldersCreated: 0,
  foldersSkipped: 0,
  projectsCreated: 0,
  projectsSkipped: 0,
  docsCreated: 0,
  docsSkipped: 0,
  photosCreated: 0,
  photosSkipped: 0,
  errors: 0,
};

function logBlock(label) {
  console.log(`\n[migrate] === ${label} ===`);
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Set a doc with deterministic id, but only if it doesn't already exist.
 *  Returns 'created' | 'skipped'. In dry-run, returns 'created'/'skipped' as if
 *  it had run but doesn't actually write. */
async function setIfMissing(collection, id, data, kindForStats) {
  const ref = db.collection(collection).doc(id);
  const existing = await ref.get();
  if (existing.exists) {
    stats[`${kindForStats}Skipped`] += 1;
    return 'skipped';
  }
  if (!dryRun) {
    await ref.set(data);
  }
  stats[`${kindForStats}Created`] += 1;
  return 'created';
}

/** Build the canonical Folder shape. */
function buildFolder({
  id,
  companyId,
  projectId,
  parentFolderId,
  ancestorFolderIds,
  name,
  systemRole,
  createdBy = 'system',
  position,
}) {
  const now = Date.now();
  return {
    id,
    companyId,
    ...(projectId ? { projectId } : {}),
    parentFolderId,
    ancestorFolderIds,
    name,
    position: position ?? now,
    kind: 'system',
    ...(systemRole ? { systemRole } : {}),
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy,
  };
}

/** Build the canonical DocumentRecord shape. */
function buildDocument({
  id,
  companyId,
  projectId,
  folderId,
  ancestorFolderIds,
  name,
  mimeType,
  byteSize,
  storagePath,
  uploadedAt,
  uploadedBy,
  legacyCategory,
  archivedAt,
  archivedBy,
}) {
  return {
    id,
    companyId,
    ...(projectId ? { projectId } : {}),
    folderId,
    ancestorFolderIds,
    name,
    mimeType,
    byteSize,
    storagePath,
    uploadedAt: uploadedAt ?? Date.now(),
    uploadedBy: uploadedBy ?? 'system',
    updatedAt: uploadedAt ?? Date.now(),
    updatedBy: uploadedBy ?? 'system',
    ...(legacyCategory ? { legacyCategory } : {}),
    // Preserve soft-archive state so a re-run doesn't resurrect archived docs.
    ...(archivedAt != null ? { archivedAt } : {}),
    ...(archivedBy ? { archivedBy } : {}),
  };
}

/** Build the canonical Project shape. */
function buildProject({ id, companyId, name, status, rootFolderId, startDate, endDate, createdBy }) {
  const now = Date.now();
  return {
    id,
    companyId,
    type: 'construction',
    name,
    status: status ?? 'active',
    rootFolderId,
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    createdAt: now,
    createdBy: createdBy ?? 'system',
    updatedAt: now,
    updatedBy: createdBy ?? 'system',
  };
}

// ── Pass 1: CRM documents ───────────────────────────────────────────────

async function pass1Crm() {
  logBlock('Pass 1: CRM documents');

  const snap = await db.collection('crm-documents').get();
  console.log(`[crm] ${snap.size} legacy crm-documents docs to consider`);

  // Group by companyId for efficient folder creation.
  const byCompany = new Map();
  for (const d of snap.docs) {
    const data = d.data();
    const companyId = data.companyId;
    if (!companyId) {
      console.warn(`[crm] doc ${d.id}: missing companyId, skipping`);
      stats.errors += 1;
      continue;
    }
    if (!byCompany.has(companyId)) byCompany.set(companyId, []);
    byCompany.get(companyId).push({ id: d.id, data });
  }

  let companiesProcessed = 0;
  for (const [companyId, docs] of byCompany) {
    if (companiesProcessed >= limit) {
      console.log(`[crm] limit reached, stopping at ${limit} companies`);
      break;
    }

    // Build the set of categories that actually have docs for this company.
    const categoriesPresent = new Set(docs.map((d) => d.data.category ?? 'other'));

    // Ensure a folder exists per category.
    const folderIdByCategory = {};
    for (const category of categoriesPresent) {
      const folderId = `cat_${companyId}_${category}`;
      const folder = buildFolder({
        id: folderId,
        companyId,
        parentFolderId: null,
        ancestorFolderIds: [],
        name: CRM_CATEGORY_LABELS[category] ?? category,
      });
      await setIfMissing(FOLDERS, folderId, folder, 'folders');
      folderIdByCategory[category] = folderId;
    }

    // Create DocumentRecord per doc.
    for (const { id: origId, data } of docs) {
      const category = data.category ?? 'other';
      const folderId = folderIdByCategory[category];
      const newId = `crmDoc_${origId}`;
      const record = buildDocument({
        id: newId,
        companyId,
        folderId,
        ancestorFolderIds: [folderId],
        name: data.name ?? '(unnamed)',
        mimeType: data.contentType ?? 'application/octet-stream',
        byteSize: data.sizeBytes ?? 0,
        storagePath: data.storagePath ?? '',
        uploadedAt: data.uploadedAt,
        uploadedBy: data.uploadedBy,
        legacyCategory: category,
      });
      await setIfMissing(DOCUMENTS, newId, record, 'docs');
    }

    companiesProcessed += 1;
  }

  console.log(
    `[crm] done — companies processed: ${companiesProcessed}, ` +
      `folders created: ${stats.foldersCreated}, ` +
      `docs created: ${stats.docsCreated}`,
  );
}

// ── Pass 2: Construction jobs ───────────────────────────────────────────

async function pass2Jobs() {
  logBlock('Pass 2: Construction jobs');

  const jobsSnap = await db.collection('construction-jobs').get();
  console.log(`[jobs] ${jobsSnap.size} construction-jobs to consider`);

  let jobsProcessed = 0;
  for (const jobDoc of jobsSnap.docs) {
    if (jobsProcessed >= limit) {
      console.log(`[jobs] limit reached, stopping at ${limit} jobs`);
      break;
    }
    const jobId = jobDoc.id;
    const job = jobDoc.data();
    const companyId = job.companyIds?.[0] ?? job.subcontractorIds?.[0];
    if (!companyId) {
      console.warn(`[jobs] job ${jobId} "${job.name ?? '?'}": no companyId, skipping`);
      stats.errors += 1;
      continue;
    }

    // 1. Customer-level "Construction Projects" container folder.
    const constructionRootId = `cust_${companyId}_construction-root`;
    await setIfMissing(
      FOLDERS,
      constructionRootId,
      buildFolder({
        id: constructionRootId,
        companyId,
        parentFolderId: null,
        ancestorFolderIds: [],
        name: 'Construction Projects',
        systemRole: 'construction-root',
      }),
      'folders',
    );

    // 2. Project root folder, under the customer's construction-root.
    const projectRootId = `proj_${jobId}_root`;
    await setIfMissing(
      FOLDERS,
      projectRootId,
      buildFolder({
        id: projectRootId,
        companyId,
        projectId: jobId,
        parentFolderId: constructionRootId,
        ancestorFolderIds: [constructionRootId],
        name: job.name ?? '(unnamed project)',
        systemRole: 'project-root',
      }),
      'folders',
    );

    // 3. Project record in customer-projects.
    await setIfMissing(
      CUSTOMER_PROJECTS,
      jobId,
      buildProject({
        id: jobId,
        companyId,
        name: job.name ?? '(unnamed project)',
        status: job.status === 'completed' || job.status === 'cancelled' ? job.status : 'active',
        rootFolderId: projectRootId,
        startDate: job.startDate,
        endDate: job.expectedEndDate,
        createdBy: job.createdBy,
      }),
      'projects',
    );

    // 4. Documents subcollection → per-category folders + DocumentRecords.
    const docsSnap = await db
      .collection('construction-jobs')
      .doc(jobId)
      .collection('documents')
      .get();

    if (docsSnap.size > 0) {
      const docs = docsSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
      const categoriesPresent = new Set(docs.map((d) => d.data.category ?? 'other'));
      const folderIdByCategory = {};
      for (const category of categoriesPresent) {
        const folderId = `proj_${jobId}_${category}`;
        await setIfMissing(
          FOLDERS,
          folderId,
          buildFolder({
            id: folderId,
            companyId,
            projectId: jobId,
            parentFolderId: projectRootId,
            ancestorFolderIds: [constructionRootId, projectRootId],
            name: JOB_CATEGORY_LABELS[category] ?? category,
          }),
          'folders',
        );
        folderIdByCategory[category] = folderId;
      }

      for (const { id: origId, data } of docs) {
        const category = data.category ?? 'other';
        const folderId = folderIdByCategory[category];
        const newId = `jobDoc_${jobId}_${origId}`;
        await setIfMissing(
          DOCUMENTS,
          newId,
          buildDocument({
            id: newId,
            companyId,
            projectId: jobId,
            folderId,
            ancestorFolderIds: [constructionRootId, projectRootId, folderId],
            name: data.name ?? '(unnamed)',
            mimeType: data.contentType ?? 'application/octet-stream',
            byteSize: data.sizeBytes ?? 0,
            storagePath: data.storagePath ?? '',
            uploadedAt: data.uploadedAt,
            uploadedBy: data.uploadedBy,
            legacyCategory: category,
            archivedAt: data.archivedAt,
            archivedBy: data.archivedBy,
          }),
          'docs',
        );
      }
    }

    // 5. Photos subcollection → single "Photos" folder + DocumentRecord per photo.
    const photosSnap = await db
      .collection('construction-jobs')
      .doc(jobId)
      .collection('photos')
      .get();

    if (photosSnap.size > 0) {
      const photosFolderId = `proj_${jobId}_photos`;
      await setIfMissing(
        FOLDERS,
        photosFolderId,
        buildFolder({
          id: photosFolderId,
          companyId,
          projectId: jobId,
          parentFolderId: projectRootId,
          ancestorFolderIds: [constructionRootId, projectRootId],
          name: 'Photos',
        }),
        'folders',
      );

      for (const photoDoc of photosSnap.docs) {
        const data = photoDoc.data();
        const newId = `jobPhoto_${jobId}_${photoDoc.id}`;
        await setIfMissing(
          DOCUMENTS,
          newId,
          buildDocument({
            id: newId,
            companyId,
            projectId: jobId,
            folderId: photosFolderId,
            ancestorFolderIds: [constructionRootId, projectRootId, photosFolderId],
            name: data.caption?.trim() || `photo-${photoDoc.id}.jpg`,
            mimeType: data.contentType ?? 'image/jpeg',
            byteSize: data.sizeBytes ?? 0,
            // Storage path points to the full-resolution blob. The thumbPath
            // blob is left in Storage but is not referenced from the new
            // record — UI can resolve a smaller variant on its own later.
            storagePath: data.fullPath ?? '',
            uploadedAt: data.uploadedAt,
            uploadedBy: data.uploadedBy,
          }),
          'photos',
        );
      }
    }

    jobsProcessed += 1;
  }

  console.log(
    `[jobs] done — jobs processed: ${jobsProcessed}, ` +
      `projects created: ${stats.projectsCreated}, ` +
      `folders created: ${stats.foldersCreated}, ` +
      `docs created: ${stats.docsCreated}, ` +
      `photos migrated: ${stats.photosCreated}`,
  );
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  if (passArg === 'crm' || passArg === 'both') await pass1Crm();
  if (passArg === 'jobs' || passArg === 'both') await pass2Jobs();

  logBlock('Summary');
  console.log(`  folders   created: ${stats.foldersCreated}  skipped: ${stats.foldersSkipped}`);
  console.log(`  projects  created: ${stats.projectsCreated}  skipped: ${stats.projectsSkipped}`);
  console.log(`  documents created: ${stats.docsCreated}  skipped: ${stats.docsSkipped}`);
  console.log(`  photos    created: ${stats.photosCreated}  skipped: ${stats.photosSkipped}`);
  console.log(`  errors:   ${stats.errors}`);
  if (dryRun) {
    console.log(`\n[migrate] DRY RUN — nothing was written. Re-run with --confirm to apply.`);
  } else {
    console.log(`\n[migrate] writes completed.`);
  }
}

main().catch((err) => {
  console.error('[migrate] fatal:', err);
  process.exit(1);
});
