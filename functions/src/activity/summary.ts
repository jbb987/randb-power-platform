import type { ActivityAction, ActivityResource } from './types';

const ACTION_VERB: Record<ActivityAction, string> = {
  create:     'created',
  update:     'edited',
  delete:     'deleted',
  upload:     'uploaded',
  'tool-run': 'ran',
  login:      'signed in',
  export:     'exported',
};

const RESOURCE_NOUN: Record<string, string> = {
  company:  'company',
  contact:  'contact',
  document: 'document',
  site:     'site',
  job:      'construction job',
  task:     'task',
  lead:     'lead',
  user:     'user',
  tool:     'tool',
  session:  'session',
  pdf:      'PDF',
};

export interface SummaryArgs {
  actorEmail: string;
  action: ActivityAction;
  resource: ActivityResource;
  changedFields?: string[];
}

/** Renders a short human sentence for the activity row. */
export function buildSummary({ actorEmail, action, resource, changedFields }: SummaryArgs): string {
  const who = actorName(actorEmail);
  const verb = ACTION_VERB[action];
  const noun = RESOURCE_NOUN[resource.type] ?? resource.type;

  if (action === 'login') {
    return `${who} signed in`;
  }
  if (action === 'tool-run') {
    const onSite = resource.parentLabel ? ` on ${resource.parentLabel}` : '';
    return `${who} ran ${resource.label}${onSite}`;
  }
  if (action === 'export') {
    const onSite = resource.parentLabel ? ` for ${resource.parentLabel}` : '';
    return `${who} exported ${noun}${onSite}`;
  }
  if (action === 'upload') {
    const onParent = resource.parentLabel ? ` on ${resource.parentLabel}` : '';
    return `${who} uploaded ${resource.label}${onParent}`;
  }

  const parent = resource.parentLabel ? ` (${resource.parentLabel})` : '';
  const name = resource.label || '(unnamed)';

  if (action === 'create') {
    return `${who} created ${noun} ${name}${parent}`;
  }
  if (action === 'delete') {
    return `${who} deleted ${noun} ${name}${parent}`;
  }
  // update
  const fieldHint =
    changedFields && changedFields.length > 0
      ? ` — ${changedFields.slice(0, 3).join(', ')}${changedFields.length > 3 ? '…' : ''}`
      : '';
  return `${who} ${verb} ${noun} ${name}${parent}${fieldHint}`;
}

function actorName(email: string): string {
  if (email === 'system@randb') return 'System';
  // "pierre@randb.com" → "pierre"
  const local = email.split('@')[0] ?? email;
  return local.charAt(0).toUpperCase() + local.slice(1);
}
