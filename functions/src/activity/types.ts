import type { Timestamp } from 'firebase-admin/firestore';

export type ActivityAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'upload'
  | 'tool-run'
  | 'login'
  | 'view'
  | 'export';

export type ActivityResourceType =
  | 'company'
  | 'contact'
  | 'document'
  | 'site'
  | 'job'
  | 'task'
  | 'lead'
  | 'user'
  | 'tool'
  | 'session'
  | 'route'
  | 'pdf';

export interface ActivitySession {
  ip?: string;
  userAgent?: string;
  timezone?: string;
}

export interface ActivityActor {
  uid: string;
  email: string;
}

export interface ActivityResource {
  type: ActivityResourceType;
  id: string;
  label: string;
  parentId?: string;
  parentLabel?: string;
}

export interface ActivityEntry {
  id: string;
  timestamp: Timestamp;
  actor: ActivityActor;
  action: ActivityAction;
  resource: ActivityResource;
  changedFields?: string[];
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  summary: string;
  eventId?: string;
  session?: ActivitySession;
}

export const SYSTEM_ACTOR: ActivityActor = {
  uid: 'system',
  email: 'system@randb',
};

/** Fields that should never appear in a diff — bookkeeping/timestamp/derived. */
export const COMMON_IGNORED_FIELDS = new Set<string>(['updatedAt', 'createdAt', 'lastModifiedAt']);

/** Per-resource ignore lists, merged with COMMON_IGNORED_FIELDS. */
export const RESOURCE_IGNORED_FIELDS: Partial<Record<ActivityResourceType, Set<string>>> = {
  site: new Set([
    // Heavy analysis blobs — captured as separate `tool-run` entries via user-history mirror
    'appraisalResult',
    'infraResult',
    'broadbandResult',
    'transportResult',
    'waterResult',
    'gasResult',
    'laborResult',
    'piddrGeneratedAt',
    'lastAnalyzedAt',
  ]),
  user: new Set(['activityLastSeenAt', 'lastLoginAt', 'lastSeenAt']),
};
