/**
 * Cloudflare Worker entrypoint.
 *
 * Handles CORS proxy routes for government APIs that don't support CORS:
 *   /api/fema/*            → https://hazards.fema.gov/arcgis/*
 *   /api/nwi/*             → https://fwspublicservices.wim.usgs.gov/*
 *   /api/census/*          → https://api.census.gov/*           (ACS demographics)
 *   /api/census-geocoder/* → https://geocoding.geo.census.gov/* (MSA resolution)
 *
 * Also hosts the MCP server at /mcp (read-only Firestore access for any
 * MCP client — see ../mcp/README.md for tools + auth model).
 *
 * All other requests fall through to static assets (SPA).
 */

import { handleMcpRequest } from '../mcp/transport';

interface Env {
  ASSETS: Fetcher;
  /** Census Data API key — injected server-side into /api/census/* requests
   *  so it never appears in the client bundle. Set under the Worker's
   *  Variables and Secrets in the Cloudflare dashboard. Optional: when
   *  unset, Census requests run on the anonymous tier (rate-limited). */
  VITE_CENSUS_API_KEY?: string;
  /** Firebase project id used by the MCP server's Firestore REST client. */
  FIREBASE_PROJECT_ID?: string;
  /** Service-account JSON for the MCP server. Secret; never committed. */
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  /** Bearer token clients must present to call /mcp. Secret. */
  MCP_BEARER_TOKEN: string;
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
  // Order matters: longer prefixes must come before shorter ones so the
  // startsWith() match in the dispatch loop picks the more specific route.
  '/api/census-geocoder': {
    origin: 'https://geocoding.geo.census.gov',
    rewrite: (path: string) => path.replace(/^\/api\/census-geocoder/, ''),
  },
  '/api/census': {
    origin: 'https://api.census.gov',
    rewrite: (path: string) => path.replace(/^\/api\/census/, ''),
  },
  // Water-analysis upstreams that block CORS in production (NLDI, ECHO) or
  // reset connections under load (drought live feed) — proxied 2026-06-12.
  '/api/nldi': {
    origin: 'https://api.water.usgs.gov',
    rewrite: (path: string) => path.replace(/^\/api\/nldi/, '/nldi'),
  },
  '/api/echo': {
    origin: 'https://echodata.epa.gov',
    rewrite: (path: string) => path.replace(/^\/api\/echo/, '/echo'),
  },
  '/api/drought': {
    origin: 'https://services9.arcgis.com',
    rewrite: (path: string) =>
      path.replace(/^\/api\/drought/, '/RHVPKKiFTONKtxq3/arcgis/rest/services'),
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

/** Headers that force the browser (and any intermediate cache) to skip
 *  caching the proxied response. We do this because some upstream APIs
 *  (e.g. Census) return `Cache-Control: private` even on error pages —
 *  if a browser caches a stale "Invalid Key" / "Missing Key" HTML body,
 *  the app would keep failing locally even after we fix the upstream
 *  config. Safer to never cache proxied responses; cachedFetch on the
 *  client already deduplicates in-flight requests. */
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestOrigin = request.headers.get('Origin') ?? '*';

    // MCP endpoint — bearer-gated, reads Firestore via a service-account
    // signed JWT. Stateless streamable-HTTP; see ../mcp/transport.ts.
    if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
      return handleMcpRequest(request, env);
    }

    // Check if this is a proxy route
    for (const [prefix, config] of Object.entries(PROXY_ROUTES)) {
      if (url.pathname.startsWith(prefix)) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: corsHeaders(requestOrigin) });
        }

        const targetPath = config.rewrite(url.pathname);
        const targetUrlObj = new URL(`${config.origin}${targetPath}${url.search}`);

        // Server-side injection: the Census Data API requires a key for any
        // meaningful quota. The key lives in the Worker's runtime env vars
        // so it's never exposed in the client bundle. Only inject if the
        // request didn't already supply one (dev sends it from .env.local).
        if (
          prefix === '/api/census' &&
          env.VITE_CENSUS_API_KEY &&
          !targetUrlObj.searchParams.has('key')
        ) {
          targetUrlObj.searchParams.set('key', env.VITE_CENSUS_API_KEY);
        }

        const targetUrl = targetUrlObj.toString();

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
          for (const [key, value] of Object.entries(NO_CACHE_HEADERS)) {
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
