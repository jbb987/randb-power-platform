/**
 * Admin data ingestion pipeline for infrastructure data.
 *
 * Fetches data from external APIs (GeoPlataform ArcGIS, HIFLD, EIA)
 * and writes it to Firestore for fast cached reads.
 *
 * Called from the admin InfraRefreshPanel UI.
 */

import {
  doc,
  writeBatch,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { normalizeStatus } from './powerMapData';
import { STATE_ELECTRICITY_AVERAGES } from './electricityAverages';
import { STATE_SOLAR_AVERAGES } from './solarAverages';
import { STATE_CONSUMPTION } from './eiaConsumption';
import { FALLBACK_CAPACITY_FACTORS } from './eiaApi';
import type {
  CachedPowerPlant,
  CachedSubstation,
  EiaStateData,
  SolarStateAverage,
} from '../types/infrastructure';

// ── Constants ──────────────────────────────────────────────────────────────

const GEOPLATFORM = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services';
const HIFLD = 'https://services.arcgis.com/G4S1dGvn7PIgYd6Y/ArcGIS/rest/services';

const LAYERS = {
  powerPlants: `${GEOPLATFORM}/Power_Plants_in_the_US/FeatureServer/0`,
  substations: `${HIFLD}/HIFLD_electric_power_substations/FeatureServer/0`,
} as const;

const PAGE_SIZE = 2000;
const MAX_PAGES = 50;
const BATCH_SIZE = 500; // Firestore max batch size

const PLANTS_COL = 'infrastructure/power-plants/items';
const SUBSTATIONS_COL = 'infrastructure/substations/items';
const EIA_COL = 'infrastructure/eia-state-data/items';
const SOLAR_COL = 'infrastructure/solar-state-averages/items';
const REFRESH_LOG_DOC = 'infrastructure/meta';

// ── Progress callback ──────────────────────────────────────────────────────

export interface IngestionProgress {
  stage: 'plants' | 'substations' | 'eia' | 'solar' | 'done';
  message: string;
  count?: number;
  total?: number;
}

type ProgressCallback = (progress: IngestionProgress) => void;

// ── Source normalization (matches powerMapData.ts) ─────────────────────────

function normalizeSource(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('solar')) return 'Solar';
  if (s.includes('wind')) return 'Wind';
  if (s.includes('natural gas') || s.includes('ng ')) return 'Natural Gas';
  if (s.includes('coal')) return 'Coal';
  if (s.includes('nuclear')) return 'Nuclear';
  if (s.includes('hydro')) return 'Hydroelectric';
  if (s.includes('petroleum') || s.includes('distillate') || s.includes('oil')) return 'Petroleum';
  if (s.includes('biomass') || s.includes('wood') || s.includes('landfill') || s.includes('msw') || s.includes('waste')) return 'Biomass';
  if (s.includes('geothermal')) return 'Geothermal';
  return 'Other';
}

// ── Batch writer helper ────────────────────────────────────────────────────

async function writeBatchDocs(
  collectionPath: string,
  docs: { id: string; data: Record<string, unknown> }[],
): Promise<number> {
  let written = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + BATCH_SIZE);

    for (const item of chunk) {
      const ref = doc(db, collectionPath, item.id);
      batch.set(ref, item.data);
    }

    await batch.commit();
    written += chunk.length;
  }

  return written;
}

// ── Power Plants Ingestion ─────────────────────────────────────────────────

export async function ingestPowerPlants(
  onProgress?: ProgressCallback,
): Promise<number> {
  onProgress?.({ stage: 'plants', message: 'Fetching power plants from ArcGIS...' });

  const allPlants: CachedPowerPlant[] = [];
  let offset = 0;
  let pages = 0;

  while (pages < MAX_PAGES) {
    const url =
      `${LAYERS.powerPlants}/query?` +
      `where=1%3D1` +
      `&outFields=Plant_Name%2CPrimSource%2CInstall_MW%2CUtility_Na%2CLatitude%2CLongitude` +
      `&returnGeometry=false` +
      `&resultRecordCount=${PAGE_SIZE}` +
      `&resultOffset=${offset}` +
      `&f=json`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Power plants fetch failed (HTTP ${res.status})`);

    const data = await res.json();
    if (data.error) throw new Error(data.error.message ?? 'ArcGIS query error');

    const features = data.features ?? [];

    for (const f of features) {
      const a = f.attributes as Record<string, unknown>;
      const lat = Number(a.Latitude) || 0;
      const lng = Number(a.Longitude) || 0;
      if (!lat || !lng) continue; // skip records without coords

      allPlants.push({
        id: `plant-${allPlants.length}`,
        name: String(a.Plant_Name ?? ''),
        operator: String(a.Utility_Na ?? ''),
        primarySource: normalizeSource(String(a.PrimSource ?? '')),
        capacityMW: Number(a.Install_MW) || 0,
        status: 'active', // GeoPlataform dataset only has operable plants
        lat,
        lng,
      });
    }

    onProgress?.({
      stage: 'plants',
      message: `Fetched ${allPlants.length} power plants...`,
      count: allPlants.length,
    });

    if (features.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    pages++;
  }

  onProgress?.({
    stage: 'plants',
    message: `Writing ${allPlants.length} plants to Firestore...`,
    count: allPlants.length,
  });

  const docs = allPlants.map((plant) => ({
    id: plant.id,
    data: { ...plant } as Record<string, unknown>,
  }));

  const written = await writeBatchDocs(PLANTS_COL, docs);

  onProgress?.({
    stage: 'plants',
    message: `Wrote ${written} power plants to Firestore.`,
    count: written,
  });

  return written;
}

// ── Substations Ingestion ──────────────────────────────────────────────────

/** Case-insensitive attribute lookup. */
function getAttr(attrs: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (attrs[key] !== undefined) return attrs[key];
    const upper = key.toUpperCase();
    const lower = key.toLowerCase();
    if (attrs[upper] !== undefined) return attrs[upper];
    if (attrs[lower] !== undefined) return attrs[lower];
  }
  return undefined;
}

export async function ingestSubstations(
  onProgress?: ProgressCallback,
): Promise<number> {
  onProgress?.({ stage: 'substations', message: 'Fetching substations from HIFLD...' });

  const allSubs: CachedSubstation[] = [];
  let offset = 0;
  let pages = 0;
  let failed = false;

  try {
    while (pages < MAX_PAGES) {
      const url =
        `${LAYERS.substations}/query?` +
        `where=1%3D1` +
        `&outFields=*` +
        `&returnGeometry=true` +
        `&outSR=4326` +
        `&resultRecordCount=${PAGE_SIZE}` +
        `&resultOffset=${offset}` +
        `&f=json`;

      const res = await fetch(url);
      if (!res.ok) { failed = true; break; }

      const data = await res.json();
      if (data.error) { failed = true; break; }

      const features = data.features ?? [];
      if (features.length === 0 && pages === 0) { failed = true; break; }

      for (const f of features) {
        const a = f.attributes as Record<string, unknown>;
        const name = String(getAttr(a, 'NAME', 'Name', 'name') ?? '');
        if (!name || name === 'NOT AVAILABLE') continue;

        const lat = f.geometry?.y || Number(getAttr(a, 'LATITUDE', 'Latitude', 'LAT') ?? 0);
        const lng = f.geometry?.x || Number(getAttr(a, 'LONGITUDE', 'Longitude', 'LONG', 'LON') ?? 0);
        if (!lat || !lng || lat === -999999 || lng === -999999) continue;

        allSubs.push({
          id: `sub-${allSubs.length}`,
          name,
          owner: String(getAttr(a, 'OWNER', 'Owner', 'owner') ?? ''),
          maxVoltKV: Math.max(0, Number(getAttr(a, 'MAX_VOLT', 'Max_Volt') ?? 0)),
          minVoltKV: Math.max(0, Number(getAttr(a, 'MIN_VOLT', 'Min_Volt') ?? 0)),
          status: normalizeStatus(String(getAttr(a, 'STATUS', 'Status') ?? '')),
          connectedLines: Math.max(0, Number(getAttr(a, 'LINES', 'Lines') ?? 0)),
          lat,
          lng,
        });
      }

      onProgress?.({
        stage: 'substations',
        message: `Fetched ${allSubs.length} substations...`,
        count: allSubs.length,
      });

      if (features.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      pages++;
    }
  } catch {
    failed = true;
  }

  if (failed && allSubs.length === 0) {
    onProgress?.({
      stage: 'substations',
      message: 'HIFLD API unavailable. Substations will be derived from transmission lines at query time.',
      count: 0,
    });
    return 0;
  }

  onProgress?.({
    stage: 'substations',
    message: `Writing ${allSubs.length} substations to Firestore...`,
    count: allSubs.length,
  });

  const docs = allSubs.map((sub) => ({
    id: sub.id,
    data: { ...sub } as Record<string, unknown>,
  }));

  const written = await writeBatchDocs(SUBSTATIONS_COL, docs);

  onProgress?.({
    stage: 'substations',
    message: `Wrote ${written} substations to Firestore.`,
    count: written,
  });

  return written;
}

// ── EIA Data Ingestion ─────────────────────────────────────────────────────

/**
 * Ingest EIA data for all states from existing static data.
 * Combines electricity prices (from electricityAverages.ts),
 * demand (from eiaConsumption.ts), and capacity factors (fallback values).
 */
export async function ingestEiaData(
  onProgress?: ProgressCallback,
): Promise<number> {
  onProgress?.({ stage: 'eia', message: 'Preparing EIA state data...' });

  const docs: { id: string; data: Record<string, unknown> }[] = [];

  for (const [abbr, prices] of Object.entries(STATE_ELECTRICITY_AVERAGES)) {
    const consumption = STATE_CONSUMPTION.find((s) => s.abbr === abbr);

    const record: EiaStateData = {
      state: abbr,
      electricityPrices: {
        commercial: prices.commercial,
        industrial: prices.industrial,
        allSectors: prices.allSectors,
      },
      demandMW: consumption?.avgDemandMW ?? 0,
      capacityFactors: { ...FALLBACK_CAPACITY_FACTORS },
    };

    docs.push({
      id: abbr,
      data: record as unknown as Record<string, unknown>,
    });
  }

  onProgress?.({
    stage: 'eia',
    message: `Writing ${docs.length} state EIA records to Firestore...`,
    count: docs.length,
  });

  const written = await writeBatchDocs(EIA_COL, docs);

  onProgress?.({
    stage: 'eia',
    message: `Wrote ${written} EIA state records.`,
    count: written,
  });

  return written;
}

// ── Solar Averages Ingestion ───────────────────────────────────────────────

/**
 * Ingest solar/wind averages from existing static data.
 */
export async function ingestSolarAverages(
  onProgress?: ProgressCallback,
): Promise<number> {
  onProgress?.({ stage: 'solar', message: 'Preparing solar state averages...' });

  const docs: { id: string; data: Record<string, unknown> }[] = [];

  for (const [abbr, avg] of Object.entries(STATE_SOLAR_AVERAGES)) {
    const record: SolarStateAverage = {
      state: abbr,
      ghi: avg.ghi,
      dni: avg.latTilt, // Use lat-tilt as DNI proxy
      windSpeed: 0,     // Not available in current static data
    };

    docs.push({
      id: abbr,
      data: record as unknown as Record<string, unknown>,
    });
  }

  onProgress?.({
    stage: 'solar',
    message: `Writing ${docs.length} solar state records to Firestore...`,
    count: docs.length,
  });

  const written = await writeBatchDocs(SOLAR_COL, docs);

  onProgress?.({
    stage: 'solar',
    message: `Wrote ${written} solar state records.`,
    count: written,
  });

  return written;
}

// ── Full Refresh Orchestrator ──────────────────────────────────────────────

export interface RefreshResult {
  powerPlants: number;
  substations: number;
  eiaStates: number;
  solarStates: number;
}

/**
 * Refresh all infrastructure data: plants, substations, EIA, and solar averages.
 * Updates the refresh log with timestamp and record counts.
 */
export async function refreshAllInfraData(
  onProgress?: ProgressCallback,
): Promise<RefreshResult> {
  const plantCount = await ingestPowerPlants(onProgress);
  const subCount = await ingestSubstations(onProgress);
  const eiaCount = await ingestEiaData(onProgress);
  const solarCount = await ingestSolarAverages(onProgress);

  // Update refresh log
  const logRef = doc(db, REFRESH_LOG_DOC);
  await setDoc(logRef, {
    lastRefreshedAt: serverTimestamp(),
    recordCounts: {
      powerPlants: plantCount,
      substations: subCount,
      eiaStates: eiaCount,
      solarStates: solarCount,
    },
  }, { merge: true });

  onProgress?.({
    stage: 'done',
    message: `Refresh complete: ${plantCount} plants, ${subCount} substations, ${eiaCount} EIA records, ${solarCount} solar records.`,
  });

  return {
    powerPlants: plantCount,
    substations: subCount,
    eiaStates: eiaCount,
    solarStates: solarCount,
  };
}
