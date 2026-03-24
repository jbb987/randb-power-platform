import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  getDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { SITE_REQUESTS_COLLECTION } from './siteRequests';
import type { Project } from '../types';

const COLLECTION = 'projects';
const SITES_COLLECTION = 'sites';
export const UNASSIGNED_PROJECT_ID = 'unassigned';

function projectsRef() {
  return collection(db, COLLECTION);
}

export async function saveProject(project: Project): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTION, project.id), project);
  } catch (err) {
    console.error('[Firebase] Failed to save project:', err);
    throw err;
  }
}

export async function renameProjectInDB(id: string, name: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTION, id), { name, updatedAt: Date.now() });
  } catch (err) {
    console.error('[Firebase] Failed to rename project:', err);
    throw err;
  }
}

/**
 * Delete a project and cascade-delete all its sites and site requests.
 */
export async function deleteProjectCascade(projectId: string): Promise<void> {
  try {
    const [sitesSnapshot, requestsSnapshot] = await Promise.all([
      getDocs(query(collection(db, SITES_COLLECTION), where('inputs.projectId', '==', projectId))),
      getDocs(query(collection(db, SITE_REQUESTS_COLLECTION), where('projectId', '==', projectId))),
    ]);

    const batch = writeBatch(db);
    for (const siteDoc of sitesSnapshot.docs) {
      batch.delete(doc(db, SITES_COLLECTION, siteDoc.id));
    }
    for (const reqDoc of requestsSnapshot.docs) {
      batch.delete(doc(db, SITE_REQUESTS_COLLECTION, reqDoc.id));
    }
    batch.delete(doc(db, COLLECTION, projectId));

    await batch.commit();
  } catch (err) {
    console.error('[Firebase] Failed to cascade-delete project:', err);
    throw err;
  }
}

export function subscribeProjects(
  callback: (projects: Project[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    projectsRef(),
    (snapshot) => {
      const projects = snapshot.docs.map((d) => d.data() as Project);
      projects.sort((a, b) => a.createdAt - b.createdAt);
      callback(projects);
    },
    (err) => {
      console.error('[Firebase] Projects subscription error:', err);
      onError?.(err);
    },
  );
}

/**
 * One-time migration: finds sites without projectId and assigns them
 * to an "Unassigned" project. Idempotent — safe to call multiple times.
 */
export async function migrateOrphanedSites(): Promise<void> {
  try {
    const sitesSnapshot = await getDocs(collection(db, SITES_COLLECTION));
    const orphaned = sitesSnapshot.docs.filter((d) => {
      const data = d.data();
      return !data.inputs?.projectId;
    });

    if (orphaned.length === 0) return;

    // Ensure Unassigned project exists
    const unassignedRef = doc(db, COLLECTION, UNASSIGNED_PROJECT_ID);
    const unassignedDoc = await getDoc(unassignedRef);
    if (!unassignedDoc.exists()) {
      await setDoc(unassignedRef, {
        id: UNASSIGNED_PROJECT_ID,
        name: 'Unassigned',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    // Batch-update orphaned sites
    const batch = writeBatch(db);
    for (const siteDoc of orphaned) {
      const data = siteDoc.data();
      batch.update(doc(db, SITES_COLLECTION, siteDoc.id), {
        inputs: {
          ...data.inputs,
          projectId: UNASSIGNED_PROJECT_ID,
          utilityTerritory: data.inputs?.utilityTerritory ?? '',
          iso: data.inputs?.iso ?? '',
          description: data.inputs?.description ?? '',
        },
      });
    }
    await batch.commit();
    console.log(`[Migration] Migrated ${orphaned.length} orphaned sites to Unassigned project`);
  } catch (err) {
    console.error('[Migration] Failed to migrate orphaned sites:', err);
  }
}
