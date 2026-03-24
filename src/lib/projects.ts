import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Project } from '../types';

const COLLECTION = 'projects';

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

export async function deleteProjectFromDB(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTION, id));
  } catch (err) {
    console.error('[Firebase] Failed to delete project:', err);
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