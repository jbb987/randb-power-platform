"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerRrcBulksIngest = void 0;
/**
 * Well Finder — Monthly trigger for RRC bulk ingestion.
 *
 * Scheduled for the 12th of each month (after RRC publishes IWAR by the 10th).
 * POSTs to the well-finder-rrc-bulks Cloud Run service which:
 *   - Scrapes the IWAR landing page → fetches the .txt → parses → upserts Firestore
 *   - Scrapes the Orphan Wells landing page → fetches ZIP → extracts xlsx → upserts
 *   - (Phase 2.5) Wellbore Query Data, P-5 Organization
 *
 * The Cloud Run URL is stored in Secret Manager as WELL_FINDER_RRC_BULKS_URL.
 */
const scheduler_1 = require("firebase-functions/v2/scheduler");
const params_1 = require("firebase-functions/params");
const v2_1 = require("firebase-functions/v2");
const google_auth_library_1 = require("google-auth-library");
const RRC_BULKS_URL = (0, params_1.defineSecret)('WELL_FINDER_RRC_BULKS_URL');
async function callRrcBulks() {
    const url = RRC_BULKS_URL.value();
    if (!url) {
        throw new Error('WELL_FINDER_RRC_BULKS_URL is not set');
    }
    v2_1.logger.info(`triggerRrcBulksIngest: invoking ${url}`);
    const auth = new google_auth_library_1.GoogleAuth();
    const client = await auth.getIdTokenClient(url);
    const res = await client.request({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: {}, // empty body = run all sources
        timeout: 30 * 60 * 1000, // 30 min
    });
    v2_1.logger.info(`triggerRrcBulksIngest: Cloud Run responded ${res.status}`, res.data);
}
/** Scheduled monthly RRC bulk ingest. */
exports.triggerRrcBulksIngest = (0, scheduler_1.onSchedule)({
    // 12th of every month at 09:00 UTC — after RRC publishes IWAR by the 10th
    schedule: '0 9 12 * *',
    timeZone: 'UTC',
    region: 'us-east1',
    secrets: [RRC_BULKS_URL],
    timeoutSeconds: 1800,
    memory: '256MiB',
}, async () => {
    await callRrcBulks();
});
// (Removed runRrcBulksIngestNow HTTP function — org policy blocks the
// implicit public IAM binding that onRequest uses by default. To re-run
// manually, trigger the scheduler:
//   gcloud scheduler jobs run firebase-schedule-triggerRrcBulksIngest-us-east1 --location=us-east1
// )
//# sourceMappingURL=triggerRrcBulksIngest.js.map