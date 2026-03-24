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
import type { SiteRequest, SiteRequestStatus } from '../types';

export const SITE_REQUESTS_COLLECTION = 'siteRequests';

function requestsRef() {
  return collection(db, SITE_REQUESTS_COLLECTION);
}

export async function saveSiteRequest(request: SiteRequest): Promise<void> {
  try {
    await setDoc(doc(db, SITE_REQUESTS_COLLECTION, request.id), request);
  } catch (err) {
    console.error('[Firebase] Failed to save site request:', err);
    throw err;
  }
}

export async function updateRequestStatus(
  id: string,
  status: SiteRequestStatus,
): Promise<void> {
  try {
    await updateDoc(doc(db, SITE_REQUESTS_COLLECTION, id), {
      status,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase] Failed to update request status:', err);
    throw err;
  }
}

export async function deleteSiteRequest(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, SITE_REQUESTS_COLLECTION, id));
  } catch (err) {
    console.error('[Firebase] Failed to delete site request:', err);
    throw err;
  }
}

export function subscribeSiteRequests(
  callback: (requests: SiteRequest[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    requestsRef(),
    (snapshot) => {
      const requests = snapshot.docs.map((d) => d.data() as SiteRequest);
      requests.sort((a, b) => b.createdAt - a.createdAt);
      callback(requests);
    },
    (err) => {
      console.error('[Firebase] Site requests subscription error:', err);
      onError?.(err);
    },
  );
}
