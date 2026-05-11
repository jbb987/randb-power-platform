import type { ToolId } from '../types';

interface RouteInfo {
  toolId: ToolId;
  label: string;
  /**
   * True when the route is a detail page that owns its own view-logging
   * (so Layout should skip and let the page emit a resource-tagged entry).
   */
  isDetailRoute?: boolean;
}

/**
 * Maps a pathname to the owning tool + a human label for activity tracking.
 * Returns null for routes we don't want to log (login screen, redirects).
 */
export function describeRoute(pathname: string): RouteInfo | null {
  // Strip trailing slash for matching (but root "/" stays "/")
  const p = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  if (p === '/login') return null;

  if (p === '/') return { toolId: 'site-analyzer', label: 'Dashboard' };

  if (p === '/crm') return { toolId: 'crm', label: 'CRM Directory' };
  if (p.startsWith('/crm/companies/'))
    return { toolId: 'crm', label: 'CRM Company detail', isDetailRoute: true };
  if (p.startsWith('/crm/people/'))
    return { toolId: 'crm', label: 'CRM Contact detail', isDetailRoute: true };

  if (p === '/site-analyzer') return { toolId: 'site-analyzer', label: 'Site Analyzer' };
  if (p === '/site-analyzer/new')
    return { toolId: 'site-analyzer', label: 'Site Analyzer — new' };
  if (p.startsWith('/site-analyzer/'))
    return { toolId: 'site-analyzer', label: 'Site Analyzer — site', isDetailRoute: true };

  if (p === '/grid-power-analyzer')
    return { toolId: 'grid-power-analyzer', label: 'Grid Power Analyzer' };

  if (p === '/sales-crm') return { toolId: 'sales-crm', label: 'Leads' };
  if (p === '/sales-admin') return { toolId: 'sales-admin', label: 'Sales Dashboard' };

  if (p === '/construction-tracker')
    return { toolId: 'construction-tracker', label: 'Construction Projects' };
  if (p === '/construction-tracker/new')
    return { toolId: 'construction-tracker', label: 'Construction Projects — new project' };
  if (p.startsWith('/construction-tracker/'))
    return {
      toolId: 'construction-tracker',
      label: 'Construction Projects — project detail',
      isDetailRoute: true,
    };

  if (p === '/well-finder') return { toolId: 'well-finder', label: 'Well Finder' };
  if (p === '/documents') return { toolId: 'documents', label: 'Documents' };

  // Admin pages — bucket under site-analyzer for ToolId, but the label is what's shown.
  if (p === '/user-management') return { toolId: 'site-analyzer', label: 'User Management' };
  if (p === '/admin/activity') return { toolId: 'site-analyzer', label: 'Activity Log' };

  return null;
}

/**
 * Returns true if this view should be logged now (and stamps the dedup map).
 * Same user + same route within 60 s is treated as one view.
 */
const lastViewed = new Map<string, number>();
const DEBOUNCE_MS = 60_000;

export function shouldLogView(userId: string, pathname: string): boolean {
  const key = `${userId}::${pathname}`;
  const now = Date.now();
  const last = lastViewed.get(key) ?? 0;
  if (now - last < DEBOUNCE_MS) return false;
  lastViewed.set(key, now);
  return true;
}
