/**
 * Cloudflare Worker fetch adapter for the MCP server.
 *
 * Wires the request straight into the SDK's
 * `WebStandardStreamableHTTPServerTransport` (Web Standards–native — the
 * SDK's docstring documents this as the Cloudflare Workers variant of the
 * Streamable HTTP transport). Stateless mode: no `Mcp-Session-Id`, every
 * request handled independently. JSON responses (no SSE) — fine for our
 * single-shot read-only tools.
 *
 * Bearer-gated against `env.MCP_BEARER_TOKEN` before any Firestore work
 * happens.
 */

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import { requireBearer } from './auth';
import { createMcpServer } from './server';
import type { McpEnv } from './types';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID',
  'Access-Control-Max-Age': '86400',
};

function withCors(response: Response): Response {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    response.headers.set(k, v);
  }
  return response;
}

export async function handleMcpRequest(request: Request, env: McpEnv): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const auth = requireBearer(request, env.MCP_BEARER_TOKEN);
  if (!auth.ok) return withCors(auth.response);

  const server = createMcpServer(env);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  try {
    return withCors(await transport.handleRequest(request));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return withCors(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: msg } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  } finally {
    await transport.close();
  }
}
