/**
 * Retail / distribution utility resolver.
 *
 * The legacy "utility territory" was derived from the most common *transmission*
 * line owner near a coordinate (see infraLookup.ts → deriveUtility). That names
 * the transmission owner, never the retail/distribution utility — so rural
 * electric co-ops (which own little high-voltage transmission) were structurally
 * invisible, and sites in co-op territory were mislabeled (e.g. Kenefic, OK was
 * shown as a transmission utility when it is served by Southeastern Electric Coop).
 *
 * This resolves the ACTUAL serving utility via point-in-polygon against the
 * Electric Retail Service Territories layer (ORNL/HIFLD/EIA), then disambiguates
 * the (always overlapping) candidate polygons by INTERIORITY — how deep inside
 * each territory the point sits. Validated on 8 known sites: the true utility is
 * present 100% of the time, and the conservative confidence rule below makes
 * ZERO wrong auto-picks (it shows a shortlist instead of guessing whenever a
 * blanket investor-owned utility competes with a co-op). See
 * research/utility-territory/FINDINGS.md.
 */

import { cachedFetch, TTL_LOCATION } from './requestCache';

export type RetailUtilityConfidence = 'high' | 'low' | 'none';

export interface RetailUtilityCandidate {
  /** Raw NAME from the dataset, e.g. "SOUTHEASTERN ELECTRIC COOP INC - (OK)". */
  name: string;
  /** TYPE field: COOPERATIVE | INVESTOR OWNED | MUNICIPAL | POLITICAL SUBDIVISION | ... */
  type: string;
  /** Customer count, or null when the dataset stores the -999999 sentinel. */
  customers: number | null;
  /** Meters from the point to this polygon's boundary; larger ⇒ more interior. */
  interiorityM: number;
}

export interface RetailUtilityResolution {
  /** Best auto-pick when confidence is 'high'; null when 'low'/'none' (show candidates). */
  serving: RetailUtilityCandidate | null;
  confidence: RetailUtilityConfidence;
  /** All overlapping territories, ranked by interiority (most interior first). */
  candidates: RetailUtilityCandidate[];
  method: 'service-territory-polygon';
  resolvedAt: number;
}

// Live mirrors of the same ORNL/HIFLD/EIA polygon layer, tried in order. These
// are public, CORS-enabled ArcGIS hosted layers (same access pattern the app
// already uses for substations/transmission lines). NASA NCCS / EIA Atlas are
// the upstream sources; mirrors are used because HIFLD Open shut down Aug 2025.
const ENDPOINTS = [
  'https://services6.arcgis.com/BAJNi3EgCdtQ1BCG/arcgis/rest/services/Electric_Retail_Service_Territories/FeatureServer/0',
  'https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0',
  'https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Electric_Retail_Service_Territories/FeatureServer/0',
];

/** #1 interiority must beat #2 by this ratio to auto-pick a single utility. */
const CONFIDENCE_RATIO = 1.5;

const isCoop = (type: string) => /cooperat/i.test(type);

/** Strip the trailing " - (ST)" state suffix some records carry, for display. */
export function cleanUtilityName(name: string): string {
  return name.replace(/\s*-\s*\([A-Z]{2}\)\s*$/, '').trim();
}

// ── geometry (planar approx around the site latitude — fine for ranking) ──────
function metersPerDegree(lat: number) {
  return { x: 111320 * Math.cos((lat * Math.PI) / 180), y: 110540 };
}
function distPointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-12;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function edgeDistanceMeters(rings: number[][][], lat: number, lng: number): number {
  const m = metersPerDegree(lat);
  const px = lng * m.x;
  const py = lat * m.y;
  let min = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i];
      const b = ring[i + 1];
      min = Math.min(
        min,
        distPointToSegment(px, py, a[0] * m.x, a[1] * m.y, b[0] * m.x, b[1] * m.y),
      );
    }
  }
  return Number.isFinite(min) ? min : 0;
}

interface ArcGisFeature {
  attributes: { NAME?: string; TYPE?: string; CUSTOMERS?: number };
  geometry?: { rings?: number[][][] };
}

async function queryEndpoint(
  endpoint: string,
  lat: number,
  lng: number,
): Promise<RetailUtilityCandidate[]> {
  const geometry = encodeURIComponent(
    JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
  );
  const url =
    `${endpoint}/query?geometry=${geometry}&geometryType=esriGeometryPoint&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&outFields=NAME,TYPE,CUSTOMERS` +
    `&returnGeometry=true&outSR=4326&geometryPrecision=5&f=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`territory lookup HTTP ${res.status}`);
  const json = (await res.json()) as { features?: ArcGisFeature[]; error?: unknown };
  if (json.error) throw new Error('territory lookup error');
  return (json.features ?? []).map((f) => {
    const cust = Number(f.attributes?.CUSTOMERS);
    return {
      name: String(f.attributes?.NAME ?? '').trim(),
      type: String(f.attributes?.TYPE ?? '').trim(),
      customers: Number.isFinite(cust) && cust !== -999999 ? cust : null,
      interiorityM: edgeDistanceMeters(f.geometry?.rings ?? [], lat, lng),
    };
  });
}

/**
 * Apply the conservative confidence rule to interiority-ranked candidates.
 * Auto-pick (high) only when it cannot be the blanket-IOU-over-coop trap;
 * otherwise low ⇒ caller should present the candidate shortlist for a human pick.
 */
export function decideRetailUtility(candidates: RetailUtilityCandidate[]): {
  serving: RetailUtilityCandidate | null;
  confidence: RetailUtilityConfidence;
} {
  if (candidates.length === 0) return { serving: null, confidence: 'none' };
  const ranked = [...candidates].sort((a, b) => b.interiorityM - a.interiorityM);
  const top = ranked[0];
  if (ranked.length === 1) return { serving: top, confidence: 'high' };

  // No real interiority signal (missing geometry, or the point sits on a shared
  // boundary so every candidate reads ~0) ⇒ never auto-pick, show the shortlist.
  if (top.interiorityM <= 0) return { serving: null, confidence: 'low' };

  const second = ranked[1];
  const ratio = second.interiorityM > 0 ? top.interiorityM / second.interiorityM : Infinity;
  const anyCoop = candidates.some((c) => isCoop(c.type));

  // A co-op clearly winning on interiority is trustworthy (e.g. Kenefic).
  if (isCoop(top.type) && ratio >= CONFIDENCE_RATIO) return { serving: top, confidence: 'high' };
  // A non-co-op on top while a co-op competes is the dangerous case (Ike Byrom) — never assert.
  if (!isCoop(top.type) && anyCoop) return { serving: null, confidence: 'low' };
  // No competing co-op and a clear interiority winner ⇒ safe.
  if (ratio >= CONFIDENCE_RATIO) return { serving: top, confidence: 'high' };
  return { serving: null, confidence: 'low' };
}

/** Resolve the serving retail/distribution utility for a coordinate. */
export async function resolveRetailUtility(
  lat: number,
  lng: number,
): Promise<RetailUtilityResolution> {
  // Cached + deduped like the sibling ArcGIS lookups in infraLookup.ts, so
  // re-analyzing the same coordinate doesn't re-hit the service-territory endpoint.
  return cachedFetch(
    `retail-utility:${lat.toFixed(4)},${lng.toFixed(4)}`,
    async () => {
      let candidates: RetailUtilityCandidate[] | null = null;
      for (const endpoint of ENDPOINTS) {
        try {
          candidates = await queryEndpoint(endpoint, lat, lng);
          break; // first endpoint that answers wins (even with 0 features)
        } catch {
          candidates = null; // try the next mirror
        }
      }
      if (candidates === null) {
        return {
          serving: null,
          confidence: 'none' as const,
          candidates: [],
          method: 'service-territory-polygon' as const,
          resolvedAt: Date.now(),
        };
      }
      const ranked = [...candidates].sort((a, b) => b.interiorityM - a.interiorityM);
      const { serving, confidence } = decideRetailUtility(ranked);
      return {
        serving,
        confidence,
        candidates: ranked,
        method: 'service-territory-polygon' as const,
        resolvedAt: Date.now(),
      };
    },
    TTL_LOCATION,
  );
}
