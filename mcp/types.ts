/**
 * Narrowed output shapes returned by MCP tools.
 *
 * These deliberately do NOT import from `src/types/` — the Worker bundle is
 * separate from the React app and importing React-coupled types would pull
 * `firebase/firestore` (and friends) into the Worker. We mirror only the
 * fields each tool surfaces; the full canonical shapes live in
 * `src/types/index.ts` (SiteRegistryEntry, PreConSite, Company, Contact)
 * and `src/types/activity.ts` (ActivityEntry).
 */

export interface SiteSummary {
  id: string;
  name: string;
  address?: string;
  coordinates: { lat: number; lng: number } | null;
  acreage: number;
  mwCapacity: number;
  companyId?: string;
  detectedState?: string;
  lastAnalyzedAt: number | null;
  updatedAt: number;
}

export interface LlrSummary {
  id: string;
  name: string;
  companyId: string;
  coordinates: { lat: number; lng: number };
  siteRegistryId: string;
  grade?: string;
  loaStatus: string;
  utility?: string;
  updatedAt: number;
}

export interface CompanySummary {
  id: string;
  name: string;
  location?: string;
  website?: string;
  tags: string[];
  updatedAt: number;
}

export interface ContactSummary {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  companyIds: string[];
  affiliations: Array<{ companyId: string; title?: string; isPrimary?: boolean }>;
  updatedAt: number;
}

export interface McpEnv {
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  FIREBASE_PROJECT_ID?: string;
  MCP_BEARER_TOKEN: string;
}
