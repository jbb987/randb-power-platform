/**
 * MCP server factory.
 *
 * Builds an `McpServer` and registers the 8 read-only tools. The transport
 * adapter in `./transport.ts` connects this server to a per-request
 * `WebStandardStreamableHTTPServerTransport` from the SDK.
 *
 * Tool input schemas are zod v4 `z.object(...)` instances; we pass the raw
 * `.shape` to `registerTool` (the SDK's `ZodRawShapeCompat` type). The SDK
 * handles the JSON-Schema conversion for `tools/list` and validates
 * arguments against the schema before invoking the callback.
 *
 * Each callback wraps the tool handler in try/catch and returns
 * `{ content: [...], isError: true }` on failure — per MCP spec, execution
 * errors belong in the result, not in the JSON-RPC envelope, so the LLM
 * sees them and can react.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';

import { getRecentActivity, getRecentActivityInput } from './tools/activity';
import {
  getCompany,
  getCompanyInput,
  listCompanies,
  listCompaniesInput,
  listContacts,
  listContactsInput,
} from './tools/crm';
import { getLlr, getLlrInput, listLlrs, listLlrsInput } from './tools/llrs';
import { getSite, getSiteInput, listSites, listSitesInput } from './tools/sites';
import type { McpEnv } from './types';

type AnyToolSchema = z.ZodObject<z.ZodRawShape>;

export function createMcpServer(env: McpEnv): McpServer {
  const server = new McpServer({
    name: 'randb-power-platform',
    version: '1.52.1',
  });

  const register = <S extends AnyToolSchema>(
    name: string,
    description: string,
    inputSchema: S,
    handler: (env: McpEnv, args: z.infer<S>) => Promise<unknown>,
  ): void => {
    server.registerTool(
      name,
      { description, inputSchema: inputSchema.shape },
      async (args: unknown) => {
        try {
          const result = await handler(env, args as z.infer<S>);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { content: [{ type: 'text', text: msg }], isError: true };
        }
      },
    );
  };

  register(
    'list_sites',
    'List analyzed sites from the Site Analyzer registry. Filter by free-text name substring or company id. Returns lightweight summaries (id, name, coordinates, acreage, MW capacity, company link, last analyzed timestamp).',
    listSitesInput,
    listSites,
  );

  register(
    'get_site',
    'Get a full Site Analyzer entry by id. Use `sections` to choose which analysis sections to include (full entry can exceed 50KB). Default sections: overview + appraisal. Available: overview, appraisal, power, water, gas, broadband, transport, labor, political.',
    getSiteInput,
    getSite,
  );

  register(
    'list_llrs',
    'List Large Load Request (LLR) sites — utility-facing pre-construction requests. Filter by utility (oncor/aep/coop/other) and grade (GO/CONDITIONAL_GO/NO_GO). Returns id, name, coordinates, MW, grade, LOA status, utility, linked siteRegistryId.',
    listLlrsInput,
    listLlrs,
  );

  register(
    'get_llr',
    'Get a full LLR record by id. Includes appraisal grade + auto-suggested grade, assigned engineer, engineer-verified MW, LOA timeline (steps + per-step dates), document checklist, utility, and folder/project linkage.',
    getLlrInput,
    getLlr,
  );

  register(
    'list_companies',
    'List CRM companies. Filter by free-text name substring (q) and/or business-relationship tag (REP, Construction, Pre Construction, Utility).',
    listCompaniesInput,
    listCompanies,
  );

  register(
    'get_company',
    'Get a CRM company by id, plus every contact linked to it (via the affiliations / companyIds mirror).',
    getCompanyInput,
    getCompany,
  );

  register(
    'list_contacts',
    'List CRM contacts. Filter by company id (returns contacts affiliated with that company) and/or free-text substring matched against name + email.',
    listContactsInput,
    listContacts,
  );

  register(
    'get_recent_activity',
    'Read recent entries from the platform audit log. Filter by actor email or resource type (company, contact, site, job, task, lead, user, tool, session, route, pdf, document). Newest first.',
    getRecentActivityInput,
    getRecentActivity,
  );

  return server;
}
