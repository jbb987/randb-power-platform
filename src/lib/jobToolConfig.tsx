import { createContext, useContext, type ReactNode } from 'react';
import type { ToolId } from '../types';

/** Runtime configuration for a Construction-Tracker-style tool. The same React
 *  component tree (index/new/detail + components, hooks, lib) drives multiple
 *  tools (Bailey Project, Construction Projects, …); the difference between
 *  them is which Firestore collection and Storage paths they read/write. */
export interface JobToolConfig {
  /** Top-level Firestore collection for jobs. Sub-collections (tasks, photos,
   *  documents) live under each job doc and reuse this collection name. */
  jobsCollection: string;
  /** Storage prefix for photo blobs: `${photosStoragePrefix}/{jobId}/{id}-full.jpg`. */
  photosStoragePrefix: string;
  /** Storage prefix for document blobs: `${docsStoragePrefix}/{jobId}/{id}-{name}`. */
  docsStoragePrefix: string;
  /** ToolId for auth/permission checks. */
  toolId: ToolId;
  /** Route base, no trailing slash (e.g. `/construction-tracker`). */
  routeBase: string;
  /** Display label (used in headers/empty states). */
  label: string;
}

/** Bailey's tool — kept on the original collection/paths so the CEO's existing
 *  data is preserved as-is. */
export const BAILEY_PROJECT_CONFIG: JobToolConfig = {
  jobsCollection: 'construction-jobs',
  photosStoragePrefix: 'construction-photos',
  docsStoragePrefix: 'construction-documents',
  toolId: 'construction-tracker',
  routeBase: '/construction-tracker',
  label: 'Bailey Project',
};

/** The fresh duplicate for the construction team — new, empty collection and
 *  separate Storage prefixes so the two tools never collide. */
export const CONSTRUCTION_PROJECTS_CONFIG: JobToolConfig = {
  jobsCollection: 'construction-projects-jobs',
  photosStoragePrefix: 'construction-projects-photos',
  docsStoragePrefix: 'construction-projects-documents',
  toolId: 'construction-projects',
  routeBase: '/construction-projects',
  label: 'Construction Projects',
};

const JobToolConfigContext = createContext<JobToolConfig | null>(null);

export function JobToolConfigProvider({
  config,
  children,
}: {
  config: JobToolConfig;
  children: ReactNode;
}) {
  return <JobToolConfigContext.Provider value={config}>{children}</JobToolConfigContext.Provider>;
}

/** Read the active tool's config. Falls back to Bailey's config when called
 *  outside a provider — needed by global components like Breadcrumb that
 *  conditionally render based on URL but always run their hooks. The fallback
 *  is safe because consumers in this code path always pass `undefined` for the
 *  id when they're off the tool's route, so no subscription is ever opened. */
export function useJobToolConfig(): JobToolConfig {
  const ctx = useContext(JobToolConfigContext);
  return ctx ?? BAILEY_PROJECT_CONFIG;
}
