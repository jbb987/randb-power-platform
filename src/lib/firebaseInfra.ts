/**
 * Firestore CRUD operations for cached infrastructure data.
 *
 * Collections:
 *   infrastructure/power-plants/{id}
 *   infrastructure/substations/{id}
 *   infrastructure/eia-state-data/{state}
 *   infrastructure/solar-state-averages/{state}
 *   infrastructure/meta/refresh-log
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  CachedPowerPlant,
  CachedSubstation,
  EiaStateData,
  SolarStateAverage,
  InfraRefreshLog,
  GeoBBox,
} from '../types/infrastructure';

// ── Collection references ──────────────────────────────────────────────────

const PLANTS_COL = 'infrastructure/power-plants/items';
const SUBSTATIONS_COL = 'infrastructure/substations/items';
const EIA_COL = 'infrastructure/eia-state-data/items';
const SOLAR_COL = 'infrastructure/solar-state-averages/items';
const REFRESH_LOG_DOC = 'infrastructure/meta';

// ── Power Plants ───────────────────────────────────────────────────────────

/**
 * Fetch cached power plants within a bounding box.
 *
 * Firestore only supports inequality filters on a single field, so we
 * query on `lat` and filter `lng` client-side. This is fine for our
 * data size (~12K total plants).
 */
export async function fetchCachedPlants(bbox: GeoBBox): Promise<CachedPowerPlant[]> {
  const colRef = collection(db, PLANTS_COL);
  const q = query(
    colRef,
    where('lat', '>=', bbox.minLat),
    where('lat', '<=', bbox.maxLat),
    orderBy('lat'),
  );

  const snapshot = await getDocs(q);
  const results: CachedPowerPlant[] = [];

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() as CachedPowerPlant;
    // Client-side longitude filter
    if (data.lng >= bbox.minLng && data.lng <= bbox.maxLng) {
      results.push(data);
    }
  }

  return results;
}

// ── Substations ────────────────────────────────────────────────────────────

/**
 * Fetch cached substations within a bounding box.
 * Same geo-query approach as plants (inequality on lat, filter lng client-side).
 */
export async function fetchCachedSubstations(bbox: GeoBBox): Promise<CachedSubstation[]> {
  const colRef = collection(db, SUBSTATIONS_COL);
  const q = query(
    colRef,
    where('lat', '>=', bbox.minLat),
    where('lat', '<=', bbox.maxLat),
    orderBy('lat'),
  );

  const snapshot = await getDocs(q);
  const results: CachedSubstation[] = [];

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() as CachedSubstation;
    if (data.lng >= bbox.minLng && data.lng <= bbox.maxLng) {
      results.push(data);
    }
  }

  return results;
}

// ── EIA State Data ─────────────────────────────────────────────────────────

/**
 * Fetch EIA data for a specific state (electricity prices, demand, capacity factors).
 */
export async function fetchEiaStateData(stateAbbrev: string): Promise<EiaStateData | null> {
  const docRef = doc(db, EIA_COL, stateAbbrev.toUpperCase());
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return docSnap.data() as EiaStateData;
}

/**
 * Fetch all EIA state data records.
 */
export async function fetchAllEiaStateData(): Promise<EiaStateData[]> {
  const colRef = collection(db, EIA_COL);
  const snapshot = await getDocs(colRef);
  return snapshot.docs.map((d) => d.data() as EiaStateData);
}

// ── Solar/Wind Averages ────────────────────────────────────────────────────

/**
 * Fetch solar/wind averages for a specific state.
 */
export async function fetchSolarAverage(stateAbbrev: string): Promise<SolarStateAverage | null> {
  const docRef = doc(db, SOLAR_COL, stateAbbrev.toUpperCase());
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return docSnap.data() as SolarStateAverage;
}

// ── Refresh Log ────────────────────────────────────────────────────────────

/**
 * Get the last infrastructure data refresh timestamp and record counts.
 */
export async function getLastRefreshTime(): Promise<InfraRefreshLog | null> {
  const docRef = doc(db, REFRESH_LOG_DOC);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return docSnap.data() as InfraRefreshLog;
}

// ── Nearby queries (radius-based) ──────────────────────────────────────────

/**
 * Convert a center point + radius in miles to a bounding box.
 * 1 degree latitude ~ 69 miles.
 */
export function radiusToBBox(
  center: { lat: number; lng: number },
  radiusMiles: number,
): GeoBBox {
  const latDelta = radiusMiles / 69;
  const lngDelta = radiusMiles / (69 * Math.cos((center.lat * Math.PI) / 180));
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

/**
 * Fetch plants near a point within a given radius.
 */
export async function fetchNearbyPlants(
  center: { lat: number; lng: number },
  radiusMiles: number,
): Promise<CachedPowerPlant[]> {
  const bbox = radiusToBBox(center, radiusMiles);
  return fetchCachedPlants(bbox);
}

/**
 * Fetch substations near a point within a given radius.
 */
export async function fetchNearbySubstations(
  center: { lat: number; lng: number },
  radiusMiles: number,
): Promise<CachedSubstation[]> {
  const bbox = radiusToBBox(center, radiusMiles);
  return fetchCachedSubstations(bbox);
}
