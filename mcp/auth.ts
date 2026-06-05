/**
 * Bearer-token gate for the MCP endpoint. Single shared token
 * (env.MCP_BEARER_TOKEN); constant-time compare to avoid leaking length-based
 * timing signal. Token rotation: `openssl rand -hex 32` → `wrangler secret put
 * MCP_BEARER_TOKEN` → update each MCP client config.
 */

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function requireBearer(
  request: Request,
  expected: string,
): { ok: true } | { ok: false; response: Response } {
  if (!expected) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: 'server misconfigured: no bearer token set' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    };
  }
  const header = request.headers.get('Authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || !constantTimeEqual(match[1], expected)) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer',
        },
      }),
    };
  }
  return { ok: true };
}
