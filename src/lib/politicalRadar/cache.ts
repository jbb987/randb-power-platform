/**
 * Firestore cache for the political radar federal layer.
 *
 * Keyed by geohash(lat, lng, precision=5) — federal data is district / state
 * / RTO level, so a ~5 km grid cell is far finer than any signal we surface.
 * This means many sites in the same county share a cache hit.
 *
 * TTL is 24 h. Bills + EOs change daily at most; reps and tribal data change
 * at congressional / decennial timescales.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { FederalLayerData } from './types';

const COLLECTION = 'political-radar-federal-cache';
const TTL_MS = 24 * 60 * 60 * 1000;

interface CachedDoc {
  data: FederalLayerData;
  cachedAt: number;
}

export async function readFederalCache(geohash5: string): Promise<FederalLayerData | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, geohash5));
    if (!snap.exists()) return null;
    const cached = snap.data() as CachedDoc;
    if (!cached.cachedAt || Date.now() - cached.cachedAt > TTL_MS) return null;
    return cached.data;
  } catch (err) {
    // Cache misses (or perms errors) shouldn't break the live fetch.
    console.warn('[PoliticalRadar] cache read failed:', err);
    return null;
  }
}

export async function writeFederalCache(
  geohash5: string,
  data: FederalLayerData,
): Promise<void> {
  try {
    const payload: CachedDoc = { data, cachedAt: Date.now() };
    await setDoc(doc(db, COLLECTION, geohash5), payload);
  } catch (err) {
    console.warn('[PoliticalRadar] cache write failed:', err);
  }
}
