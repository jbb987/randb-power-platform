import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { AppraisalResult, BroadbandResult, LandComp, SiteInputs, SiteRegistryEntry } from '../types';
import { parseCoordinates } from '../utils/parseCoordinates';

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

/** Fetch all sites in the registry. */
export async function getAllSites(): Promise<SiteRegistryEntry[]> {
  const snap = await getDocs(registryRef());
  return snap.docs.map((d) => d.data() as SiteRegistryEntry);
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

/** Subscribe to real-time updates for the full site registry. */
export function subscribeSiteRegistry(
  callback: (sites: SiteRegistryEntry[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    registryRef(),
    (snap) => {
      const sites = snap.docs.map((d) => d.data() as SiteRegistryEntry);
      sites.sort((a, b) => a.name.localeCompare(b.name));
      callback(sites);
    },
    (err) => {
      console.error('[SiteRegistry] Subscription error:', err);
      onError?.(err);
    },
  );
}

// ── Sync helper (Site Appraiser → Registry) ───────────────────────────────

/**
 * Sync a Site Appraiser site to the registry by coordinates.
 * If a matching entry exists, updates it. Otherwise creates a new one.
 * Returns the registry entry ID, or null if coordinates are invalid.
 */
export async function syncSiteToRegistry(
  registrySites: SiteRegistryEntry[],
  siteInputs: SiteInputs,
  appraisalResult: AppraisalResult | null,
  userId: string,
): Promise<string | null> {
  const coords = parseCoordinates(siteInputs.coordinates);
  if (!coords) return null;

  const match = findSiteByCoordinates(registrySites, coords.lat, coords.lng);

  const data = {
    name: siteInputs.siteName || 'Untitled Site',
    address: siteInputs.address,
    coordinates: coords,
    acreage: siteInputs.totalAcres,
    mwCapacity: siteInputs.mw,
    dollarPerAcreLow: siteInputs.ppaLow,
    dollarPerAcreHigh: siteInputs.ppaHigh,
    projectId: siteInputs.projectId || undefined,
    ...(appraisalResult && appraisalResult.energizedValue > 0
      ? { appraisalResult }
      : {}),
  };

  if (match) {
    await updateSiteEntry(match.id, data);
    return match.id;
  }

  const newId = await createSiteEntry({
    ...data,
    coordinates: coords,
    createdBy: userId,
    memberIds: [userId],
  });
  return newId;
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

export async function saveWaterToSite(
  siteId: string,
  result: Record<string, unknown>,
): Promise<void> {
  await updateSiteEntry(siteId, { waterResult: result });
}

export async function saveGasToSite(
  siteId: string,
  result: Record<string, unknown>,
): Promise<void> {
  await updateSiteEntry(siteId, { gasResult: result });
}

export async function saveTransportToSite(
  siteId: string,
  result: Record<string, unknown>,
): Promise<void> {
  await updateSiteEntry(siteId, { transportResult: result });
}

export async function saveLaborToSite(
  siteId: string,
  result: Record<string, unknown>,
): Promise<void> {
  await updateSiteEntry(siteId, { laborResult: result });
}

export async function saveLandCompsToSite(
  siteId: string,
  comps: LandComp[],
): Promise<void> {
  await updateSiteEntry(siteId, { landComps: comps });
}

export async function saveAnalysisTimestamp(siteId: string): Promise<void> {
  await updateSiteEntry(siteId, { piddrGeneratedAt: Date.now() });
}

/** Bag of analysis section payloads written together in a single updateDoc. */
export interface AnalysisResultsPayload {
  appraisalResult?: AppraisalResult;
  infraResult?: Record<string, unknown>;
  broadbandResult?: BroadbandResult;
  transportResult?: Record<string, unknown>;
  waterResult?: Record<string, unknown>;
  gasResult?: Record<string, unknown>;
  laborResult?: Record<string, unknown>;
}

/**
 * Persist all completed sections of a Site Analyzer run plus the run timestamp
 * in a single Firestore write. Replaces the previous fan-out of 7 separate
 * updateDoc calls (one per section + timestamp) which both burned writes and
 * produced 7 redundant snapshots downstream.
 */
export async function saveAnalysisResults(
  siteId: string,
  results: AnalysisResultsPayload,
): Promise<void> {
  await updateSiteEntry(siteId, { ...results, piddrGeneratedAt: Date.now() });
}

// ── Migration: Site Appraiser sites → Registry ────────────────────────────

/**
 * One-time migration: reads all sites from the legacy `sites` Firestore collection
 * and creates registry entries for any that don't already exist.
 * Fetches current registry directly from Firestore to avoid stale React state.
 * Matches by coordinates OR by name+projectId to prevent duplicates.
 * Returns the number of sites migrated.
 */
export async function migrateLegacySitesToRegistry(
  _existingRegistrySites: SiteRegistryEntry[],
  userId: string,
): Promise<number> {
  // Fetch both collections fresh from Firestore to avoid race conditions
  const [legacySnap, registrySnap] = await Promise.all([
    getDocs(collection(db, 'sites')),
    getDocs(registryRef()),
  ]);

  const legacySites = legacySnap.docs.map((d) => d.data() as { id: string; inputs: SiteInputs; createdAt: number; updatedAt: number });
  const currentRegistry = registrySnap.docs.map((d) => d.data() as SiteRegistryEntry);

  // Build lookup sets for fast duplicate detection
  const coordKeys = new Set<string>();
  const nameProjectKeys = new Set<string>();
  for (const r of currentRegistry) {
    if (r.coordinates) {
      coordKeys.add(`${r.coordinates.lat.toFixed(5)},${r.coordinates.lng.toFixed(5)}`);
    }
    if (r.name && r.projectId) {
      nameProjectKeys.add(`${r.name.toLowerCase()}::${r.projectId}`);
    }
  }

  let migrated = 0;
  for (const legacy of legacySites) {
    const inputs = legacy.inputs;
    if (!inputs) continue;

    const coords = parseCoordinates(inputs.coordinates);

    // Check for duplicate by coordinates
    if (coords) {
      const key = `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`;
      if (coordKeys.has(key)) continue;
      coordKeys.add(key); // prevent duplicates within this batch
    }

    // Check for duplicate by name + projectId
    if (inputs.siteName && inputs.projectId) {
      const key = `${inputs.siteName.toLowerCase()}::${inputs.projectId}`;
      if (nameProjectKeys.has(key)) continue;
      nameProjectKeys.add(key);
    }

    // Skip sites with no coordinates and no name (nothing useful to migrate)
    if (!coords && !inputs.siteName) continue;

    // Firestore rejects `undefined` values — only include fields that have real data
    const entry: Record<string, unknown> = {
      name: inputs.siteName || 'Untitled Site',
      address: inputs.address || '',
      coordinates: coords ?? { lat: 0, lng: 0 },
      acreage: inputs.totalAcres || 0,
      mwCapacity: inputs.mw || 0,
      dollarPerAcreLow: inputs.ppaLow || 0,
      dollarPerAcreHigh: inputs.ppaHigh || 0,
      createdBy: userId,
      memberIds: [userId],
    };
    if (inputs.projectId) entry.projectId = inputs.projectId;
    if (inputs.priorUsage) entry.priorUsage = inputs.priorUsage;
    if (inputs.legalDescription) entry.legalDescription = inputs.legalDescription;
    if (inputs.county) entry.county = inputs.county;
    if (inputs.parcelId) entry.parcelId = inputs.parcelId;
    if (inputs.owner) entry.owner = inputs.owner;

    await createSiteEntry(entry as Omit<SiteRegistryEntry, 'id' | 'createdAt' | 'updatedAt'>);
    migrated++;
  }

  return migrated;
}

/**
 * Remove duplicate registry entries. Keeps the entry with the most data
 * (most non-null tool result fields), removes the rest.
 * Returns the number of duplicates removed.
 */
export async function deduplicateRegistry(): Promise<number> {
  const snap = await getDocs(registryRef());
  const allSites = snap.docs.map((d) => d.data() as SiteRegistryEntry);

  // Group by coordinate key OR by name+projectId for sites without coordinates
  const groups = new Map<string, SiteRegistryEntry[]>();
  for (const site of allSites) {
    let key: string;
    if (site.coordinates && !(site.coordinates.lat === 0 && site.coordinates.lng === 0)) {
      key = `coord:${site.coordinates.lat.toFixed(5)},${site.coordinates.lng.toFixed(5)}`;
    } else if (site.name) {
      key = `name:${site.name.toLowerCase()}::${site.projectId ?? ''}`;
    } else {
      continue;
    }
    const group = groups.get(key) ?? [];
    group.push(site);
    groups.set(key, group);
  }

  let removed = 0;
  for (const [, group] of groups) {
    if (group.length <= 1) continue;

    // Score each entry by how much data it has
    function score(s: SiteRegistryEntry): number {
      let n = 0;
      if (s.appraisalResult) n++;
      if (s.infraResult) n++;
      if (s.broadbandResult) n++;
      if (s.waterResult) n++;
      if (s.gasResult) n++;
      if (s.laborResult) n++;
      if (s.piddrGeneratedAt) n++;
      if (s.address) n++;
      if (s.name && s.name !== 'Untitled Site') n++;
      return n;
    }

    // Sort by score descending — keep the best one
    group.sort((a, b) => score(b) - score(a));
    const keeper = group[0];

    // Merge useful fields from duplicates into the keeper
    const mergedFields: Record<string, unknown> = {};
    for (let i = 1; i < group.length; i++) {
      const dup = group[i];
      if (!keeper.projectId && dup.projectId) mergedFields.projectId = dup.projectId;
      if (!keeper.address && dup.address) mergedFields.address = dup.address;
      if (!keeper.appraisalResult && dup.appraisalResult) mergedFields.appraisalResult = dup.appraisalResult;
      if (!keeper.infraResult && dup.infraResult) mergedFields.infraResult = dup.infraResult;
      if (!keeper.broadbandResult && dup.broadbandResult) mergedFields.broadbandResult = dup.broadbandResult;
      if (!keeper.waterResult && dup.waterResult) mergedFields.waterResult = dup.waterResult;
      if (!keeper.gasResult && dup.gasResult) mergedFields.gasResult = dup.gasResult;
      if (!keeper.laborResult && dup.laborResult) mergedFields.laborResult = dup.laborResult;
      if (!keeper.piddrGeneratedAt && dup.piddrGeneratedAt) mergedFields.piddrGeneratedAt = dup.piddrGeneratedAt;
      if (!keeper.priorUsage && dup.priorUsage) mergedFields.priorUsage = dup.priorUsage;
      if (!keeper.county && dup.county) mergedFields.county = dup.county;
      if (!keeper.owner && dup.owner) mergedFields.owner = dup.owner;
      if (keeper.name === 'Untitled Site' && dup.name && dup.name !== 'Untitled Site') mergedFields.name = dup.name;
      await deleteSiteEntry(dup.id);
      removed++;
    }

    // Apply merged fields to the keeper
    if (Object.keys(mergedFields).length > 0) {
      await updateSiteEntry(keeper.id, mergedFields);
    }
  }

  return removed;
}

/**
 * Repair: re-link registry sites that lost their projectId during dedup.
 * Reads the legacy `sites` collection and matches by name or coordinates,
 * then restores the projectId on the registry entry.
 */
export async function repairProjectLinks(): Promise<number> {
  const [legacySnap, registrySnap] = await Promise.all([
    getDocs(collection(db, 'sites')),
    getDocs(registryRef()),
  ]);

  const legacySites = legacySnap.docs.map((d) => d.data() as { id: string; inputs: SiteInputs });
  const registrySites = registrySnap.docs.map((d) => d.data() as SiteRegistryEntry);

  let repaired = 0;
  for (const reg of registrySites) {
    if (reg.projectId) continue; // already has a project

    // Try to find a legacy site that matches by coordinates or name
    for (const legacy of legacySites) {
      if (!legacy.inputs?.projectId) continue;

      let match = false;

      // Match by coordinates
      if (reg.coordinates && legacy.inputs.coordinates) {
        const legacyCoords = parseCoordinates(legacy.inputs.coordinates);
        if (legacyCoords &&
          parseFloat(reg.coordinates.lat.toFixed(5)) === parseFloat(legacyCoords.lat.toFixed(5)) &&
          parseFloat(reg.coordinates.lng.toFixed(5)) === parseFloat(legacyCoords.lng.toFixed(5))) {
          match = true;
        }
      }

      // Match by name
      if (!match && reg.name && legacy.inputs.siteName &&
        reg.name.toLowerCase() === legacy.inputs.siteName.toLowerCase()) {
        match = true;
      }

      if (match) {
        await updateSiteEntry(reg.id, { projectId: legacy.inputs.projectId });
        repaired++;
        break;
      }
    }
  }

  return repaired;
}
