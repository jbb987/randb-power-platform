// TODO: Replace with real implementation from site-registry branch
// This is a temporary stub so that SiteSelector integrations compile.
// The real hook will fetch saved sites from Firestore.

import type { SiteSelectorSite } from '../components/SiteSelector';

export function useSiteRegistry(): { sites: SiteSelectorSite[]; loading: boolean } {
  return { sites: [], loading: false };
}
