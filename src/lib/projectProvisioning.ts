import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import {
  CUSTOMER_PROJECTS_COLLECTION,
  FOLDERS_COLLECTION,
  type Folder,
  type Project,
} from '../types';

/** Construction-job folder + Project record auto-provisioning. Called from
 *  the create-job flow so every new job has a working FolderBrowser the
 *  moment it lands — no empty state, no race between users.
 *
 *  Ids are deterministic and identical to the migration script's pattern:
 *    cust_{companyId}_construction-root  — customer-level container
 *    proj_{jobId}_root                   — per-project root folder
 *    customer-projects/{jobId}           — Project record
 *
 *  All three creates are guarded by `getDoc` first so re-running for an
 *  already-provisioned job is a no-op (matching migration idempotency). */
export async function provisionProjectFolders(input: {
  companyId: string;
  jobId: string;
  jobName: string;
  createdBy: string;
}): Promise<{ rootFolderId: string; projectId: string }> {
  const { companyId, jobId, jobName, createdBy } = input;
  const now = Date.now();

  const constructionRootId = `cust_${companyId}_construction-root`;
  const projectRootId = `proj_${jobId}_root`;

  // 1. Customer-level "Construction Projects" container folder.
  await ensureFolder(constructionRootId, () => ({
    id: constructionRootId,
    companyId,
    parentFolderId: null,
    ancestorFolderIds: [],
    name: 'Construction Projects',
    position: now,
    kind: 'system',
    systemRole: 'construction-root',
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy,
  }));

  // 2. Per-project root folder.
  await ensureFolder(projectRootId, () => ({
    id: projectRootId,
    companyId,
    projectId: jobId,
    parentFolderId: constructionRootId,
    ancestorFolderIds: [constructionRootId],
    name: jobName || '(unnamed project)',
    position: now,
    kind: 'system',
    systemRole: 'project-root',
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy,
  }));

  // 3. Project record in customer-projects.
  const projectRef = doc(db, CUSTOMER_PROJECTS_COLLECTION, jobId);
  const projectSnap = await getDoc(projectRef);
  if (!projectSnap.exists()) {
    const project: Project = {
      id: jobId,
      companyId,
      type: 'construction',
      name: jobName || '(unnamed project)',
      status: 'active',
      rootFolderId: projectRootId,
      createdAt: now,
      createdBy,
      updatedAt: now,
      updatedBy: createdBy,
    };
    await setDoc(projectRef, project);
  }

  return { rootFolderId: projectRootId, projectId: jobId };
}

async function ensureFolder(id: string, build: () => Folder): Promise<void> {
  const ref = doc(db, FOLDERS_COLLECTION, id);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, build());
}

/** Default folder skeleton seeded inside every new LLR site root, in order.
 *  Created as regular ('user') folders so the team can rename / archive / add
 *  to them. Deterministic ids keep re-provisioning idempotent AND preserve
 *  later edits — a folder the user renamed or archived is never recreated or
 *  reverted, because `ensureFolder` skips any id that already exists. */
const PRECON_DEFAULT_FOLDERS = [
  'Load Interconnection',
  'Client Intel',
  'Land Related',
  'Project Designs',
] as const;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Pre-Construction folder + Project record auto-provisioning. Mirrors
 *  `provisionProjectFolders` but creates the pre-con folder skeleton:
 *    cust_{companyId}_precon-root  — customer-level container
 *    precon_{siteId}_root          — per-site root folder
 *    customer-projects/{siteId}    — Project record (type='pre-con')
 *
 *  Idempotent: each create is guarded so re-running for an already-provisioned
 *  site is a no-op. */
export async function provisionPreConFolders(input: {
  companyId: string;
  siteId: string;
  siteName: string;
  createdBy: string;
}): Promise<{ rootFolderId: string; projectId: string }> {
  const { companyId, siteId, siteName, createdBy } = input;
  const now = Date.now();

  const preconRootId = `cust_${companyId}_precon-root`;
  const siteRootId = `precon_${siteId}_root`;

  await ensureFolder(preconRootId, () => ({
    id: preconRootId,
    companyId,
    parentFolderId: null,
    ancestorFolderIds: [],
    name: 'Large Load Request Sites',
    position: now,
    kind: 'system',
    systemRole: 'pre-con-root',
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy,
  }));

  await ensureFolder(siteRootId, () => ({
    id: siteRootId,
    companyId,
    projectId: siteId,
    parentFolderId: preconRootId,
    ancestorFolderIds: [preconRootId],
    name: siteName || '(unnamed pre-con site)',
    position: now,
    kind: 'system',
    systemRole: 'project-root',
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy,
  }));

  // Seed the default folder structure under the site root (idempotent).
  for (let i = 0; i < PRECON_DEFAULT_FOLDERS.length; i++) {
    const name = PRECON_DEFAULT_FOLDERS[i];
    const childId = `precon_${siteId}_${slugify(name)}`;
    await ensureFolder(childId, () => ({
      id: childId,
      companyId,
      projectId: siteId,
      parentFolderId: siteRootId,
      ancestorFolderIds: [preconRootId, siteRootId],
      name,
      position: now + (i + 1) * 1000,
      kind: 'user',
      createdAt: now,
      createdBy,
      updatedAt: now,
      updatedBy: createdBy,
    }));
  }

  const projectRef = doc(db, CUSTOMER_PROJECTS_COLLECTION, siteId);
  const projectSnap = await getDoc(projectRef);
  if (!projectSnap.exists()) {
    const project: Project = {
      id: siteId,
      companyId,
      type: 'pre-con',
      name: siteName || '(unnamed pre-con site)',
      status: 'active',
      rootFolderId: siteRootId,
      siteId,
      createdAt: now,
      createdBy,
      updatedAt: now,
      updatedBy: createdBy,
    };
    await setDoc(projectRef, project);
  }

  return { rootFolderId: siteRootId, projectId: siteId };
}
