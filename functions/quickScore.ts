/**
 * Public site-score endpoint — POST /api/public/site-score
 *
 * Server-to-server: the R&B Power marketing site's Cloudflare Worker (a separate
 * origin) calls this when a landowner submits the "Is my land powerable?" form.
 * It scores the coordinate against the grid (reusing the Site Analyzer engine),
 * stores the submission as a `site-leads` record, and returns the coarse verdict.
 *
 * Trust boundary: a shared bearer secret (env.SITE_SCORE_TOKEN) — the caller is a
 * trusted server, NOT an end-user browser, so per-IP rate limiting (the marketing
 * Worker shares one egress IP) is only a ceiling, the bearer is the real gate.
 *
 * The verdict is DELIBERATELY coarse (see quickScoreVerdict.ts) — a teaser, not an
 * engineering study. Precise figures stay internal (Bailey's job).
 */

import { requireBearer } from '../mcp/auth';
import { createDoc } from '../mcp/firestore/client';
import { lookupGridInfra } from '../src/lib/gridInfraQuery';
import { analyzeGrid } from '../src/lib/gridAnalysis';
import { scoreInfraVerdict } from '../src/lib/quickScoreVerdict';
import { SITE_LEADS_COLLECTION, type SiteLead } from '../src/types';

interface RateLimitBinding {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface QuickScoreEnv {
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  FIREBASE_PROJECT_ID?: string;
  /** Shared bearer secret the marketing Worker must present. */
  SITE_SCORE_TOKEN: string;
  /** Optional Cloudflare native rate-limit binding (abuse ceiling). */
  SITE_SCORE_RL?: RateLimitBinding;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

interface SiteScoreRequest {
  landownerName: string;
  phone: string;
  address?: string;
  lat: number;
  lng: number;
  acreage: number;
  hasPowerInfra: boolean;
}

function parseBody(raw: unknown): SiteScoreRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  const landownerName = typeof b.landownerName === 'string' ? b.landownerName.trim() : '';
  const phone = typeof b.phone === 'string' ? b.phone.trim() : '';
  const address = typeof b.address === 'string' ? b.address.trim() : '';
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  const acreage = Number(b.acreage);
  const hasPowerInfra = b.hasPowerInfra === true;

  if (!landownerName || !phone) return null;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  if (!Number.isFinite(acreage) || acreage <= 0) return null;

  return { landownerName, phone, address, lat, lng, acreage, hasPowerInfra };
}

export async function handleSiteScore(request: Request, env: QuickScoreEnv): Promise<Response> {
  // Authorization: shared bearer secret (reuses the MCP constant-time gate).
  const auth = requireBearer(request, env.SITE_SCORE_TOKEN);
  if (!auth.ok) return auth.response;

  // Abuse ceiling (per egress IP — see header note).
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (env.SITE_SCORE_RL) {
    const { success } = await env.SITE_SCORE_RL.limit({ key: ip });
    if (!success) return json({ error: 'rate limited' }, 429);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const body = parseBody(raw);
  if (!body) {
    return json({ error: 'missing or invalid fields (name, phone, lat, lng, acreage required)' }, 400);
  }

  // ── Score: reuse the Site Analyzer grid engine ──
  const infra = await lookupGridInfra(body.lat, body.lng);
  const grid = analyzeGrid(infra, { currentYear: new Date().getUTCFullYear() });
  const { verdict, mwRange, nearestSubstation } = scoreInfraVerdict({
    acreage: body.acreage,
    hasPowerInfra: body.hasPowerInfra,
    grid,
  });

  // ── Store the submission (every site, GO/CONDITIONAL/NO_GO) ──
  const now = Date.now();
  const id = `sl_${crypto.randomUUID()}`;
  const doc: SiteLead = {
    id,
    landownerName: body.landownerName,
    phone: body.phone,
    address: body.address ?? '',
    lat: body.lat,
    lng: body.lng,
    acreage: body.acreage,
    hasPowerInfra: body.hasPowerInfra,
    verdict,
    mwRange,
    nearestSubstation,
    status: 'submitted',
    source: 'marketing-site',
    submittedFromIp: ip,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await createDoc(env, SITE_LEADS_COLLECTION, id, doc as unknown as Record<string, unknown>);
  } catch (err) {
    // Don't fail the landowner's request if storage hiccups — they still get a
    // verdict; the marketing Worker's email notification is the durable backup.
    console.error('[site-score] failed to store site-lead:', err);
  }

  return json({ verdict, mwRange, nearestSubstation }, 200);
}
