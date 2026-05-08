"use strict";
/**
 * Weekly federal-officials ingest for Political Radar.
 *
 * Pulls every member of the current Congress from Congress.gov and stores
 * one record per person in `political-radar-federal-officials`, keyed by
 * Bioguide ID. Each record carries name, party, state, district (House
 * only), phone number, and official website URL.
 *
 * Cadence: weekly Sunday at 06:00 UTC. Senate composition turns over every
 * 2 years; House every 2 years; mid-cycle changes (deaths, resignations,
 * special elections) are sparse — weekly is overkill in steady state but
 * costs nothing and catches them without operator intervention.
 *
 * Volume: 535 members. The list endpoint returns the basics in one call;
 * the per-member detail call (for phone + website) is 535 sequential
 * requests at ~200ms each → ~2 minutes. We sleep 100ms between calls to
 * stay under the 5K req/hr quota.
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
exports.refreshFederalOfficials = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const CONGRESS_API_KEY = (0, params_1.defineSecret)('CONGRESS_API_KEY');
const CURRENT_CONGRESS = 119;
const PAGE_SIZE = 250;
const PAGE_DELAY_MS = 100;
const OFFICIALS_COLLECTION = 'political-radar-federal-officials';
const META_DOC = 'political-radar-meta/officialsRefresh';
const STATE_NAME_TO_USPS = {
    Alabama: 'AL',
    Alaska: 'AK',
    Arizona: 'AZ',
    Arkansas: 'AR',
    California: 'CA',
    Colorado: 'CO',
    Connecticut: 'CT',
    Delaware: 'DE',
    'District of Columbia': 'DC',
    Florida: 'FL',
    Georgia: 'GA',
    Hawaii: 'HI',
    Idaho: 'ID',
    Illinois: 'IL',
    Indiana: 'IN',
    Iowa: 'IA',
    Kansas: 'KS',
    Kentucky: 'KY',
    Louisiana: 'LA',
    Maine: 'ME',
    Maryland: 'MD',
    Massachusetts: 'MA',
    Michigan: 'MI',
    Minnesota: 'MN',
    Mississippi: 'MS',
    Missouri: 'MO',
    Montana: 'MT',
    Nebraska: 'NE',
    Nevada: 'NV',
    'New Hampshire': 'NH',
    'New Jersey': 'NJ',
    'New Mexico': 'NM',
    'New York': 'NY',
    'North Carolina': 'NC',
    'North Dakota': 'ND',
    Ohio: 'OH',
    Oklahoma: 'OK',
    Oregon: 'OR',
    Pennsylvania: 'PA',
    'Rhode Island': 'RI',
    'South Carolina': 'SC',
    'South Dakota': 'SD',
    Tennessee: 'TN',
    Texas: 'TX',
    Utah: 'UT',
    Vermont: 'VT',
    Virginia: 'VA',
    Washington: 'WA',
    'West Virginia': 'WV',
    Wisconsin: 'WI',
    Wyoming: 'WY',
};
function mapParty(name) {
    if (!name)
        return null;
    const lower = name.toLowerCase();
    if (lower.startsWith('republic'))
        return 'R';
    if (lower.startsWith('democrat'))
        return 'D';
    if (lower.startsWith('independent'))
        return 'I';
    return 'Other';
}
function inferChamber(district) {
    return district === null || district === undefined ? 'senate' : 'house';
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function fetchAllMembers(apiKey) {
    const all = [];
    let offset = 0;
    while (true) {
        const url = `https://api.congress.gov/v3/member/congress/${CURRENT_CONGRESS}` +
            `?api_key=${apiKey}&limit=${PAGE_SIZE}&offset=${offset}&format=json`;
        const res = await fetch(url);
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`Congress.gov member list ${res.status}: ${body.slice(0, 200)}`);
        }
        const data = (await res.json());
        const rows = data.members ?? [];
        all.push(...rows);
        if (rows.length < PAGE_SIZE)
            break;
        offset += PAGE_SIZE;
        if (offset > 1000)
            break; // 535 members; defensive cap
        await sleep(PAGE_DELAY_MS);
    }
    return all;
}
async function fetchDetail(apiKey, bioguideId) {
    try {
        const url = `https://api.congress.gov/v3/member/${bioguideId}?api_key=${apiKey}&format=json`;
        const res = await fetch(url);
        if (!res.ok)
            return { phone: null, url: null, party: null };
        const data = (await res.json());
        const m = data.member;
        return {
            phone: m?.addressInformation?.phoneNumber ?? null,
            url: m?.officialWebsiteUrl ?? null,
            party: m?.partyHistory?.[m.partyHistory.length - 1]?.partyName ?? null,
        };
    }
    catch {
        return { phone: null, url: null, party: null };
    }
}
exports.refreshFederalOfficials = (0, scheduler_1.onSchedule)({
    schedule: '0 6 * * 0', // Sundays 06:00 UTC
    timeZone: 'UTC',
    region: 'us-east1',
    timeoutSeconds: 540, // ~2 min normal, headroom for retries
    memory: '512MiB',
    secrets: [CONGRESS_API_KEY],
}, async () => {
    const startedAt = Date.now();
    const db = admin.firestore();
    const apiKey = CONGRESS_API_KEY.value();
    if (!apiKey) {
        v2_1.logger.error('refreshFederalOfficials: CONGRESS_API_KEY secret is empty');
        return;
    }
    v2_1.logger.info('refreshFederalOfficials: starting full member refresh');
    let members;
    try {
        members = await fetchAllMembers(apiKey);
    }
    catch (err) {
        v2_1.logger.error('refreshFederalOfficials: list fetch failed', err);
        return;
    }
    v2_1.logger.info(`refreshFederalOfficials: list returned ${members.length} members`);
    // Build docs. Detail calls are sequential with a short delay — the rate
    // limit is 5K/hr; 535 calls at 100 ms ≈ 1 min wall-clock and ~10% of
    // hourly quota.
    const docs = [];
    for (const m of members) {
        if (!m.bioguideId)
            continue;
        const stateUsps = STATE_NAME_TO_USPS[m.state ?? ''] ?? '';
        if (!stateUsps)
            continue;
        const detail = await fetchDetail(apiKey, m.bioguideId);
        const chamber = inferChamber(m.district);
        const district = chamber === 'house'
            ? String(m.district ?? '').replace(/^0+/, '') || 'AL'
            : undefined;
        docs.push({
            bioguideId: m.bioguideId,
            name: m.name ?? '',
            party: mapParty(detail.party ?? m.partyName),
            chamber,
            stateUsps,
            district,
            phone: detail.phone,
            url: detail.url ?? m.url ?? null,
            congress: CURRENT_CONGRESS,
            updatedAt: Date.now(),
        });
        await sleep(PAGE_DELAY_MS);
    }
    // Batched upsert — 535 / 400 ≈ 2 batches.
    const CHUNK = 400;
    for (let i = 0; i < docs.length; i += CHUNK) {
        const slice = docs.slice(i, i + CHUNK);
        const batch = db.batch();
        for (const d of slice) {
            batch.set(db.collection(OFFICIALS_COLLECTION).doc(d.bioguideId), d, { merge: true });
        }
        await batch.commit();
    }
    await db.doc(META_DOC).set({
        lastRunAt: Date.now(),
        memberCount: docs.length,
        durationMs: Date.now() - startedAt,
    }, { merge: true });
    v2_1.logger.info(`refreshFederalOfficials: wrote ${docs.length} members in ${Math.round((Date.now() - startedAt) / 1000)}s`);
});
//# sourceMappingURL=refreshFederalOfficials.js.map