/**
 * Cloudflare Worker entrypoint.
 *
 * Handles CORS proxy routes for government APIs that don't support CORS:
 *   /api/fema/* → https://hazards.fema.gov/arcgis/*
 *   /api/nwi/*  → https://fwspublicservices.wim.usgs.gov/*
 *
 * All other requests fall through to static assets (SPA).
 */

interface Env {
  ASSETS: Fetcher;
}

const PROXY_ROUTES: Record<string, { origin: string; rewrite: (path: string) => string }> = {
  '/api/fema': {
    origin: 'https://hazards.fema.gov',
    rewrite: (path: string) => path.replace(/^\/api\/fema/, '/arcgis'),
  },
  '/api/nwi': {
    origin: 'https://fwspublicservices.wim.usgs.gov',
    rewrite: (path: string) => path.replace(/^\/api\/nwi/, ''),
  },
};

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestOrigin = request.headers.get('Origin') ?? '*';

    // Check if this is a proxy route
    for (const [prefix, config] of Object.entries(PROXY_ROUTES)) {
      if (url.pathname.startsWith(prefix)) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: corsHeaders(requestOrigin) });
        }

        const targetPath = config.rewrite(url.pathname);
        const targetUrl = `${config.origin}${targetPath}${url.search}`;

        try {
          const res = await fetch(targetUrl, {
            method: request.method,
            headers: { 'User-Agent': 'RBPowerPlatform/1.0' },
          });

          const body = await res.arrayBuffer();
          const headers = new Headers(res.headers);
          for (const [key, value] of Object.entries(corsHeaders(requestOrigin))) {
            headers.set(key, value);
          }

          return new Response(body, { status: res.status, headers });
        } catch {
          return new Response(JSON.stringify({ error: `Proxy error for ${prefix}` }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(requestOrigin) },
          });
        }
      }
    }

    // Fall through to static assets (SPA)
    return env.ASSETS.fetch(request);
  },
};
