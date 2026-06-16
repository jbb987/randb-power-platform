"use strict";
/**
 * On-demand mobile-number reveal for the Leads tool ("Grab number" button).
 *
 * Apollo only delivers mobile numbers ASYNCHRONOUSLY to a public HTTPS webhook
 * (there is no synchronous phone API). The platform is the one place that can
 * host that webhook, so the flow is:
 *
 *   1. rep clicks "Grab number"  → client calls the `revealLeadPhone` callable
 *   2. revealLeadPhone           → POST Apollo /people/match { reveal_phone_number:true,
 *                                  webhook_url } ; stores request_id, sets mobileStatus='pending'
 *   3. Apollo (seconds later)    → POSTs the phone to `apolloPhoneWebhook`
 *   4. apolloPhoneWebhook        → writes lead.mobilePhone + mobileStatus='revealed'
 *   5. client's real-time leads listener renders the number
 *
 * Just-in-time: one reveal per click, so we never spend a credit on a lead nobody calls.
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
exports.apolloPhoneWebhook = exports.revealLeadPhone = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const APOLLO_API_KEY = (0, params_1.defineSecret)('APOLLO_API_KEY');
// Shared secret echoed in the webhook URL's ?token= and validated on callback,
// so a random POST can't inject a fake number.
const APOLLO_WEBHOOK_TOKEN = (0, params_1.defineSecret)('APOLLO_WEBHOOK_TOKEN');
// The deployed apolloPhoneWebhook URL. Default targets this project's stable
// cloudfunctions.net alias; override via functions params if the project changes.
const APOLLO_WEBHOOK_BASE_URL = (0, params_1.defineString)('APOLLO_WEBHOOK_BASE_URL', {
    default: 'https://us-central1-randb-site-valuator.cloudfunctions.net/apolloPhoneWebhook',
});
const APOLLO_MATCH_URL = 'https://api.apollo.io/api/v1/people/match';
const REGION = 'us-central1';
/** Walk an arbitrary JSON payload and collect every {raw_number|sanitized_number} object. */
function collectPhones(node, out = []) {
    if (!node || typeof node !== 'object')
        return out;
    if (Array.isArray(node)) {
        for (const item of node)
            collectPhones(item, out);
        return out;
    }
    const obj = node;
    if (typeof obj.sanitized_number === 'string' || typeof obj.raw_number === 'string') {
        out.push(obj);
    }
    for (const v of Object.values(obj))
        collectPhones(v, out);
    return out;
}
/** Prefer a mobile number; fall back to the first valid number found. */
function pickBestPhone(phones) {
    if (phones.length === 0)
        return null;
    const mobile = phones.find((p) => (p.type ?? '').toLowerCase().includes('mobile'));
    const chosen = mobile ?? phones[0];
    return chosen.sanitized_number || chosen.raw_number || null;
}
function domainFromWebsite(website) {
    if (!website)
        return undefined;
    return website
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/^www\./, '')
        .trim() || undefined;
}
/**
 * Callable: kick off an async Apollo phone reveal for one lead.
 * Caller must be the assigned rep or an admin (one Apollo credit is spent).
 */
exports.revealLeadPhone = (0, https_1.onCall)({ secrets: [APOLLO_API_KEY, APOLLO_WEBHOOK_TOKEN], region: REGION }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const leadId = request.data?.leadId?.trim();
    if (!leadId)
        throw new https_1.HttpsError('invalid-argument', 'leadId is required.');
    const db = admin.firestore();
    const ref = db.collection('leads').doc(leadId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new https_1.HttpsError('not-found', 'Lead not found.');
    const lead = snap.data();
    // Authorize: assigned rep or admin only.
    const isAssigned = lead.assignedTo === request.auth.uid;
    if (!isAssigned) {
        const u = await db.collection('users').doc(request.auth.uid).get();
        if (!(u.exists && u.data()?.role === 'admin')) {
            throw new https_1.HttpsError('permission-denied', 'This lead is not assigned to you.');
        }
    }
    if (lead.mobileStatus === 'revealed' && lead.mobilePhone) {
        return { ok: true, alreadyRevealed: true };
    }
    // Identify the person to Apollo: prefer the stored person id, else email, else name+domain.
    const matchBody = { reveal_phone_number: true };
    if (lead.apolloPersonId)
        matchBody.id = lead.apolloPersonId;
    else if (lead.email)
        matchBody.email = lead.email;
    else {
        if (lead.decisionMakerName)
            matchBody.name = lead.decisionMakerName;
        const domain = domainFromWebsite(lead.website);
        if (domain)
            matchBody.domain = domain;
    }
    if (!matchBody.id && !matchBody.email && !matchBody.name) {
        throw new https_1.HttpsError('failed-precondition', 'Lead has no Apollo id, email, or decision-maker name to look up.');
    }
    const webhookUrl = `${APOLLO_WEBHOOK_BASE_URL.value()}` +
        `?token=${encodeURIComponent(APOLLO_WEBHOOK_TOKEN.value())}` +
        `&leadId=${encodeURIComponent(leadId)}`;
    matchBody.webhook_url = webhookUrl;
    let resp;
    try {
        resp = await fetch(APOLLO_MATCH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'X-Api-Key': APOLLO_API_KEY.value(),
            },
            body: JSON.stringify(matchBody),
        });
    }
    catch (err) {
        v2_1.logger.error('[revealLeadPhone] network error', err);
        await ref.update({ mobileStatus: 'failed', updatedAt: Date.now() });
        throw new https_1.HttpsError('unavailable', 'Could not reach Apollo.');
    }
    if (!resp.ok) {
        const text = await resp.text();
        v2_1.logger.error('[revealLeadPhone] Apollo error', { status: resp.status, body: text.slice(0, 300) });
        await ref.update({ mobileStatus: 'failed', updatedAt: Date.now() });
        throw new https_1.HttpsError('internal', `Apollo returned ${resp.status}.`);
    }
    const data = (await resp.json());
    const requestId = data.request_id != null ? String(data.request_id) : null;
    const update = {
        mobileStatus: 'pending',
        phoneRequestId: requestId,
        updatedAt: Date.now(),
    };
    // Opportunistically backfill the work email if the lead didn't have one.
    if (!lead.email && data.person?.email)
        update.email = data.person.email;
    await ref.update(update);
    return { ok: true, requestId };
});
/**
 * HTTP webhook: Apollo POSTs the revealed phone here (async, seconds later).
 * We correlate by the ?leadId= we put in the webhook URL (request_id as fallback),
 * validate the shared ?token=, write the number, and stay idempotent on retries.
 */
exports.apolloPhoneWebhook = (0, https_1.onRequest)({ secrets: [APOLLO_WEBHOOK_TOKEN], region: REGION, cors: false }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    if (req.query.token !== APOLLO_WEBHOOK_TOKEN.value()) {
        res.status(403).send('Forbidden');
        return;
    }
    const db = admin.firestore();
    const body = (req.body ?? {});
    const leadId = typeof req.query.leadId === 'string' ? req.query.leadId : undefined;
    // Resolve the target lead: leadId from the URL first, else by stored request_id.
    let ref = null;
    if (leadId) {
        ref = db.collection('leads').doc(leadId);
    }
    else {
        const reqId = body.request_id != null ? String(body.request_id) : null;
        if (reqId) {
            const q = await db.collection('leads').where('phoneRequestId', '==', reqId).limit(1).get();
            if (!q.empty)
                ref = q.docs[0].ref;
        }
    }
    if (!ref) {
        res.status(200).send('ok (no correlation)');
        return;
    }
    const snap = await ref.get();
    if (!snap.exists) {
        res.status(200).send('ok (lead gone)');
        return;
    }
    if (snap.data()?.mobileStatus === 'revealed') {
        res.status(200).send('ok (already revealed)'); // idempotent on Apollo retries
        return;
    }
    const mobile = pickBestPhone(collectPhones(body));
    await ref.update(mobile
        ? { mobilePhone: mobile, mobileStatus: 'revealed', updatedAt: Date.now() }
        : { mobileStatus: 'failed', updatedAt: Date.now() });
    res.status(200).send('ok');
});
//# sourceMappingURL=phone.js.map