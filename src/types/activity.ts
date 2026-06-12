import type { Timestamp } from 'firebase/firestore';

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
  | 'user-task'
  | 'lead'
  | 'user'
  | 'tool'
  | 'session'
  | 'route'
  | 'pdf';

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

export interface ActivitySession {
  ip?: string;
  userAgent?: string;
  timezone?: string;
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

export const ACTIVITY_ACTIONS: ActivityAction[] = [
  'create',
  'update',
  'delete',
  'upload',
  'tool-run',
  'login',
  'view',
  'export',
];

export const ACTIVITY_ACTION_LABELS: Record<ActivityAction, string> = {
  create: 'Created',
  update: 'Edited',
  delete: 'Deleted',
  upload: 'Uploaded',
  'tool-run': 'Ran',
  login: 'Signed in',
  view: 'Opened',
  export: 'Exported',
};

export const ACTIVITY_RESOURCE_TYPES: ActivityResourceType[] = [
  'company',
  'contact',
  'document',
  'site',
  'job',
  'task',
  'user-task',
  'lead',
  'user',
  'tool',
  'session',
  'route',
  'pdf',
];

export const ACTIVITY_RESOURCE_LABELS: Record<ActivityResourceType, string> = {
  company: 'Company',
  contact: 'Contact',
  document: 'Document',
  site: 'Site',
  job: 'Construction Job',
  task: 'Task',
  'user-task': 'To-Do',
  lead: 'Lead',
  user: 'User',
  tool: 'Tool',
  session: 'Session',
  route: 'Page',
  pdf: 'PDF',
};

export const SYSTEM_ACTOR: ActivityActor = {
  uid: 'system',
  email: 'system@randb',
};
