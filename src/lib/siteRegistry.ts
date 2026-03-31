import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { AppraisalResult, BroadbandResult, SiteRegistryEntry, UserRole } from '../types';

const COLLECTION = 'sites-registry';

function registryRef() {
  return collection(db, COLLECTION);
}

/** Create a new site registry entry. Returns the generated ID. */
export async function createSiteEntry(
  entry: Omit<SiteRegistryEntry, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const id = doc(collection(db, COLLECTION)).id;
  const now = Date.now();
  const full: SiteRegistryEntry = { ...entry, id, createdAt: now, updatedAt: now };
  await setDoc(doc(db, COLLECTION, id), full);
  return id;
}

/** Partial update on an existing entry. */
export async function updateSiteEntry(
  id: string,
  updates: Partial<SiteRegistryEntry>,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { ...updates, updatedAt: Date.now() });
}

/** Delete a site entry. */
export async function deleteSiteEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

/** Fetch a single entry by ID. */
export async function getSiteEntry(id: string): Promise<SiteRegistryEntry | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? (snap.data() as SiteRegistryEntry) : null;
}

/**
 * Fetch all sites visible to a user.
 * Admins see everything; employees see only sites they created or are members of.
 */
export async function getUserSites(
  userId: string,
  role: UserRole,
): Promise<SiteRegistryEntry[]> {
  if (role === 'admin') {
    const snap = await getDocs(registryRef());
    return snap.docs.map((d) => d.data() as SiteRegistryEntry);
  }
  // Employees: fetch where createdBy === userId
  const ownSnap = await getDocs(
    query(registryRef(), where('createdBy', '==', userId)),
  );
  const own = ownSnap.docs.map((d) => d.data() as SiteRegistryEntry);
  // Also fetch where memberIds contains userId
  const memberSnap = await getDocs(
    query(registryRef(), where('memberIds', 'array-contains', userId)),
  );
  const member = memberSnap.docs.map((d) => d.data() as SiteRegistryEntry);
  // Deduplicate by id
  const map = new Map<string, SiteRegistryEntry>();
  for (const s of [...own, ...member]) map.set(s.id, s);
  return Array.from(map.values());
}

/** Find a registry site matching the given coordinates (within ~1m precision). */
export function findSiteByCoordinates(
  sites: SiteRegistryEntry[],
  lat: number,
  lng: number,
  precision = 5,
): SiteRegistryEntry | null {
  const rLat = parseFloat(lat.toFixed(precision));
  const rLng = parseFloat(lng.toFixed(precision));
  return sites.find((s) => {
    if (!s.coordinates) return false;
    return (
      parseFloat(s.coordinates.lat.toFixed(precision)) === rLat &&
      parseFloat(s.coordinates.lng.toFixed(precision)) === rLng
    );
  }) ?? null;
}

/** Client-side search by name or address. */
export function searchSitesLocal(
  sites: SiteRegistryEntry[],
  q: string,
): SiteRegistryEntry[] {
  const lower = q.toLowerCase();
  return sites.filter(
    (s) =>
      s.name.toLowerCase().includes(lower) ||
      s.address.toLowerCase().includes(lower),
  );
}

/** Subscribe to real-time updates for a user's visible sites. */
export function subscribeSiteRegistry(
  userId: string,
  role: UserRole,
  callback: (sites: SiteRegistryEntry[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (role === 'admin') {
    return onSnapshot(
      registryRef(),
      (snap) => {
        const sites = snap.docs.map((d) => d.data() as SiteRegistryEntry);
        sites.sort((a, b) => b.updatedAt - a.updatedAt);
        callback(sites);
      },
      (err) => {
        console.error('[SiteRegistry] Subscription error:', err);
        onError?.(err);
      },
    );
  }
  // For employees, listen to sites they created
  return onSnapshot(
    query(registryRef(), where('createdBy', '==', userId)),
    (snap) => {
      const sites = snap.docs.map((d) => d.data() as SiteRegistryEntry);
      sites.sort((a, b) => b.updatedAt - a.updatedAt);
      callback(sites);
    },
    (err) => {
      console.error('[SiteRegistry] Subscription error:', err);
      onError?.(err);
    },
  );
}

// ── Write-back helpers (tools save results to site profile) ──────────────

export async function saveAppraisalToSite(
  siteId: string,
  result: AppraisalResult,
): Promise<void> {
  await updateSiteEntry(siteId, { appraisalResult: result });
}

export async function saveInfraToSite(
  siteId: string,
  result: Record<string, unknown>,
): Promise<void> {
  await updateSiteEntry(siteId, { infraResult: result });
}

export async function saveBroadbandToSite(
  siteId: string,
  result: BroadbandResult,
): Promise<void> {
  await updateSiteEntry(siteId, { broadbandResult: result });
}

export async function savePiddrTimestamp(siteId: string): Promise<void> {
  await updateSiteEntry(siteId, { piddrGeneratedAt: Date.now() });
}
