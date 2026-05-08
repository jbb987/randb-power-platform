"use strict";
/**
 * Daily federal-bills ingest for Political Radar.
 *
 * Pulls the current Congress's bills + joint resolutions from Congress.gov,
 * filters by the two-stage threat keyword classifier, and upserts every
 * match into the `political-radar-tracked-bills` Firestore collection. The
 * client-side Political Radar federal layer reads from that collection — no
 * live Congress.gov call from the browser, no API key in the bundle.
 *
 * Cadence: daily at 06:00 UTC.
 *
 * First run paginates the entire current congress (~30 s for ~10K bills,
 * 250 per page, ~40 paginated requests). Subsequent runs use Congress.gov's
 * `fromDateTime` parameter to fetch only bills with action since the last
 * successful run; meta state lives in `political-radar-meta/billsRefresh`.
 */
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
exports.refreshFederalBills = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const keywords_1 = require("./keywords");
const CONGRESS_API_KEY = (0, params_1.defineSecret)('CONGRESS_API_KEY');
const CURRENT_CONGRESS = 119; // Jan 2025 – Jan 2027. Bump in early Jan 2027.
const PAGE_SIZE = 250; // Congress.gov v3 max
const PAGE_DELAY_MS = 100; // be polite, stay well under 5K req/hr quota
const TRACKED_COLLECTION = 'political-radar-tracked-bills';
const META_DOC = 'political-radar-meta/billsRefresh';
/** Bill types we ingest. Joint resolutions can become law just like bills. */
const BILL_TYPES = ['hr', 's', 'hjres', 'sjres'];
function classifyStatus(actionText) {
    if (!actionText)
        return 'Introduced';
    const t = actionText.toLowerCase();
    if (t.includes('became public law') || t.includes('signed by president'))
        return 'Enacted';
    if (t.includes('vetoed'))
        return 'Vetoed';
    if (t.includes('passed senate') || t.includes('passed house') || t.includes('passed/agreed'))
        return 'Passed Chamber';
    if (t.includes('committee') || t.includes('referred to'))
        return 'Committee';
    if (t.includes('introduced'))
        return 'Introduced';
    return 'In Progress';
}
function buildHumanUrl(b) {
    const type = (b.type ?? '').toLowerCase();
    return `https://www.congress.gov/bill/${b.congress}th-congress/${type}-bill/${b.number}`;
}
function billDocId(b) {
    const type = (b.type ?? '').toUpperCase();
    return `${type}-${b.number}-${b.congress}`;
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
/**
 * Fetch one page of bills from /v3/bill/{congress}/{billType}.
 *
 * fromDateTime narrows to bills with action since that ISO timestamp. Omit
 * for the initial backfill (returns all bills in the congress).
 */
async function fetchBillPage(apiKey, billType, offset, fromDateTime) {
    const params = new URLSearchParams({
        api_key: apiKey,
        limit: String(PAGE_SIZE),
        offset: String(offset),
        sort: 'updateDate+desc',
        format: 'json',
    });
    if (fromDateTime)
        params.set('fromDateTime', fromDateTime);
    const url = `https://api.congress.gov/v3/bill/${CURRENT_CONGRESS}/${billType}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Congress.gov ${billType} ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json());
}
async function fetchAllForType(apiKey, billType, fromDateTime) {
    const all = [];
    let offset = 0;
    while (true) {
        const resp = await fetchBillPage(apiKey, billType, offset, fromDateTime);
        const rows = resp.bills ?? [];
        all.push(...rows);
        if (rows.length < PAGE_SIZE)
            break;
        offset += PAGE_SIZE;
        // Hard cap — defensive. The 119th Congress will not exceed 50K bills.
        if (offset > 50_000) {
            v2_1.logger.warn(`refreshFederalBills: hit 50K offset cap on ${billType}, stopping`);
            break;
        }
        await sleep(PAGE_DELAY_MS);
    }
    return all;
}
exports.refreshFederalBills = (0, scheduler_1.onSchedule)({
    schedule: '0 6 * * *', // every day 06:00 UTC
    timeZone: 'UTC',
    region: 'us-east1',
    timeoutSeconds: 540, // 9 min — full backfill comfortably fits
    memory: '512MiB',
    secrets: [CONGRESS_API_KEY],
}, async () => {
    const startedAt = Date.now();
    const db = admin.firestore();
    const apiKey = CONGRESS_API_KEY.value();
    if (!apiKey) {
        v2_1.logger.error('refreshFederalBills: CONGRESS_API_KEY secret is empty');
        return;
    }
    // Read meta to decide between full backfill and incremental refresh.
    const metaRef = db.doc(META_DOC);
    const metaSnap = await metaRef.get();
    const meta = metaSnap.exists ? metaSnap.data() : {};
    const fromDateTime = meta.lastRunAt
        ? new Date(meta.lastRunAt - 24 * 60 * 60 * 1000).toISOString().replace('.000Z', 'Z')
        : null;
    const mode = fromDateTime ? `incremental (since ${fromDateTime})` : 'full backfill';
    v2_1.logger.info(`refreshFederalBills: starting ${mode}`);
    // Fan out across bill types — small enough to do sequentially with a
    // short delay between types. Errors per-type don't poison the whole run.
    const allRows = [];
    for (const t of BILL_TYPES) {
        try {
            const rows = await fetchAllForType(apiKey, t, fromDateTime);
            v2_1.logger.info(`refreshFederalBills: pulled ${rows.length} ${t} rows`);
            allRows.push(...rows);
        }
        catch (err) {
            v2_1.logger.warn(`refreshFederalBills: ${t} fetch failed`, err);
        }
        await sleep(PAGE_DELAY_MS);
    }
    // Filter and upsert. Use batched writes — Firestore caps batches at 500
    // ops, so we chunk. Number of matches per cycle is small in steady state
    // (bills rarely qualify), but the first backfill could see hundreds.
    const matches = [];
    for (const b of allRows) {
        if (!b.title)
            continue;
        const m = (0, keywords_1.classifyTitle)(b.title);
        if (!m.matched)
            continue;
        matches.push({
            congress: b.congress ?? CURRENT_CONGRESS,
            type: (b.type ?? '').toUpperCase(),
            number: String(b.number ?? ''),
            title: b.title,
            status: classifyStatus(b.latestAction?.text),
            latestActionDate: b.latestAction?.actionDate ?? null,
            latestActionText: b.latestAction?.text ?? null,
            url: buildHumanUrl(b),
            matchReason: m.reason,
            updatedAt: Date.now(),
        });
    }
    const CHUNK = 400;
    let written = 0;
    for (let i = 0; i < matches.length; i += CHUNK) {
        const slice = matches.slice(i, i + CHUNK);
        const batch = db.batch();
        for (const doc of slice) {
            const id = `${doc.type}-${doc.number}-${doc.congress}`;
            batch.set(db.collection(TRACKED_COLLECTION).doc(id), doc, { merge: true });
        }
        await batch.commit();
        written += slice.length;
    }
    await metaRef.set({
        lastRunAt: Date.now(),
        mode,
        rowsPulled: allRows.length,
        rowsMatched: matches.length,
        durationMs: Date.now() - startedAt,
    }, { merge: true });
    v2_1.logger.info(`refreshFederalBills: ${mode} complete — pulled ${allRows.length}, matched ${written}, ${Math.round((Date.now() - startedAt) / 1000)}s`);
});
//# sourceMappingURL=refreshFederalBills.js.map