/**
 * Well Finder — Storage trigger that invokes the tippecanoe Cloud Run job.
 *
 * Fires when `well-finder/wells.geojson.gz` is (over)written by the monthly
 * `fetchRrcWells` job. POSTs to the Cloud Run service (URL injected via
 * `WELL_FINDER_TIPPECANOE_URL` env var on this function) with the source
 * + destination paths.
 *
 * Authentication: we issue a Google ID token for the Cloud Run service URL
 * using the Cloud Function's runtime service account (must have
 * `roles/run.invoker` on the target service).
 */
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { GoogleAuth } from 'google-auth-library';

const TIPPECANOE_URL = defineSecret('WELL_FINDER_TIPPECANOE_URL');
const TARGET_PATH = 'well-finder/wells.geojson.gz';
const PMTILES_PATH = 'well-finder/wells.pmtiles';

export const triggerPmtilesBuild = onObjectFinalized(
  {
    // Must match the Firebase Storage bucket region (Storage triggers
    // are region-locked). Cloud Run service can stay in us-central1.
    region: 'us-east1',
    secrets: [TIPPECANOE_URL],
    timeoutSeconds: 540,
    memory: '256MiB',
  },
  async (event) => {
    const objectName = event.data.name;
    if (objectName !== TARGET_PATH) return;

    const bucket = event.data.bucket;
    const tippecanoeUrl = TIPPECANOE_URL.value();
    if (!tippecanoeUrl) {
      logger.error('WELL_FINDER_TIPPECANOE_URL is not set; skipping build');
      return;
    }

    logger.info(`triggerPmtilesBuild: invoking ${tippecanoeUrl} for ${bucket}/${objectName}`);

    const auth = new GoogleAuth();
    const client = await auth.getIdTokenClient(tippecanoeUrl);

    const res = await client.request({
      url: tippecanoeUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {
        bucket,
        sourcePath: objectName,
        destPath: PMTILES_PATH,
      },
    });

    logger.info(`triggerPmtilesBuild: Cloud Run responded ${res.status}`);
  },
);
