/**
 * Site Analyzer tools — read from the `sites-registry` Firestore collection.
 *
 * `list_sites` returns lightweight summaries; `get_site` fetches the full
 * record but lets the caller project which analysis sections to include
 * (the full entry can exceed 50KB with all 7 analyses + land comps).
 */

import { z } from 'zod';
import { getDoc, runQuery, type FieldFilter } from '../firestore/client';
import type { McpEnv, SiteSummary } from '../types';

export const listSitesInput = z.object({
  filter: z
    .string()
    .optional()
    .describe('Case-insensitive substring match on site name (applied post-query).'),
  companyId: z.string().optional().describe('Restrict to sites linked to this CRM company id.'),
  limit: z.number().int().positive().max(200).optional().default(50),
});
export type ListSitesArgs = z.infer<typeof listSitesInput>;

export async function listSites(
  env: McpEnv,
  args: ListSitesArgs,
): Promise<{ sites: SiteSummary[] }> {
  const where: FieldFilter[] = [];
  if (args.companyId) where.push({ field: 'companyId', op: 'EQUAL', value: args.companyId });

  // If we're going to substring-filter, fetch a wider window so the filter has
  // enough material to work with; otherwise rely on the requested limit.
  const fetchLimit = args.filter ? 200 : args.limit;

  const docs = await runQuery(env, {
    collection: 'sites-registry',
    where,
    orderBy: [{ field: 'updatedAt', direction: 'DESCENDING' }],
    limit: fetchLimit,
  });

  let sites = docs.map((d) => normalize(d.id, d.data));
  if (args.filter) {
    const needle = args.filter.toLowerCase();
    sites = sites.filter((s) => s.name.toLowerCase().includes(needle));
    sites = sites.slice(0, args.limit);
  }
  return { sites };
}

const SECTION = z.enum([
  'overview',
  'power',
  'water',
  'gas',
  'broadband',
  'transport',
  'labor',
  'political',
  'appraisal',
]);

export const getSiteInput = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/, 'id must be a plain Firestore document id'),
  sections: z
    .array(SECTION)
    .optional()
    .describe(
      'Which analysis sections to include. Default: overview + appraisal only. Full entry can exceed 50KB.',
    ),
});
export type GetSiteArgs = z.infer<typeof getSiteInput>;

export async function getSite(
  env: McpEnv,
  args: GetSiteArgs,
): Promise<Record<string, unknown> | null> {
  const doc = await getDoc(env, 'sites-registry', args.id);
  if (!doc) return null;
  const sections = new Set(args.sections ?? ['overview', 'appraisal']);
  const d = doc.data;

  const projected: Record<string, unknown> = {
    id: doc.id,
    name: d.name,
    address: d.address,
    coordinates: d.coordinates,
    acreage: d.acreage,
    mwCapacity: d.mwCapacity,
    dollarPerAcreLow: d.dollarPerAcreLow,
    dollarPerAcreHigh: d.dollarPerAcreHigh,
    companyId: d.companyId,
    detectedState: d.detectedState,
    county: d.county,
    parcelId: d.parcelId,
    priorUsage: d.priorUsage,
    legalDescription: d.legalDescription,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
  if (sections.has('appraisal')) projected.appraisalResult = d.appraisalResult;
  if (sections.has('power')) projected.infraResult = d.infraResult;
  if (sections.has('water')) projected.waterResult = d.waterResult;
  if (sections.has('gas')) projected.gasResult = d.gasResult;
  if (sections.has('broadband')) projected.broadbandResult = d.broadbandResult;
  if (sections.has('transport')) projected.transportResult = d.transportResult;
  if (sections.has('labor')) projected.laborResult = d.laborResult;
  if (sections.has('political')) projected.politicalResult = d.politicalResult;
  return projected;
}

function normalize(id: string, d: Record<string, unknown>): SiteSummary {
  return {
    id,
    name: (d.name as string) ?? '',
    address: d.address as string | undefined,
    coordinates: (d.coordinates as { lat: number; lng: number } | null) ?? null,
    acreage: (d.acreage as number) ?? 0,
    mwCapacity: (d.mwCapacity as number) ?? 0,
    companyId: d.companyId as string | undefined,
    detectedState: d.detectedState as string | undefined,
    lastAnalyzedAt: (d.piddrGeneratedAt as number | null) ?? null,
    updatedAt: (d.updatedAt as number) ?? 0,
  };
}
