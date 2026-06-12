import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import {
  onDocumentWrittenWithAuthContext,
  type FirestoreAuthEvent,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { writeActivity } from './writeActivity';
import { diffKeys, pickFields } from './diff';
import type { ActivityAction, ActivityResource, ActivityResourceType } from './types';

// ── Helpers ────────────────────────────────────────────────────────────

type WriteEvent<P extends Record<string, string>> = FirestoreAuthEvent<
  Change<DocumentSnapshot> | undefined,
  P
>;

interface ResourceConfig<P extends Record<string, string> = Record<string, string>> {
  type: ActivityResourceType;
  /** Build the human label for the resource from doc data. */
  getLabel: (data: Record<string, unknown>) => string;
  /** Optional parent reference (e.g. company for documents/contacts, job for tasks). */
  getParent?: (
    data: Record<string, unknown>,
    params: P,
  ) =>
    | Promise<{ id: string; label: string } | undefined>
    | { id: string; label: string }
    | undefined;
}

/** Resolve the action from before/after presence. */
function resolveAction(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  resourceType: ActivityResourceType,
): ActivityAction | null {
  if (!before && !after) return null;
  if (!before) return resourceType === 'document' ? 'upload' : 'create';
  if (!after) return 'delete';
  return 'update';
}

/** Build a reusable handler for a top-level resource collection. */
function buildHandler<P extends Record<string, string>>(
  config: ResourceConfig<P>,
  idParam: keyof P,
): (event: WriteEvent<P>) => Promise<void> {
  return async (event) => {
    try {
      const before = event.data?.before.exists ? event.data.before.data() : undefined;
      const after = event.data?.after.exists ? event.data.after.data() : undefined;
      const action = resolveAction(before, after, config.type);
      if (!action) return;

      const dataForLabel = after ?? before ?? {};
      const label = config.getLabel(dataForLabel);
      const id = String(event.params[idParam]);

      const parent = config.getParent
        ? await Promise.resolve(config.getParent(dataForLabel, event.params))
        : undefined;

      const resource: ActivityResource = {
        type: config.type,
        id,
        label,
        ...(parent ? { parentId: parent.id, parentLabel: parent.label } : {}),
      };

      let changedFields: string[] | undefined;
      let beforeSlice: Record<string, unknown> | undefined;
      let afterSlice: Record<string, unknown> | undefined;
      let skip = false;

      if (action === 'update') {
        changedFields = diffKeys(before, after, config.type);
        if (changedFields.length === 0) {
          skip = true;
        } else {
          beforeSlice = pickFields(before, changedFields);
          afterSlice = pickFields(after, changedFields);
        }
      }

      await writeActivity({
        eventId: event.id,
        authUid: event.authId ?? null,
        action,
        resource,
        changedFields,
        before: beforeSlice,
        after: afterSlice,
        skip,
      });
    } catch (err) {
      logger.error('[activity] trigger handler failed', {
        path: event.document,
        eventId: event.id,
        err,
      });
    }
  };
}

// ── Top-level Firestore triggers ───────────────────────────────────────

export const onCompanyWrite = onDocumentWrittenWithAuthContext(
  'crm-companies/{companyId}',
  buildHandler<{ companyId: string }>(
    {
      type: 'company',
      getLabel: (d) => String(d.name ?? '(unnamed)'),
    },
    'companyId',
  ),
);

export const onContactWrite = onDocumentWrittenWithAuthContext(
  'crm-contacts/{contactId}',
  buildHandler<{ contactId: string }>(
    {
      type: 'contact',
      getLabel: (d) => {
        const first = (d.firstName ?? '') as string;
        const last = (d.lastName ?? '') as string;
        const full = `${first} ${last}`.trim();
        return full || '(unnamed person)';
      },
      getParent: async (d) => fetchCompanyParent(d.companyId),
    },
    'contactId',
  ),
);

export const onDocumentWrite = onDocumentWrittenWithAuthContext(
  'crm-documents/{documentId}',
  buildHandler<{ documentId: string }>(
    {
      type: 'document',
      getLabel: (d) => String(d.name ?? '(unnamed file)'),
      getParent: async (d) => fetchCompanyParent(d.companyId),
    },
    'documentId',
  ),
);

export const onSiteWrite = onDocumentWrittenWithAuthContext(
  'sites-registry/{siteId}',
  buildHandler<{ siteId: string }>(
    {
      type: 'site',
      getLabel: (d) => String(d.name ?? '(unnamed site)'),
      getParent: async (d) => fetchCompanyParent(d.companyId),
    },
    'siteId',
  ),
);

export const onPreConSiteWrite = onDocumentWrittenWithAuthContext(
  'preconstruction-sites/{siteId}',
  buildHandler<{ siteId: string }>(
    {
      type: 'precon-site',
      getLabel: (d) => String(d.name ?? '(unnamed pre-con site)'),
      getParent: async (d) => fetchCompanyParent(d.companyId),
    },
    'siteId',
  ),
);

export const onJobWrite = onDocumentWrittenWithAuthContext(
  'construction-jobs/{jobId}',
  buildHandler<{ jobId: string }>(
    {
      type: 'job',
      getLabel: (d) => String(d.name ?? '(unnamed project)'),
    },
    'jobId',
  ),
);

export const onTaskWrite = onDocumentWrittenWithAuthContext(
  'construction-jobs/{jobId}/tasks/{taskId}',
  buildHandler<{ jobId: string; taskId: string }>(
    {
      type: 'task',
      getLabel: (d) => String(d.title ?? '(untitled task)'),
      getParent: async (_d, params) => fetchJobParent('construction-jobs', params.jobId),
    },
    'taskId',
  ),
);

export const onConstructionProjectsJobWrite = onDocumentWrittenWithAuthContext(
  'construction-projects-jobs/{jobId}',
  buildHandler<{ jobId: string }>(
    {
      type: 'job',
      getLabel: (d) => String(d.name ?? '(unnamed project)'),
    },
    'jobId',
  ),
);

export const onConstructionProjectsTaskWrite = onDocumentWrittenWithAuthContext(
  'construction-projects-jobs/{jobId}/tasks/{taskId}',
  buildHandler<{ jobId: string; taskId: string }>(
    {
      type: 'task',
      getLabel: (d) => String(d.title ?? '(untitled task)'),
      getParent: async (_d, params) => fetchJobParent('construction-projects-jobs', params.jobId),
    },
    'taskId',
  ),
);

// Job documents live in a sub-collection per job. The UI now supports
// rename + soft-archive/restore (updateDoc), so these writes need an audit
// trail like every other resource. type:'document' makes creates log as
// 'upload'; parent is the owning job.
export const onJobDocumentWrite = onDocumentWrittenWithAuthContext(
  'construction-jobs/{jobId}/documents/{documentId}',
  buildHandler<{ jobId: string; documentId: string }>(
    {
      type: 'document',
      getLabel: (d) => String(d.name ?? '(unnamed file)'),
      getParent: async (_d, params) => fetchJobParent('construction-jobs', params.jobId),
    },
    'documentId',
  ),
);

export const onConstructionProjectsDocumentWrite = onDocumentWrittenWithAuthContext(
  'construction-projects-jobs/{jobId}/documents/{documentId}',
  buildHandler<{ jobId: string; documentId: string }>(
    {
      type: 'document',
      getLabel: (d) => String(d.name ?? '(unnamed file)'),
      getParent: async (_d, params) => fetchJobParent('construction-projects-jobs', params.jobId),
    },
    'documentId',
  ),
);

// Collaborative to-do list (collection name kept from its per-user era).
// Audit trail matters here since v1.61.0: anyone can edit/assign/complete a
// company-visible task, so "who reassigned this?" must be answerable.
// PRIVATE tasks are excluded entirely: the activity collection is
// admin-readable, and private-task content (title, notes) must never be
// visible beyond creator + assignee. Absent visibility (legacy docs) counts
// as private — same default as the client and the Firestore rule.
const userTaskHandler = buildHandler<{ taskId: string }>(
  {
    type: 'user-task',
    getLabel: (d) => String(d.title ?? '(untitled task)'),
  },
  'taskId',
);

export const onUserTaskWrite = onDocumentWrittenWithAuthContext(
  'user-tasks/{taskId}',
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() : undefined;
    const after = event.data?.after.exists ? event.data.after.data() : undefined;
    const effective = (after ?? before) as Record<string, unknown> | undefined;
    if ((effective?.visibility ?? 'private') !== 'company') return;
    await userTaskHandler(event);
  },
);

export const onLeadWrite = onDocumentWrittenWithAuthContext(
  'leads/{leadId}',
  buildHandler<{ leadId: string }>(
    {
      type: 'lead',
      getLabel: (d) => {
        const business = (d.businessName ?? '') as string;
        const dm = (d.decisionMakerName ?? '') as string;
        if (business && dm) return `${dm} - ${business}`;
        return business || dm || '(unnamed lead)';
      },
    },
    'leadId',
  ),
);

export const onUserWrite = onDocumentWrittenWithAuthContext(
  'users/{userId}',
  buildHandler<{ userId: string }>(
    {
      type: 'user',
      getLabel: (d) => String(d.email ?? d.displayName ?? '(unknown user)'),
    },
    'userId',
  ),
);

// ── user-history mirror ────────────────────────────────────────────────
// Each entry written to user-history (tool runs from the search-style tools)
// is mirrored as a 'tool-run' activity event. Only listens on creates —
// user-history docs are immutable.

export const onUserHistoryWrite = onDocumentWrittenWithAuthContext(
  'user-history/{entryId}',
  async (event) => {
    try {
      const before = event.data?.before.exists ? event.data.before.data() : undefined;
      const after = event.data?.after.exists ? event.data.after.data() : undefined;
      // Only mirror creates — updates/deletes on user-history are admin-cleanup, not user actions.
      if (before || !after) return;

      const userId = String(after.userId ?? '');
      const toolId = String(after.toolId ?? 'unknown');
      const siteName = String(after.siteName ?? '');
      const siteRegistryId = after.siteRegistryId ? String(after.siteRegistryId) : undefined;
      const rawAction = String(after.action ?? '').toLowerCase();
      const kind = String(after.kind ?? '').toLowerCase(); // explicit action kind: login | view | tool-run | export

      // Client-attached session fingerprint (ip / userAgent / timezone) — best-effort.
      const sessionRaw = (after.session ?? {}) as Record<string, unknown>;
      const session = {
        ip: typeof sessionRaw.ip === 'string' ? sessionRaw.ip : undefined,
        userAgent: typeof sessionRaw.userAgent === 'string' ? sessionRaw.userAgent : undefined,
        timezone: typeof sessionRaw.timezone === 'string' ? sessionRaw.timezone : undefined,
      };

      // Look up actor email (mirror trigger has no event.authId — written by client SDK)
      let email = 'unknown';
      if (userId) {
        const userSnap = await admin.firestore().doc(`users/${userId}`).get();
        const data = userSnap.data();
        email = (data?.email as string | undefined) ?? email;
      }
      const actor = { uid: userId || 'unknown', email };

      // ── login event ─────────────────────────────────────────────────
      if (kind === 'login') {
        await writeActivity({
          eventId: event.id,
          actor,
          action: 'login',
          resource: { type: 'session', id: userId || event.id, label: email },
          session,
        });
        return;
      }

      // ── view event (tool-open or detail-page open) ──────────────────
      if (kind === 'view') {
        const routePath = String(after.routePath ?? toolId);
        const routeLabel = String(after.routeLabel ?? TOOL_LABELS[toolId] ?? routePath);
        const resourceType =
          after.viewResourceType && typeof after.viewResourceType === 'string'
            ? (after.viewResourceType as ActivityResourceType)
            : 'route';
        const resourceId = String(after.viewResourceId ?? routePath);
        const resourceLabel = String(after.viewResourceLabel ?? routeLabel);
        await writeActivity({
          eventId: event.id,
          actor,
          action: 'view',
          resource: { type: resourceType, id: resourceId, label: resourceLabel },
          session,
        });
        return;
      }

      // ── PDF export (legacy heuristic on `action` field) ─────────────
      const isPdfExport = rawAction.includes('pdf') || rawAction.includes('export');
      if (isPdfExport) {
        await writeActivity({
          eventId: event.id,
          actor,
          action: 'export',
          resource: {
            type: 'pdf',
            id: siteRegistryId ?? event.id,
            label: 'Site Analysis PDF',
            ...(siteRegistryId
              ? { parentId: siteRegistryId, parentLabel: siteName || siteRegistryId }
              : {}),
          },
          session,
        });
        return;
      }

      // ── tool-run (default) ──────────────────────────────────────────
      await writeActivity({
        eventId: event.id,
        actor,
        action: 'tool-run',
        resource: {
          type: 'tool',
          id: toolId,
          label: TOOL_LABELS[toolId] ?? toolId,
          ...(siteRegistryId
            ? { parentId: siteRegistryId, parentLabel: siteName || siteRegistryId }
            : {}),
        },
        session,
      });
    } catch (err) {
      logger.error('[activity] user-history mirror failed', { eventId: event.id, err });
    }
  },
);

// ── Lookups ────────────────────────────────────────────────────────────

async function fetchCompanyParent(
  companyId: unknown,
): Promise<{ id: string; label: string } | undefined> {
  if (!companyId || typeof companyId !== 'string') return undefined;
  try {
    const snap = await admin.firestore().doc(`crm-companies/${companyId}`).get();
    const name = snap.data()?.name;
    return { id: companyId, label: typeof name === 'string' ? name : companyId };
  } catch {
    return { id: companyId, label: companyId };
  }
}

async function fetchJobParent(
  collection: string,
  jobId: string,
): Promise<{ id: string; label: string } | undefined> {
  if (!jobId) return undefined;
  try {
    const snap = await admin.firestore().doc(`${collection}/${jobId}`).get();
    const name = snap.data()?.name;
    return { id: jobId, label: typeof name === 'string' ? name : jobId };
  } catch {
    return { id: jobId, label: jobId };
  }
}

// Local copy of TOOL_LABELS (functions can't import from src/types).
const TOOL_LABELS: Record<string, string> = {
  'site-appraiser': 'Site Appraiser',
  'broadband-lookup': 'Broadband Lookup',
  'grid-power-analyzer': 'Grid Power Analyzer',
  'power-calculator': 'Power Calculator',
  'site-analyzer': 'Site Analyzer',
  'water-analysis': 'Water Analysis',
  'gas-analysis': 'Gas Infrastructure Analysis',
  'sales-crm': 'Leads',
  'sales-admin': 'Sales Dashboard',
  crm: 'Directory',
  'construction-tracker': 'Bailey Project',
  'construction-projects': 'Construction Projects',
  'well-finder': 'Well Finder',
  piddr: 'Site Analyzer',
};
