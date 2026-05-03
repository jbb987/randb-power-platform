/**
 * Well Finder — Monthly RRC Wells snapshot.
 *
 * Pulls every well from RRC ArcGIS Layer 1 (paginated), normalizes to a single
 * GeoJSON FeatureCollection, gzip-compresses, and uploads to Firebase Storage:
 *
 *   gs://<default-bucket>/well-finder/wells.geojson.gz             (latest)
 *   gs://<default-bucket>/well-finder/snapshots/wells-YYYY-MM.geojson.gz
 *
 * The Storage write triggers `triggerPmtilesBuild` (separate function) which
 * invokes the Cloud Run tippecanoe job to regenerate `wells.pmtiles`.
 *
 * Cadence: monthly (1st of month, 09:00 UTC). RRC publishes most relevant
 * tables monthly; weekly would just churn the same data.
 *
 * Runtime budget: ~400K wells × 1000/page = ~400 paginated calls, ≈ 5–10 min
 * with polite pacing. Cloud Function v2 Pub/Sub trigger allows up to 60 min.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { gzipSync } from 'zlib';

const RRC_LAYER =
  'https://gis.rrc.texas.gov/server/rest/services/rrc_public/RRC_Public_Viewer_Srvs/MapServer/1/query';

const PAGE_SIZE = 1000;
const PAGE_DELAY_MS = 100; // be polite to RRC

interface ArcGisFeature {
  attributes?: {
    API?: string;
    GIS_SYMBOL_DESCRIPTION?: string;
    GIS_LAT83?: number;
    GIS_LONG83?: number;
    OBJECTID?: number;
  };
  geometry?: { x?: number; y?: number };
}

interface ArcGisResponse {
  features?: ArcGisFeature[];
  exceededTransferLimit?: boolean;
  error?: { message?: string };
}

interface GeoJsonFeature {
  type: 'Feature';
  properties: {
    api: string;
    status: string;
    objectid: number;
  };
  geometry: { type: 'Point'; coordinates: [number, number] };
}

async function fetchPage(offset: number): Promise<ArcGisResponse> {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'API,GIS_SYMBOL_DESCRIPTION,OBJECTID',
    outSR: '4326',
    returnGeometry: 'true',
    f: 'json',
    resultRecordCount: String(PAGE_SIZE),
    resultOffset: String(offset),
    orderByFields: 'OBJECTID',
  });
  const url = `${RRC_LAYER}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RRC HTTP ${res.status} at offset ${offset}`);
  return (await res.json()) as ArcGisResponse;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function pullAllWells(): Promise<GeoJsonFeature[]> {
  const all: GeoJsonFeature[] = [];
  let offset = 0;
  let pageCount = 0;
  // Hard cap covering RRC's ~1.4M wells (~1,400 pages of 1000) plus headroom.
  const maxPages = 1500;

  while (pageCount < maxPages) {
    const data = await fetchPage(offset);
    if (data.error) {
      throw new Error(`RRC error: ${data.error.message ?? 'unknown'}`);
    }
    const features = data.features ?? [];

    for (const f of features) {
      const a = f.attributes ?? {};
      const lng = f.geometry?.x ?? a.GIS_LONG83;
      const lat = f.geometry?.y ?? a.GIS_LAT83;
      if (typeof lng !== 'number' || typeof lat !== 'number') continue;
      if (lat === 0 && lng === 0) continue;
      all.push({
        type: 'Feature',
        properties: {
          api: String(a.API ?? ''),
          status: String(a.GIS_SYMBOL_DESCRIPTION ?? 'Unknown'),
          objectid: Number(a.OBJECTID ?? 0),
        },
        geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
      });
    }

    pageCount++;
    if (features.length === 0) break;
    if (!data.exceededTransferLimit && features.length < PAGE_SIZE) break;

    offset += PAGE_SIZE;
    if (pageCount % 25 === 0) {
      logger.info(`fetchRrcWells: ${all.length.toLocaleString()} features after ${pageCount} pages`);
    }
    await sleep(PAGE_DELAY_MS);
  }

  return all;
}

function ymKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Scheduled monthly RRC wells snapshot job.
 * Runs the 1st of every month at 09:00 UTC.
 */
export const fetchRrcWells = onSchedule(
  {
    schedule: '0 9 1 * *',
    timeZone: 'UTC',
    // Aligned with the Storage bucket and the trigger function.
    region: 'us-east1',
    timeoutSeconds: 1800, // 30 min — scheduled-trigger max
    memory: '2GiB',       // 1.39M features peak ~1 GiB, 2 GiB gives headroom
  },
  async () => {
    const startedAt = Date.now();
    logger.info('fetchRrcWells: starting monthly RRC snapshot');

    const features = await pullAllWells();
    const fc = { type: 'FeatureCollection' as const, features };
    const json = JSON.stringify(fc);
    const gzipped = gzipSync(Buffer.from(json, 'utf8'));

    const bucket = admin.storage().bucket();
    const ym = ymKey(new Date());

    // Save options. We deliberately do NOT set Content-Encoding: gzip on the
    // object metadata — that would make GCS auto-decompress on download
    // (transcoding), which breaks the tippecanoe Cloud Run service that
    // expects to gunzip the stream itself. Store as application/gzip so the
    // bytes flow through unchanged.
    const snapPath = `well-finder/snapshots/wells-${ym}.geojson.gz`;
    await bucket.file(snapPath).save(gzipped, {
      contentType: 'application/gzip',
      metadata: {
        cacheControl: 'public, max-age=2592000', // 30 days
      },
    });

    const latestPath = 'well-finder/wells.geojson.gz';
    await bucket.file(latestPath).save(gzipped, {
      contentType: 'application/gzip',
      metadata: {
        cacheControl: 'public, max-age=86400',
      },
    });

    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    logger.info(
      `fetchRrcWells: wrote ${features.length.toLocaleString()} features ` +
      `(${(gzipped.byteLength / 1024 / 1024).toFixed(1)} MB gz) in ${elapsedSec}s ` +
      `to ${latestPath} + ${snapPath}`,
    );
  },
);
