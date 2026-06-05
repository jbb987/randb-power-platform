/**
 * Large Load Request (LLR) tools — read from the `preconstruction-sites`
 * Firestore collection. (Collection name kept as `preconstruction-sites` from
 * the tool's prior name "Pre-Construction"; renamed to LLR on 2026-05-27,
 * code-level naming preserved for data-safety.)
 */

import { z } from 'zod';
import { getDoc, runQuery, type FieldFilter } from '../firestore/client';
import type { LlrSummary, McpEnv } from '../types';

const UTILITY = z.enum(['oncor', 'aep', 'coop', 'other']);
const GRADE = z.enum(['GO', 'CONDITIONAL_GO', 'NO_GO']);

export const listLlrsInput = z.object({
  utility: UTILITY.optional(),
  grade: GRADE.optional(),
  limit: z.number().int().positive().max(200).optional().default(50),
});
export type ListLlrsArgs = z.infer<typeof listLlrsInput>;

export async function listLlrs(env: McpEnv, args: ListLlrsArgs): Promise<{ llrs: LlrSummary[] }> {
  const where: FieldFilter[] = [];
  if (args.utility) where.push({ field: 'utility', op: 'EQUAL', value: args.utility });
  if (args.grade) where.push({ field: 'grade', op: 'EQUAL', value: args.grade });

  const docs = await runQuery(env, {
    collection: 'preconstruction-sites',
    where,
    orderBy: [{ field: 'updatedAt', direction: 'DESCENDING' }],
    limit: args.limit,
  });

  return { llrs: docs.map((d) => normalize(d.id, d.data)) };
}

export const getLlrInput = z.object({ id: z.string() });
export type GetLlrArgs = z.infer<typeof getLlrInput>;

export async function getLlr(
  env: McpEnv,
  args: GetLlrArgs,
): Promise<Record<string, unknown> | null> {
  const doc = await getDoc(env, 'preconstruction-sites', args.id);
  return doc ? { id: doc.id, ...doc.data } : null;
}

function normalize(id: string, d: Record<string, unknown>): LlrSummary {
  return {
    id,
    name: (d.name as string) ?? '',
    companyId: (d.companyId as string) ?? '',
    coordinates: (d.coordinates as { lat: number; lng: number }) ?? { lat: 0, lng: 0 },
    siteRegistryId: (d.siteRegistryId as string) ?? '',
    grade: d.grade as string | undefined,
    loaStatus: (d.loaStatus as string) ?? '',
    utility: d.utility as string | undefined,
    updatedAt: (d.updatedAt as number) ?? 0,
  };
}
