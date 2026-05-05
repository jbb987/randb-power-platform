import type { ActivityResource } from '../types/activity';

/**
 * Map an activity resource to the in-app URL where the user can view it.
 * Returns null if the resource has no canonical view (e.g. deleted, system events).
 */
export function resourceUrl(resource: ActivityResource): string | null {
  switch (resource.type) {
    case 'company':
      return `/crm/companies/${resource.id}`;
    case 'contact':
      return `/crm/people/${resource.id}`;
    case 'document':
      // Document detail lives inside the company page
      return resource.parentId ? `/crm/companies/${resource.parentId}` : null;
    case 'site':
      return `/site-analyzer/${resource.id}`;
    case 'job':
      return `/construction-tracker/${resource.id}`;
    case 'task':
      // Tasks live inside the parent job page
      return resource.parentId ? `/construction-tracker/${resource.parentId}` : null;
    case 'lead':
      return `/sales-crm`;
    case 'user':
      return `/user-management`;
    case 'tool':
      return toolPath(resource.id);
    case 'session':
    case 'pdf':
      return null;
    default:
      return null;
  }
}

function toolPath(toolId: string): string | null {
  const map: Record<string, string> = {
    'site-analyzer':       '/site-analyzer',
    'site-appraiser':      '/site-appraiser',
    'power-calculator':    '/power-calculator',
    'grid-power-analyzer': '/grid-power-analyzer',
    'water-analysis':      '/water-analysis',
    'gas-analysis':        '/gas-analysis',
    'broadband-lookup':    '/broadband-lookup',
    'sales-crm':           '/sales-crm',
    'sales-admin':         '/sales-admin',
    'crm':                 '/crm',
    'construction-tracker':'/construction-tracker',
    'well-finder':         '/well-finder',
    'piddr':               '/site-analyzer',
  };
  return map[toolId] ?? null;
}
