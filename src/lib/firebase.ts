import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import type { SavedSite } from '../types';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const db = getFirestore(app);

const COLLECTION = 'sites';

function sitesRef() {
  return collection(db, COLLECTION);
}

/** Save or update a site */
export async function saveSite(site: SavedSite): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTION, site.id), {
      id: site.id,
      inputs: site.inputs,
      createdAt: site.createdAt,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase] Failed to save site:', err);
  }
}

/** Delete a site */
export async function deleteSiteFromDB(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTION, id));
  } catch (err) {
    console.error('[Firebase] Failed to delete site:', err);
  }
}

/** Load all sites once */
export async function loadAllSites(): Promise<SavedSite[]> {
  try {
    const snapshot = await getDocs(sitesRef());
    return snapshot.docs.map((d) => d.data() as SavedSite);
  } catch (err) {
    console.error('[Firebase] Failed to load sites:', err);
    return [];
  }
}

/** Subscribe to real-time updates (so Bailey and JB stay in sync) */
export function subscribeSites(
  callback: (sites: SavedSite[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    sitesRef(),
    (snapshot) => {
      const sites = snapshot.docs.map((d) => d.data() as SavedSite);
      // Sort by creation date
      sites.sort((a, b) => a.createdAt - b.createdAt);
      callback(sites);
    },
    (err) => {
      console.error('[Firebase] Subscription error:', err);
      onError?.(err);
    },
  );
}

/**
 * Create a new Firebase Auth user without signing out the current admin.
 * Uses a secondary app instance so the primary auth state is untouched.
 */
export async function createAuthUser(email: string, password: string): Promise<string> {
  const secondaryApp = initializeApp(firebaseConfig, 'secondary-' + Date.now());
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    return cred.user.uid;
  } finally {
    await secondaryAuth.signOut();
  }
}

/**
 * Send a password reset email to the given address.
 */
export async function sendResetEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export { db };
