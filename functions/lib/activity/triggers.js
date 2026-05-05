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
exports.onUserHistoryWrite = exports.onUserWrite = exports.onLeadWrite = exports.onTaskWrite = exports.onJobWrite = exports.onSiteWrite = exports.onDocumentWrite = exports.onContactWrite = exports.onCompanyWrite = void 0;
const admin = __importStar(require("firebase-admin"));
const v2_1 = require("firebase-functions/v2");
const firestore_1 = require("firebase-functions/v2/firestore");
const writeActivity_1 = require("./writeActivity");
const diff_1 = require("./diff");
/** Resolve the action from before/after presence. */
function resolveAction(before, after, resourceType) {
    if (!before && !after)
        return null;
    if (!before)
        return resourceType === 'document' ? 'upload' : 'create';
    if (!after)
        return 'delete';
    return 'update';
}
/** Build a reusable handler for a top-level resource collection. */
function buildHandler(config, idParam) {
    return async (event) => {
        try {
            const before = event.data?.before.exists ? event.data.before.data() : undefined;
            const after = event.data?.after.exists ? event.data.after.data() : undefined;
            const action = resolveAction(before, after, config.type);
            if (!action)
                return;
            const dataForLabel = after ?? before ?? {};
            const label = config.getLabel(dataForLabel);
            const id = String(event.params[idParam]);
            const parent = config.getParent
                ? await Promise.resolve(config.getParent(dataForLabel, event.params))
                : undefined;
            const resource = {
                type: config.type,
                id,
                label,
                ...(parent ? { parentId: parent.id, parentLabel: parent.label } : {}),
            };
            let changedFields;
            let beforeSlice;
            let afterSlice;
            let skip = false;
            if (action === 'update') {
                changedFields = (0, diff_1.diffKeys)(before, after, config.type);
                if (changedFields.length === 0) {
                    skip = true;
                }
                else {
                    beforeSlice = (0, diff_1.pickFields)(before, changedFields);
                    afterSlice = (0, diff_1.pickFields)(after, changedFields);
                }
            }
            await (0, writeActivity_1.writeActivity)({
                eventId: event.id,
                authUid: event.authId ?? null,
                action,
                resource,
                changedFields,
                before: beforeSlice,
                after: afterSlice,
                skip,
            });
        }
        catch (err) {
            v2_1.logger.error('[activity] trigger handler failed', {
                path: event.document,
                eventId: event.id,
                err,
            });
        }
    };
}
// ── Top-level Firestore triggers ───────────────────────────────────────
exports.onCompanyWrite = (0, firestore_1.onDocumentWrittenWithAuthContext)('crm-companies/{companyId}', buildHandler({
    type: 'company',
    getLabel: (d) => String(d.name ?? '(unnamed)'),
}, 'companyId'));
exports.onContactWrite = (0, firestore_1.onDocumentWrittenWithAuthContext)('crm-contacts/{contactId}', buildHandler({
    type: 'contact',
    getLabel: (d) => {
        const first = (d.firstName ?? '');
        const last = (d.lastName ?? '');
        const full = `${first} ${last}`.trim();
        return full || '(unnamed contact)';
    },
    getParent: async (d) => fetchCompanyParent(d.companyId),
}, 'contactId'));
exports.onDocumentWrite = (0, firestore_1.onDocumentWrittenWithAuthContext)('crm-documents/{documentId}', buildHandler({
    type: 'document',
    getLabel: (d) => String(d.name ?? '(unnamed file)'),
    getParent: async (d) => fetchCompanyParent(d.companyId),
}, 'documentId'));
exports.onSiteWrite = (0, firestore_1.onDocumentWrittenWithAuthContext)('sites-registry/{siteId}', buildHandler({
    type: 'site',
    getLabel: (d) => String(d.name ?? '(unnamed site)'),
    getParent: async (d) => fetchCompanyParent(d.companyId),
}, 'siteId'));
exports.onJobWrite = (0, firestore_1.onDocumentWrittenWithAuthContext)('construction-jobs/{jobId}', buildHandler({
    type: 'job',
    getLabel: (d) => String(d.name ?? '(unnamed job)'),
}, 'jobId'));
exports.onTaskWrite = (0, firestore_1.onDocumentWrittenWithAuthContext)('construction-jobs/{jobId}/tasks/{taskId}', buildHandler({
    type: 'task',
    getLabel: (d) => String(d.title ?? '(untitled task)'),
    getParent: async (_d, params) => fetchJobParent(params.jobId),
}, 'taskId'));
exports.onLeadWrite = (0, firestore_1.onDocumentWrittenWithAuthContext)('leads/{leadId}', buildHandler({
    type: 'lead',
    getLabel: (d) => {
        const business = (d.businessName ?? '');
        const dm = (d.decisionMakerName ?? '');
        if (business && dm)
            return `${dm} - ${business}`;
        return business || dm || '(unnamed lead)';
    },
}, 'leadId'));
exports.onUserWrite = (0, firestore_1.onDocumentWrittenWithAuthContext)('users/{userId}', buildHandler({
    type: 'user',
    getLabel: (d) => String(d.email ?? d.displayName ?? '(unknown user)'),
}, 'userId'));
// ── user-history mirror ────────────────────────────────────────────────
// Each entry written to user-history (tool runs from the search-style tools)
// is mirrored as a 'tool-run' activity event. Only listens on creates —
// user-history docs are immutable.
exports.onUserHistoryWrite = (0, firestore_1.onDocumentWrittenWithAuthContext)('user-history/{entryId}', async (event) => {
    try {
        const before = event.data?.before.exists ? event.data.before.data() : undefined;
        const after = event.data?.after.exists ? event.data.after.data() : undefined;
        // Only mirror creates — updates/deletes on user-history are admin-cleanup, not user actions.
        if (before || !after)
            return;
        const userId = String(after.userId ?? '');
        const toolId = String(after.toolId ?? 'unknown');
        const siteName = String(after.siteName ?? '');
        const siteRegistryId = after.siteRegistryId ? String(after.siteRegistryId) : undefined;
        const rawAction = String(after.action ?? '').toLowerCase();
        const isPdfExport = rawAction.includes('pdf') || rawAction.includes('export');
        // Look up actor email (mirror trigger has no event.authId — written by client SDK)
        let email = 'unknown';
        if (userId) {
            const userSnap = await admin.firestore().doc(`users/${userId}`).get();
            const data = userSnap.data();
            email = data?.email ?? email;
        }
        if (isPdfExport) {
            await (0, writeActivity_1.writeActivity)({
                eventId: event.id,
                actor: { uid: userId || 'unknown', email },
                action: 'export',
                resource: {
                    type: 'pdf',
                    id: siteRegistryId ?? event.id,
                    label: 'Site Analysis PDF',
                    ...(siteRegistryId ? { parentId: siteRegistryId, parentLabel: siteName || siteRegistryId } : {}),
                },
            });
            return;
        }
        await (0, writeActivity_1.writeActivity)({
            eventId: event.id,
            actor: { uid: userId || 'unknown', email },
            action: 'tool-run',
            resource: {
                type: 'tool',
                id: toolId,
                label: TOOL_LABELS[toolId] ?? toolId,
                ...(siteRegistryId ? { parentId: siteRegistryId, parentLabel: siteName || siteRegistryId } : {}),
            },
        });
    }
    catch (err) {
        v2_1.logger.error('[activity] user-history mirror failed', { eventId: event.id, err });
    }
});
// ── Lookups ────────────────────────────────────────────────────────────
async function fetchCompanyParent(companyId) {
    if (!companyId || typeof companyId !== 'string')
        return undefined;
    try {
        const snap = await admin.firestore().doc(`crm-companies/${companyId}`).get();
        const name = snap.data()?.name;
        return { id: companyId, label: typeof name === 'string' ? name : companyId };
    }
    catch {
        return { id: companyId, label: companyId };
    }
}
async function fetchJobParent(jobId) {
    if (!jobId)
        return undefined;
    try {
        const snap = await admin.firestore().doc(`construction-jobs/${jobId}`).get();
        const name = snap.data()?.name;
        return { id: jobId, label: typeof name === 'string' ? name : jobId };
    }
    catch {
        return { id: jobId, label: jobId };
    }
}
// Local copy of TOOL_LABELS (functions can't import from src/types).
const TOOL_LABELS = {
    'site-appraiser': 'Site Appraiser',
    'broadband-lookup': 'Broadband Lookup',
    'grid-power-analyzer': 'Grid Power Analyzer',
    'power-calculator': 'Power Calculator',
    'site-analyzer': 'Site Analyzer',
    'water-analysis': 'Water Analysis',
    'gas-analysis': 'Gas Infrastructure Analysis',
    'sales-crm': 'Leads',
    'sales-admin': 'Sales Dashboard',
    'crm': 'Directory',
    'construction-tracker': 'Construction',
    'well-finder': 'Well Finder',
    'piddr': 'Site Analyzer',
};
//# sourceMappingURL=triggers.js.map