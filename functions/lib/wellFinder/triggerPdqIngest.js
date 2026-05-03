"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerPdqIngest = void 0;
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
const scheduler_1 = require("firebase-functions/v2/scheduler");
const params_1 = require("firebase-functions/params");
const v2_1 = require("firebase-functions/v2");
const google_auth_library_1 = require("google-auth-library");
const PDQ_URL = (0, params_1.defineSecret)('WELL_FINDER_PDQ_URL');
exports.triggerPdqIngest = (0, scheduler_1.onSchedule)({
    schedule: '0 12 13 * *',
    timeZone: 'UTC',
    region: 'us-east1',
    secrets: [PDQ_URL],
    timeoutSeconds: 1800,
    memory: '256MiB',
}, async () => {
    const url = PDQ_URL.value();
    if (!url)
        throw new Error('WELL_FINDER_PDQ_URL is not set');
    v2_1.logger.info(`triggerPdqIngest: invoking ${url}`);
    const auth = new google_auth_library_1.GoogleAuth();
    const client = await auth.getIdTokenClient(url);
    const res = await client.request({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: {},
        timeout: 60 * 60 * 1000, // 60 min
    });
    v2_1.logger.info(`triggerPdqIngest: Cloud Run responded ${res.status}`, res.data);
});
//# sourceMappingURL=triggerPdqIngest.js.map