/**
 * CRM tools — read from `crm-companies` and `crm-contacts`.
 *
 * Contact ↔ company linkage uses the denormalized `companyIds: string[]`
 * mirror on each contact (maintained by the platform's save layer) so we can
 * use `ARRAY_CONTAINS` queries without scanning affiliations.
 */

import { z } from 'zod';
import { getDoc, runQuery, type FieldFilter } from '../firestore/client';
import type { CompanySummary, ContactSummary, McpEnv } from '../types';

const COMPANY_TAG = z.enum(['REP', 'Construction', 'Pre Construction', 'Utility']);

export const listCompaniesInput = z.object({
  q: z
    .string()
    .optional()
    .describe('Case-insensitive substring match on company name (applied post-query).'),
  tag: COMPANY_TAG.optional(),
  limit: z.number().int().positive().max(200).optional().default(50),
});
export type ListCompaniesArgs = z.infer<typeof listCompaniesInput>;

export async function listCompanies(
  env: McpEnv,
  args: ListCompaniesArgs,
): Promise<{ companies: CompanySummary[] }> {
  const where: FieldFilter[] = [];
  if (args.tag) where.push({ field: 'tags', op: 'ARRAY_CONTAINS', value: args.tag });

  const fetchLimit = args.q ? 200 : args.limit;
  const docs = await runQuery(env, {
    collection: 'crm-companies',
    where,
    orderBy: [{ field: 'updatedAt', direction: 'DESCENDING' }],
    limit: fetchLimit,
  });

  let companies: CompanySummary[] = docs.map((d) => ({
    id: d.id,
    name: (d.data.name as string) ?? '',
    location: d.data.location as string | undefined,
    website: d.data.website as string | undefined,
    tags: (d.data.tags as string[]) ?? [],
    updatedAt: (d.data.updatedAt as number) ?? 0,
  }));

  if (args.q) {
    const needle = args.q.toLowerCase();
    companies = companies.filter((c) => c.name.toLowerCase().includes(needle)).slice(0, args.limit);
  }
  return { companies };
}

export const getCompanyInput = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/, 'id must be a plain Firestore document id'),
});
export type GetCompanyArgs = z.infer<typeof getCompanyInput>;

export async function getCompany(
  env: McpEnv,
  args: GetCompanyArgs,
): Promise<{ company: Record<string, unknown>; contacts: Array<Record<string, unknown>> } | null> {
  const company = await getDoc(env, 'crm-companies', args.id);
  if (!company) return null;
  const contacts = await runQuery(env, {
    collection: 'crm-contacts',
    where: [{ field: 'companyIds', op: 'ARRAY_CONTAINS', value: args.id }],
    orderBy: [{ field: 'updatedAt', direction: 'DESCENDING' }],
    limit: 200,
  });
  return {
    company: { id: company.id, ...company.data },
    contacts: contacts.map((c) => ({ id: c.id, ...c.data })),
  };
}

export const listContactsInput = z.object({
  companyId: z.string().optional(),
  q: z
    .string()
    .optional()
    .describe('Case-insensitive substring match on name or email (applied post-query).'),
  limit: z.number().int().positive().max(200).optional().default(50),
});
export type ListContactsArgs = z.infer<typeof listContactsInput>;

export async function listContacts(
  env: McpEnv,
  args: ListContactsArgs,
): Promise<{ contacts: ContactSummary[] }> {
  const where: FieldFilter[] = [];
  if (args.companyId) {
    where.push({ field: 'companyIds', op: 'ARRAY_CONTAINS', value: args.companyId });
  }

  const fetchLimit = args.q ? 200 : args.limit;
  const docs = await runQuery(env, {
    collection: 'crm-contacts',
    where,
    orderBy: [{ field: 'updatedAt', direction: 'DESCENDING' }],
    limit: fetchLimit,
  });

  let contacts: ContactSummary[] = docs.map((d) => ({
    id: d.id,
    firstName: (d.data.firstName as string) ?? '',
    lastName: (d.data.lastName as string) ?? '',
    email: d.data.email as string | undefined,
    phone: d.data.phone as string | undefined,
    companyIds: (d.data.companyIds as string[]) ?? [],
    affiliations:
      (d.data.affiliations as Array<{ companyId: string; title?: string; isPrimary?: boolean }>) ??
      [],
    updatedAt: (d.data.updatedAt as number) ?? 0,
  }));

  if (args.q) {
    const needle = args.q.toLowerCase();
    contacts = contacts
      .filter(
        (c) =>
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(needle) ||
          (c.email ?? '').toLowerCase().includes(needle),
      )
      .slice(0, args.limit);
  }
  return { contacts };
}
