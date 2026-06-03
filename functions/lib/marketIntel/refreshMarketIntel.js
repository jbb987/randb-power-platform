"use strict";
/**
 * Market-Intelligence listener — Layer 1 of the data-center deal database.
 *
 * Scheduled job (every 6h) that pulls data-center-deal news from free US sources
 * (GDELT + trade-press RSS + Google News RSS), filters by a topic+event keyword
 * classifier, tags each item with light regex hints (state / MW / $), dedupes by
 * canonical-URL hash, and upserts into the `market-intel-feed` Firestore
 * collection. The client reads that collection as a browsable feed — no external
 * call from the browser, no API key in the bundle.
 *
 * Capture-only: stores the article (title/url/source/date/summary + light tags).
 * It does NOT do LLM structured extraction, entity resolution, or land/deed
 * lookup — those are later phases.
 *
 * Modeled on `politicalRadar/refreshFederalBills.ts` (same onSchedule + batched
 * deterministic-id upsert + meta-doc last-run pattern).
 *
 * Idempotent: doc id = sha256(normalized URL). User-set `status` (read/archived)
 * is written only by the client and is deliberately never included in the ingest
 * payload, so re-ingesting the same URL never resets it.
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
exports.refreshMarketIntel = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
const admin = __importStar(require("firebase-admin"));
const gdelt_1 = require("./sources/gdelt");
const rss_1 = require("./sources/rss");
const googleNews_1 = require("./sources/googleNews");
const keywords_1 = require("./keywords");
const util_1 = require("./util");
const FEED_COLLECTION = 'market-intel-feed';
const META_DOC = 'market-intel-meta/feedRefresh';
exports.refreshMarketIntel = (0, scheduler_1.onSchedule)({
    schedule: '0 */6 * * *', // every 6 hours
    timeZone: 'UTC',
    region: 'us-east1',
    timeoutSeconds: 300,
    memory: '512MiB',
}, async () => {
    const startedAt = Date.now();
    const db = admin.firestore();
    const now = Date.now();
    const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // bound collection growth / re-writes
    const oldestAllowed = now - MAX_AGE_MS;
    // First run pulls a wider GDELT window; steady-state covers the gap since the
    // last run (every 6h → 2d is comfortable slack). RSS/Google News aren't
    // windowable — they always return their full recent feed; the idempotent
    // merge-upsert dedups the re-seen items, and MAX_AGE_MS bounds what's kept.
    const metaRef = db.doc(META_DOC);
    const metaSnap = await metaRef.get();
    const meta = metaSnap.exists ? metaSnap.data() : {};
    const isBackfill = !meta.lastRunAt;
    const gdeltTimespan = isBackfill ? '7d' : '2d';
    v2_1.logger.info(`refreshMarketIntel: starting ${isBackfill ? 'backfill' : 'incremental'} (gdelt=${gdeltTimespan})`);
    // Fan out across sources in parallel — they're independent hosts with no
    // shared quota, so there's no reason to serialize them (unlike the
    // single-API paginators in Political Radar). allSettled keeps one source's
    // failure from poisoning the run.
    const sources = [
        { name: 'gdelt', fn: () => (0, gdelt_1.fetchGdelt)(gdeltTimespan) },
        { name: 'rss', fn: () => (0, rss_1.fetchRss)() },
        { name: 'google-news', fn: () => (0, googleNews_1.fetchGoogleNews)() },
    ];
    const settled = await Promise.allSettled(sources.map((s) => s.fn()));
    const counts = {};
    const emptySources = [];
    const raw = [];
    settled.forEach((res, i) => {
        const { name } = sources[i];
        if (res.status === 'fulfilled') {
            counts[name] = res.value.length;
            raw.push(...res.value);
            if (res.value.length === 0)
                emptySources.push(name);
            v2_1.logger.info(`refreshMarketIntel: ${name} returned ${res.value.length}`);
        }
        else {
            counts[name] = 0;
            emptySources.push(name);
            v2_1.logger.warn(`refreshMarketIntel: ${name} failed`, res.reason);
        }
    });
    // Surface a quietly-dead feed (e.g. a rotted RSS URL) instead of failing open.
    if (emptySources.length) {
        v2_1.logger.warn(`refreshMarketIntel: empty/failed sources: ${emptySources.join(', ')}`);
    }
    // Filter → tag → dedup. Collapse same-URL items within this run via a Map
    // (a Firestore batch can't write the same doc id twice).
    const del = admin.firestore.FieldValue.delete();
    const byId = new Map();
    let kept = 0;
    for (const item of raw) {
        if (!Number.isFinite(item.publishedAt) || item.publishedAt < oldestAllowed)
            continue;
        const haystack = `${item.title} ${item.summary ?? ''}`;
        const match = (0, keywords_1.isDataCenterDeal)(haystack);
        if (!match.matched)
            continue;
        const normUrl = (0, util_1.normalizeUrl)(item.url);
        const id = (0, util_1.urlHash)(normUrl);
        const tags = (0, keywords_1.extractLightTags)(haystack);
        // Optional fields are written explicitly — value when present, FieldValue
        // .delete() when absent — so a re-ingest can CORRECT or downgrade a stale
        // tag. (With bare omission, merge:true would keep a wrong tag forever.)
        // `status` is intentionally NOT written here, preserving the client-set
        // read/archived state across re-ingests.
        const doc = {
            title: item.title,
            url: normUrl,
            source: item.source,
            sourceName: item.sourceName,
            publishedAt: item.publishedAt,
            ingestedAt: now,
            titleKey: (0, util_1.titleKey)(item.title),
            matchReason: match.reason,
            updatedAt: now,
            summary: item.summary ?? del,
            imageUrl: item.imageUrl ?? del,
            usState: tags.usState ?? del,
            mwMentioned: tags.mwMentioned ?? del,
            dollarsMentioned: tags.dollarsMentioned ?? del,
        };
        byId.set(id, doc);
        kept++;
    }
    // Batched upsert, chunked under Firestore's 500-op cap. `merge: true` makes
    // re-ingest idempotent and never clobbers the client-set status field.
    const entries = [...byId.entries()];
    const CHUNK = 400;
    for (let i = 0; i < entries.length; i += CHUNK) {
        const slice = entries.slice(i, i + CHUNK);
        const batch = db.batch();
        for (const [id, doc] of slice) {
            batch.set(db.collection(FEED_COLLECTION).doc(id), doc, { merge: true });
        }
        await batch.commit();
    }
    await metaRef.set({
        lastRunAt: now,
        mode: isBackfill ? 'backfill' : 'incremental',
        sourceCounts: counts,
        emptySources,
        itemsPulled: raw.length,
        itemsKept: kept,
        itemsWritten: byId.size,
        durationMs: Date.now() - startedAt,
    }, { merge: true });
    v2_1.logger.info(`refreshMarketIntel: done — pulled ${raw.length}, kept ${kept}, wrote ${byId.size}, ${Math.round((Date.now() - startedAt) / 1000)}s`);
});
//# sourceMappingURL=refreshMarketIntel.js.map