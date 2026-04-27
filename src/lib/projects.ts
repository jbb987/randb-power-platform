import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Project } from '../types';

const COLLECTION = 'projects';

export async function saveProject(project: Project): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTION, project.id), project);
  } catch (err) {
    console.error('[Firebase] Failed to save project:', err);
    throw err;
  }
}
