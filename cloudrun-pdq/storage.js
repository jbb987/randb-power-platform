/**
 * Cloud Storage writer for per-lease monthly time series JSON.
 * One file per lease: well-finder/production/{ogCode}/{district}/{lease}.json
 * Frontend can fetch by leaseKey when rendering a sparkline.
 */
import { Storage } from '@google-cloud/storage';

const BUCKET_NAME = process.env.WELL_FINDER_BUCKET || 'randb-site-valuator.firebasestorage.app';
const PREFIX = 'well-finder/production';

const storage = new Storage();
const bucket = storage.bucket(BUCKET_NAME);

/** Write a single lease's monthly array as JSON. Sets the firebaseStorageDownloadTokens metadata
 *  so the frontend can fetch via Firebase SDK if needed. */
export async function writeLeaseTimeSeries(leaseKey, months) {
  const [og, district, leaseNo] = leaseKey.split('|');
  const path = `${PREFIX}/${og}/${district}/${leaseNo}.json`;

  const sorted = months.slice().sort((a, b) => a.ym.localeCompare(b.ym));
  const payload = JSON.stringify({
    leaseKey,
    months: sorted.map((m) => ({
      ym: `${m.ym.slice(0, 4)}-${m.ym.slice(4, 6)}`,
      oil: m.oil || 0,
      gas: m.gas || 0,
      cond: m.cond || 0,
      csgd: m.csgd || 0,
    })),
  });

  await bucket.file(path).save(payload, {
    contentType: 'application/json',
    metadata: {
      cacheControl: 'public, max-age=86400',
    },
  });
}
