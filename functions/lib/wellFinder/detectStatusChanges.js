"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectStatusChanges = void 0;
/**
 * Well Finder — monthly status-change detection.
 *
 * Diffs the two latest monthly snapshots written by `fetchRrcWells` into
 * Firebase Storage at `well-finder/snapshots/wells-YYYY-MM.geojson.gz`.
 * For each well whose `GIS_SYMBOL_DESCRIPTION` changed, classifies the
 * transition and writes one event to Firestore `tx-well-changes`.
 *
 * Change types tracked (V1):
 *   newly_shut_in    — was producing → now shut-in
 *   newly_reactivated — was shut-in → now producing
 *   newly_plugged    — was shut-in → now plugged
 *
 * Other transitions (e.g., permitted → drilled) are ignored as low-value
 * for the reactivation use case.
 *
 * Runs the 3rd of each month, after `fetchRrcWells` has written the
 * current month's snapshot on the 1st.
 */
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
const admin = __importStar(require("firebase-admin"));
const zlib_1 = require("zlib");
const COLLECTION = 'tx-well-changes';
const BATCH_SIZE = 500;
const PRODUCING = new Set(['Oil Well', 'Gas Well', 'Oil/Gas Well']);
const SHUT_IN = new Set(['Shut-In Oil', 'Shut-In Gas']);
const PLUGGED = new Set(['Plugged Oil Well', 'Plugged Gas Well', 'Plugged Oil / Gas']);
function classifyChange(oldStatus, newStatus) {
    if (oldStatus === newStatus)
        return null;
    const wasProducing = PRODUCING.has(oldStatus);
    const wasShutIn = SHUT_IN.has(oldStatus);
    const isShutIn = SHUT_IN.has(newStatus);
    const isProducing = PRODUCING.has(newStatus);
    const isPlugged = PLUGGED.has(newStatus);
    if (wasProducing && isShutIn)
        return 'newly_shut_in';
    if (wasShutIn && isProducing)
        return 'newly_reactivated';
    if (wasShutIn && isPlugged)
        return 'newly_plugged';
    return null;
}
function buildStatusMap(geojsonBytes) {
    const decompressed = (0, zlib_1.gunzipSync)(geojsonBytes);
    const json = JSON.parse(decompressed.toString('utf8'));
    const map = new Map();
    for (const f of json.features) {
        if (f.properties && f.properties.api) {
            map.set(f.properties.api, f.properties.status);
        }
    }
    return map;
}
/** Extract YYYY-MM from a file name like `well-finder/snapshots/wells-2026-05.geojson.gz`. */
function extractSnapshotMonth(name) {
    const m = name.match(/wells-(\d{4}-\d{2})\.geojson\.gz$/);
    return m ? m[1] : null;
}
async function detectChanges() {
    const startedAt = Date.now();
    const bucket = admin.storage().bucket();
    const [files] = await bucket.getFiles({ prefix: 'well-finder/snapshots/wells-' });
    if (files.length < 2) {
        throw new Error(`need at least 2 snapshots, have ${files.length}`);
    }
    const sorted = files.slice().sort((a, b) => a.name.localeCompare(b.name));
    const previous = sorted[sorted.length - 2];
    const latest = sorted[sorted.length - 1];
    const previousMonth = extractSnapshotMonth(previous.name);
    const latestMonth = extractSnapshotMonth(latest.name);
    v2_1.logger.info(`detectStatusChanges: diffing ${previous.name} → ${latest.name}`);
    const [prevBytes] = await previous.download();
    const [latBytes] = await latest.download();
    const prevMap = buildStatusMap(prevBytes);
    const latMap = buildStatusMap(latBytes);
    v2_1.logger.info(`detectStatusChanges: previous ${prevMap.size.toLocaleString()} wells, latest ${latMap.size.toLocaleString()} wells`);
    const db = admin.firestore();
    const detectedAt = Date.now();
    let batch = db.batch();
    let pendingInBatch = 0;
    let totalEvents = 0;
    const histogram = {
        newly_shut_in: 0,
        newly_reactivated: 0,
        newly_plugged: 0,
    };
    for (const [api, newStatus] of latMap) {
        const oldStatus = prevMap.get(api);
        if (!oldStatus)
            continue;
        const changeType = classifyChange(oldStatus, newStatus);
        if (!changeType)
            continue;
        histogram[changeType]++;
        totalEvents++;
        // Doc id = api_changeType_snapshotMonth — guarantees idempotency if we
        // re-run the diff on the same pair of snapshots.
        const docId = `${api}_${changeType}_${latestMonth ?? 'unknown'}`;
        const ref = db.collection(COLLECTION).doc(docId);
        batch.set(ref, {
            api,
            oldStatus,
            newStatus,
            changeType,
            detectedAt,
            snapshotMonth: latestMonth,
            previousSnapshotMonth: previousMonth,
        });
        pendingInBatch++;
        if (pendingInBatch >= BATCH_SIZE) {
            await batch.commit();
            batch = db.batch();
            pendingInBatch = 0;
        }
    }
    if (pendingInBatch > 0) {
        await batch.commit();
    }
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    v2_1.logger.info(`detectStatusChanges: done in ${elapsedSec}s — ${totalEvents.toLocaleString()} events`, histogram);
    return {
        events: totalEvents,
        pairs: { previous: previous.name, latest: latest.name },
    };
}
/** Scheduled monthly status-change diff. */
exports.detectStatusChanges = (0, scheduler_1.onSchedule)({
    schedule: '0 12 3 * *',
    timeZone: 'UTC',
    region: 'us-east1',
    timeoutSeconds: 1800,
    memory: '1GiB',
}, async () => {
    await detectChanges();
});
//# sourceMappingURL=detectStatusChanges.js.map