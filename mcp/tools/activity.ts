/**
 * Activity log tool — read from the `activity` Firestore collection.
 * Each entry uses Firestore Timestamp on the `timestamp` field (newer
 * activity entries differ from `createdAt: number` used elsewhere).
 */

import { z } from 'zod';
import { runQuery, type FieldFilter } from '../firestore/client';
import type { McpEnv } from '../types';

const RESOURCE_TYPE = z.enum([
  'company',
  'contact',
  'document',
  'site',
  'job',
  'task',
  'lead',
  'user',
  'tool',
  'session',
  'route',
  'pdf',
]);

export const getRecentActivityInput = z.object({
  actorEmail: z.string().optional(),
  resourceType: RESOURCE_TYPE.optional(),
  limit: z.number().int().positive().max(200).optional().default(50),
});
export type GetRecentActivityArgs = z.infer<typeof getRecentActivityInput>;

export async function getRecentActivity(
  env: McpEnv,
  args: GetRecentActivityArgs,
): Promise<{ entries: Array<Record<string, unknown>> }> {
  const where: FieldFilter[] = [];
  if (args.actorEmail) where.push({ field: 'actor.email', op: 'EQUAL', value: args.actorEmail });
  if (args.resourceType)
    where.push({ field: 'resource.type', op: 'EQUAL', value: args.resourceType });

  const docs = await runQuery(env, {
    collection: 'activity',
    where,
    orderBy: [{ field: 'timestamp', direction: 'DESCENDING' }],
    limit: args.limit,
  });

  return { entries: docs.map((d) => ({ id: d.id, ...d.data })) };
}
