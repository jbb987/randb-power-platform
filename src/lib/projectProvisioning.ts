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
