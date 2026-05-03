/**
 * Well Finder — Monthly trigger for the PDQ (production data) Cloud Run job.
 *
 * Runs the 13th of each month at 12:00 UTC. RRC's PDQ Dump file is updated
 * the last Saturday of each month; we wait ~2 weeks to pick up that month's
 * cycle plus any back-fills.
 *
 * The Cloud Run service URL is stored in Secret Manager as
 * WELL_FINDER_PDQ_URL.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { GoogleAuth } from 'google-auth-library';

const PDQ_URL = defineSecret('WELL_FINDER_PDQ_URL');

export const triggerPdqIngest = onSchedule(
  {
    schedule: '0 12 13 * *',
    timeZone: 'UTC',
    region: 'us-east1',
    secrets: [PDQ_URL],
    timeoutSeconds: 1800,
    memory: '256MiB',
  },
  async () => {
    const url = PDQ_URL.value();
    if (!url) throw new Error('WELL_FINDER_PDQ_URL is not set');
    logger.info(`triggerPdqIngest: invoking ${url}`);

    const auth = new GoogleAuth();
    const client = await auth.getIdTokenClient(url);
    const res = await client.request({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {},
      timeout: 60 * 60 * 1000, // 60 min
    });
    logger.info(`triggerPdqIngest: Cloud Run responded ${res.status}`, res.data);
  },
);
