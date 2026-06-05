/**
 * MCP JSON-RPC dispatcher.
 *
 * We hand-roll the JSON-RPC layer rather than importing
 * `@modelcontextprotocol/sdk`'s `Server` + `StreamableHTTPServerTransport` —
 * the SDK's transport classes target Node's `IncomingMessage`/`ServerResponse`
 * and don't drop into a Cloudflare Worker fetch handler. The wire protocol
 * itself (JSON-RPC 2.0 over a POST, with MCP methods: initialize, tools/list,
 * tools/call, ping) is small and stable, so implementing it directly is
 * cleaner than wrestling the SDK transport into Workers shape. zod is reused
 * to validate tool inputs against the same schemas the tool handlers consume.
 */

import { z, type ZodType } from 'zod';

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

interface ToolDef<TIn extends ZodType> {
  name: string;
  description: string;
  inputSchema: TIn;
  handler: (env: McpEnv, args: z.infer<TIn>) => Promise<unknown>;
}

function tool<TIn extends ZodType>(def: ToolDef<TIn>): ToolDef<ZodType> {
  return def as ToolDef<ZodType>;
}

const TOOLS: Array<ToolDef<ZodType>> = [
  tool({
    name: 'list_sites',
    description:
      'List analyzed sites from the Site Analyzer registry. Filter by free-text name substring or company id. Returns lightweight summaries (id, name, coordinates, acreage, MW capacity, company link, last analyzed timestamp).',
    inputSchema: listSitesInput,
    handler: listSites,
  }),
  tool({
    name: 'get_site',
    description:
      'Get a full Site Analyzer entry by id. Use `sections` to choose which analysis sections to include (full entry can exceed 50KB). Default sections: overview + appraisal. Available: overview, appraisal, power, water, gas, broadband, transport, labor, political.',
    inputSchema: getSiteInput,
    handler: getSite,
  }),
  tool({
    name: 'list_llrs',
    description:
      'List Large Load Request (LLR) sites — utility-facing pre-construction requests. Filter by utility (oncor/aep/coop/other) and grade (GO/CONDITIONAL_GO/NO_GO). Returns id, name, coordinates, MW, grade, LOA status, utility, linked siteRegistryId.',
    inputSchema: listLlrsInput,
    handler: listLlrs,
  }),
  tool({
    name: 'get_llr',
    description:
      'Get a full LLR record by id. Includes appraisal grade + auto-suggested grade, assigned engineer, engineer-verified MW, LOA timeline (steps + per-step dates), document checklist, utility, and folder/project linkage.',
    inputSchema: getLlrInput,
    handler: getLlr,
  }),
  tool({
    name: 'list_companies',
    description:
      'List CRM companies. Filter by free-text name substring (q) and/or business-relationship tag (REP, Construction, Pre Construction, Utility).',
    inputSchema: listCompaniesInput,
    handler: listCompanies,
  }),
  tool({
    name: 'get_company',
    description:
      'Get a CRM company by id, plus every contact linked to it (via the affiliations / companyIds mirror).',
    inputSchema: getCompanyInput,
    handler: getCompany,
  }),
  tool({
    name: 'list_contacts',
    description:
      'List CRM contacts. Filter by company id (returns contacts affiliated with that company) and/or free-text substring matched against name + email.',
    inputSchema: listContactsInput,
    handler: listContacts,
  }),
  tool({
    name: 'get_recent_activity',
    description:
      'Read recent entries from the platform audit log. Filter by actor email or resource type (company, contact, site, job, task, lead, user, tool, session, route, pdf, document). Newest first.',
    inputSchema: getRecentActivityInput,
    handler: getRecentActivity,
  }),
];

interface ZodDef {
  typeName: string;
  shape?: () => Record<string, ZodType>;
  values?: string[];
  type?: ZodType;
  innerType?: ZodType;
  description?: string;
}

interface ZodInternal {
  _def: ZodDef;
  isOptional(): boolean;
  description?: string;
}

function zodToJsonSchema(schema: ZodType): Record<string, unknown> {
  const inner = schema as unknown as ZodInternal;
  const def = inner._def;
  const description = (schema as unknown as { description?: string }).description;
  const withDesc = (out: Record<string, unknown>): Record<string, unknown> =>
    description ? { ...out, description } : out;

  switch (def.typeName) {
    case 'ZodObject': {
      const shape = def.shape ? def.shape() : {};
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, val] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(val);
        const optional = (val as unknown as ZodInternal).isOptional();
        if (!optional) required.push(key);
      }
      const out: Record<string, unknown> = { type: 'object', properties };
      if (required.length) out.required = required;
      return withDesc(out);
    }
    case 'ZodString':
      return withDesc({ type: 'string' });
    case 'ZodNumber':
      return withDesc({ type: 'number' });
    case 'ZodBoolean':
      return withDesc({ type: 'boolean' });
    case 'ZodEnum':
      return withDesc({ type: 'string', enum: def.values ?? [] });
    case 'ZodArray':
      return withDesc({ type: 'array', items: def.type ? zodToJsonSchema(def.type) : {} });
    case 'ZodOptional':
    case 'ZodDefault':
      return def.innerType ? zodToJsonSchema(def.innerType) : {};
    default:
      return {};
  }
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const SERVER_INFO = { name: 'randb-power-platform', version: '1.0.0' };
const PROTOCOL_VERSION = '2025-06-18';

async function handleMessage(
  message: JsonRpcRequest,
  env: McpEnv,
): Promise<JsonRpcResponse | null> {
  const { id, method, params } = message;

  try {
    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          },
        };
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null;
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };
      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOLS.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: zodToJsonSchema(t.inputSchema),
            })),
          },
        };
      }
      case 'tools/call': {
        const { name, arguments: rawArgs } = (params ?? {}) as {
          name?: string;
          arguments?: unknown;
        };
        if (!name) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'tools/call requires `name`' },
          };
        }
        const t = TOOLS.find((x) => x.name === name);
        if (!t) {
          return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } };
        }
        const parsed = t.inputSchema.safeParse(rawArgs ?? {});
        if (!parsed.success) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: `Invalid arguments for ${name}: ${parsed.error.message}`,
            },
          };
        }
        const result = await t.handler(env, parsed.data);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        };
      }
      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { jsonrpc: '2.0', id, error: { code: -32603, message: msg } };
  }
}

export async function handleMcpJsonRpc(request: Request, env: McpEnv): Promise<Response> {
  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = (await request.json()) as JsonRpcRequest | JsonRpcRequest[];
  } catch {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const messages = Array.isArray(body) ? body : [body];
  const responses: JsonRpcResponse[] = [];
  for (const m of messages) {
    const r = await handleMessage(m, env);
    if (r) responses.push(r);
  }

  if (responses.length === 0) {
    return new Response(null, { status: 202 });
  }

  const payload = Array.isArray(body) ? responses : responses[0];
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
