import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import {
  initializeFirestore,
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
  apiKey: "AIzaSyCo0AaVQKOecQKoXVyyUzoOD4bwY35aoZQ",
  authDomain: "randb-site-valuator.firebaseapp.com",
  projectId: "randb-site-valuator",
  storageBucket: "randb-site-valuator.firebasestorage.app",
  messagingSenderId: "882533648595",
  appId: "1:882533648595:web:a54324262bb2585d4c2c26",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const functions = getFunctions(app, 'us-central1');
export const storage = getStorage(app);
const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

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
