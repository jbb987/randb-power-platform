/**
 * Cloudflare Worker fetch adapter for the MCP server.
 *
 * Implements the MCP streamable-HTTP transport in stateless mode:
 *   - POST  /mcp  → JSON-RPC request, JSON-RPC response (or 202 for notifications)
 *   - GET   /mcp  → 405 (server doesn't push server-initiated messages)
 *   - OPTIONS    → CORS preflight
 *
 * Every request is bearer-gated against env.MCP_BEARER_TOKEN before any
 * Firestore work happens.
 */

import { requireBearer } from './auth';
import { handleMcpJsonRpc } from './server';
import type { McpEnv } from './types';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
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

  if (request.method === 'GET') {
    return new Response(null, { status: 405, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return withCors(
      new Response(JSON.stringify({ error: 'method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  try {
    const response = await handleMcpJsonRpc(request, env);
    return withCors(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return withCors(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: msg } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }
}
