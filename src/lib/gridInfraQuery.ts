/**
 * Grid infrastructure queries — substations + transmission lines only.
 *
 * Extracted from infraLookup.ts so this keyless, runtime-agnostic subset can be
 * imported by BOTH the browser app (Site Analyzer, via infraLookup.ts) AND the
 * Cloudflare Worker (the public /api/public/site-score endpoint). Everything here
 * hits PUBLIC, keyless ArcGIS endpoints and uses only fetch + Math + Promises —
 * no DOM, no relative-URL proxies, no API keys — so it runs unchanged in the
 * Worker runtime. The browser-coupled layers (NREL solar via /api/nrel, EIA,
 * Census geocode, retail-utility) stay in infraLookup.ts.
 */

import type { NearbySubstation, NearbyLine } from '../types';
import { cachedFetch, TTL_LOCATION } from './requestCache';

// ── Endpoints ───────────────────────────────────────────────────────────────

const GEOPLATFORM = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services';
const TRANSMISSION_LINES_URL = `${GEOPLATFORM}/US_Electric_Power_Transmission_Lines/FeatureServer/0`;

// HIFLD (DHS) was shut down Aug 2025. Substations now come from a public ArcGIS
// mirror with the same schema (75 k+ national records).
const HIFLD_SUBSTATIONS_URL =
  'https://services1.arcgis.com/PMShNXB1carltgVf/arcgis/rest/services/Electric_Substations/FeatureServer/0/query';

const LAT_OFFSET = 0.145; // ~10 miles

/** Widened fallback search used only when the ~10mi screen returns nothing, so
 *  remote sites report the distance to the nearest substation / line instead of
 *  a blank "none nearby". ~75mi (reuses the power-plant screening radius). */
const WIDE_LAT_OFFSET = 1.087;
/** Distance cap (mi) on the widened fallback — beyond this, interconnection is
 *  economically dead, so we report "none within Nmi" rather than a useless hit. */
export const NEAREST_SEARCH_RADIUS_MI = 75;

/** Cap on how long the two ArcGIS round-trips may take before we degrade to an
 *  empty result — a stalled upstream then yields a conservative verdict rather
 *  than hanging the public request. */
const INFRA_TIMEOUT_MS = 4000;

// ── Helpers ─────────────────────────────────────────────────────────────────

export function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lngOffset(lat: number): number {
  return (LAT_OFFSET / Math.cos((lat * Math.PI) / 180)) * Math.cos((30 * Math.PI) / 180);
}

function envelope(lat: number, lng: number): string {
  const lo = lngOffset(lat);
  return `${lng - lo},${lat - LAT_OFFSET},${lng + lo},${lat + LAT_OFFSET}`;
}

/** Bounding-box envelope ("w,s,e,n") around a point for an arbitrary latitude
 *  half-height (degrees). Used by the widened nearest-infrastructure fallback. */
function envelopeForOffset(lat: number, lng: number, latOffset: number): string {
  const lo = (latOffset / Math.cos((lat * Math.PI) / 180)) * Math.cos((30 * Math.PI) / 180);
  return `${lng - lo},${lat - latOffset},${lng + lo},${lat + latOffset}`;
}

/** Shortest distance (mi) from a point to a line segment, in a local planar
 *  frame whose units are already miles. */
function pointSegDistMi(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Approximate shortest distance (mi) from the site to a polyline, projecting
 *  ArcGIS [lng,lat] vertices to a local equirectangular frame (in miles). The
 *  small-angle distortion is negligible within the ~75mi fallback window, and
 *  this catches mid-segment closest points, not just vertices. */
function distanceToPathMi(siteLat: number, siteLng: number, paths: number[][][]): number {
  const R = 3958.8;
  const latRad = (siteLat * Math.PI) / 180;
  const projX = (lng: number) => (((lng - siteLng) * Math.PI) / 180) * Math.cos(latRad) * R;
  const projY = (lat: number) => (((lat - siteLat) * Math.PI) / 180) * R;

  let min = Infinity;
  for (const path of paths) {
    let prevX: number | null = null;
    let prevY: number | null = null;
    for (const pt of path) {
      const x = projX(pt[0]);
      const y = projY(pt[1]);
      if (prevX !== null && prevY !== null) {
        min = Math.min(min, pointSegDistMi(0, 0, prevX, prevY, x, y));
      } else {
        min = Math.min(min, Math.hypot(x, y));
      }
      prevX = x;
      prevY = y;
    }
  }
  return min;
}

function getAttr(attrs: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (attrs[key] !== undefined) return attrs[key];
    if (attrs[key.toUpperCase()] !== undefined) return attrs[key.toUpperCase()];
    if (attrs[key.toLowerCase()] !== undefined) return attrs[key.toLowerCase()];
  }
  return undefined;
}

// ── Queries ─────────────────────────────────────────────────────────────────

/** Raw line feature with geometry paths for substation coordinate extraction. */
export interface LineFeature {
  line: NearbyLine;
  /** First point of the polyline path (approximate SUB_1 location) [lng, lat]. */
  startPt: [number, number] | null;
  /** Last point of the polyline path (approximate SUB_2 location) [lng, lat]. */
  endPt: [number, number] | null;
}

export async function queryLinesWithGeometry(lat: number, lng: number): Promise<LineFeature[]> {
  const key = `infra:lines:${lat.toFixed(3)},${lng.toFixed(3)}`;
  return cachedFetch(
    key,
    async () => {
      const url =
        `${TRANSMISSION_LINES_URL}/query?` +
        `where=1%3D1` +
        `&geometry=${encodeURIComponent(envelope(lat, lng))}` +
        `&geometryType=esriGeometryEnvelope` +
        `&spatialRel=esriSpatialRelIntersects` +
        `&inSR=4326&outSR=4326` +
        `&outFields=OWNER%2CVOLTAGE%2CVOLT_CLASS%2CSUB_1%2CSUB_2%2CSTATUS` +
        `&returnGeometry=true` +
        `&resultRecordCount=50` +
        `&f=json`;

      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`[infra] Transmission lines query HTTP ${res.status} for ${lat},${lng}`);
          return [];
        }
        const data = (await res.json()) as {
          error?: unknown;
          features?: Array<{
            attributes: Record<string, unknown>;
            geometry?: { paths?: number[][][] };
          }>;
        };
        if (data.error) {
          console.warn('[infra] Transmission lines query returned error:', data.error);
          return [];
        }
        return (data.features ?? [])
          .map(
            (f: { attributes: Record<string, unknown>; geometry?: { paths?: number[][][] } }) => {
              const a = f.attributes;
              const paths = f.geometry?.paths;
              const firstPath = paths?.[0];
              const lastPath = paths?.[paths.length - 1];
              return {
                line: {
                  owner: String(a.OWNER ?? ''),
                  voltage: Number(a.VOLTAGE) || 0,
                  voltClass: String(a.VOLT_CLASS ?? ''),
                  sub1: String(a.SUB_1 ?? ''),
                  sub2: String(a.SUB_2 ?? ''),
                  status: String(a.STATUS ?? ''),
                } satisfies NearbyLine,
                startPt: firstPath?.[0]
                  ? ([firstPath[0][0], firstPath[0][1]] as [number, number])
                  : null,
                endPt: lastPath
                  ? ([lastPath[lastPath.length - 1][0], lastPath[lastPath.length - 1][1]] as [
                      number,
                      number,
                    ])
                  : null,
              } satisfies LineFeature;
            },
          )
          .sort((a: LineFeature, b: LineFeature) => b.line.voltage - a.line.voltage);
      } catch (err) {
        console.warn('[infra] Transmission lines fetch failed:', err);
        return [];
      }
    },
    TTL_LOCATION,
  );
}

/**
 * Extract substations from transmission line geometry endpoints.
 * Each line has SUB_1 at the start of the polyline and SUB_2 at the end.
 * We average all endpoint coordinates for each named substation to get its location.
 */
export function extractSubstations(
  features: LineFeature[],
  siteLat: number,
  siteLng: number,
): NearbySubstation[] {
  // Collect all coordinate samples for each substation name
  const subData = new Map<
    string,
    {
      coords: { lat: number; lng: number }[];
      voltages: number[];
      owners: string[];
      statuses: string[];
      lineCount: number;
    }
  >();

  for (const feat of features) {
    const entries: [string, [number, number] | null][] = [
      [feat.line.sub1, feat.startPt],
      [feat.line.sub2, feat.endPt],
    ];

    for (const [name, pt] of entries) {
      if (!name || name === 'NOT AVAILABLE') continue;

      let data = subData.get(name);
      if (!data) {
        data = { coords: [], voltages: [], owners: [], statuses: [], lineCount: 0 };
        subData.set(name, data);
      }
      data.lineCount++;
      if (feat.line.voltage > 0) data.voltages.push(feat.line.voltage);
      if (feat.line.owner && feat.line.owner !== 'NOT AVAILABLE') data.owners.push(feat.line.owner);
      if (feat.line.status) data.statuses.push(feat.line.status);
      // pt is [lng, lat] in ArcGIS format
      if (pt && pt[0] !== 0 && pt[1] !== 0) {
        data.coords.push({ lat: pt[1], lng: pt[0] });
      }
    }
  }

  const subs: NearbySubstation[] = [];

  for (const [name, data] of subData) {
    const maxVolt = data.voltages.length > 0 ? Math.max(...data.voltages) : 0;
    const owner = data.owners[0] ?? '';
    const status = data.statuses.includes('IN SERVICE') ? 'IN SERVICE' : (data.statuses[0] ?? '');

    // Average all coordinate samples for this substation
    let sLat = 0;
    let sLng = 0;
    if (data.coords.length > 0) {
      sLat = data.coords.reduce((s, c) => s + c.lat, 0) / data.coords.length;
      sLng = data.coords.reduce((s, c) => s + c.lng, 0) / data.coords.length;
    }

    const distanceMi = sLat && sLng ? haversineMi(siteLat, siteLng, sLat, sLng) : 0;

    subs.push({
      name,
      owner,
      maxVolt,
      minVolt: 0,
      status,
      lines: data.lineCount,
      distanceMi,
      lat: sLat,
      lng: sLng,
    });
  }

  // Sort: real distances first, then 0-distance at end
  return subs.sort((a, b) => {
    if (a.distanceMi === 0 && b.distanceMi > 0) return 1;
    if (b.distanceMi === 0 && a.distanceMi > 0) return -1;
    return a.distanceMi - b.distanceMi || b.maxVolt - a.maxVolt;
  });
}

// ── Merge line-derived + HIFLD substations ─────────────────────────────────

/**
 * Check if two substation names refer to the same facility.
 * Matches on exact name, or same UNKNOWN ID, or one name contains the other.
 */
function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return true;
  // Partial match: "MINES ROAD" matches "MINES ROAD SUBSTATION"
  if (la.includes(lb) || lb.includes(la)) return true;
  return false;
}

/**
 * Merge substations from two sources:
 * - Line-derived: better names, owners, and coverage
 * - HIFLD: more precise coordinates, min voltage data
 *
 * Only merges when names match (same ID or similar name).
 * Otherwise both are shown — better to show a duplicate than hide a real substation.
 */
export function mergeSubstations(
  lineDerived: NearbySubstation[],
  hifld: NearbySubstation[],
  siteLat: number,
  siteLng: number,
): NearbySubstation[] {
  if (hifld.length === 0) return lineDerived;
  if (lineDerived.length === 0) return hifld;

  const merged = lineDerived.map((s) => ({ ...s }));
  const matchedHifldIndices = new Set<number>();

  for (let hi = 0; hi < hifld.length; hi++) {
    const h = hifld[hi];

    // Find a line-derived substation with a matching name
    const matchIdx = merged.findIndex((l) => namesMatch(l.name, h.name));

    if (matchIdx >= 0) {
      const target = merged[matchIdx];

      // Name: keep the longer/more descriptive one
      if (h.name.length > target.name.length && !h.name.startsWith('UNKNOWN')) {
        target.name = h.name;
      }

      // Owner: keep line-derived (usually more complete)
      if (!target.owner && h.owner) {
        target.owner = h.owner;
      }

      // Coordinates: upgrade to HIFLD surveyed location if available
      if (h.lat && h.lng) {
        target.lat = h.lat;
        target.lng = h.lng;
      }

      // Voltage: take the best from both
      target.maxVolt = Math.max(target.maxVolt, h.maxVolt);
      if (h.minVolt > 0 && (target.minVolt === 0 || h.minVolt < target.minVolt)) {
        target.minVolt = h.minVolt;
      }

      // Lines: take the higher count
      target.lines = Math.max(target.lines, h.lines);

      matchedHifldIndices.add(hi);
    }
  }

  // Append unmatched HIFLD substations — they're distinct facilities
  for (let hi = 0; hi < hifld.length; hi++) {
    if (!matchedHifldIndices.has(hi)) {
      merged.push(hifld[hi]);
    }
  }

  // Recalculate distances from site (coordinates may have changed from merge)
  for (const s of merged) {
    if (s.lat && s.lng) {
      s.distanceMi = haversineMi(siteLat, siteLng, s.lat, s.lng);
    }
  }

  // Sort: real distances first, then by voltage descending
  return merged.sort((a, b) => {
    if (a.distanceMi === 0 && b.distanceMi > 0) return 1;
    if (b.distanceMi === 0 && a.distanceMi > 0) return -1;
    return a.distanceMi - b.distanceMi || b.maxVolt - a.maxVolt;
  });
}

// ── Substations (HIFLD mirror — original DHS endpoint shut down Aug 2025) ──

/** Minimal shape of an ArcGIS substation feature (Cloudflare's fetch types the
 *  JSON body as `unknown`, so we narrow it explicitly). */
interface SubFeature {
  attributes?: Record<string, unknown>;
  geometry?: { x?: number; y?: number };
}

export async function querySubstationsHIFLD(
  siteLat: number,
  siteLng: number,
): Promise<NearbySubstation[]> {
  const lo = lngOffset(siteLat);
  const south = siteLat - LAT_OFFSET;
  const north = siteLat + LAT_OFFSET;
  const west = siteLng - lo;
  const east = siteLng + lo;

  const cacheKey = `hifld:subs:${siteLat.toFixed(3)},${siteLng.toFixed(3)}`;

  const features = await cachedFetch(
    cacheKey,
    async () => {
      // Strategy 1: WHERE clause with lat/lon range
      const whereUrl =
        `${HIFLD_SUBSTATIONS_URL}?` +
        `where=LATITUDE >= ${south} AND LATITUDE <= ${north} AND LONGITUDE >= ${west} AND LONGITUDE <= ${east}` +
        `&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=200&f=json`;

      try {
        const res = await fetch(whereUrl);
        if (res.ok) {
          const feats = ((await res.json()) as { features?: SubFeature[] }).features;
          if (Array.isArray(feats) && feats.length > 0) return feats;
        } else {
          console.warn(`[infra] HIFLD substations WHERE query HTTP ${res.status}`);
        }
      } catch (err) {
        console.warn(
          '[infra] HIFLD substations WHERE query failed, falling back to envelope:',
          err,
        );
      }

      // Strategy 2: Geometry envelope
      const envUrl =
        `${HIFLD_SUBSTATIONS_URL}?` +
        `where=1%3D1` +
        `&geometry=${west},${south},${east},${north}` +
        `&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects` +
        `&inSR=4326&outSR=4326&outFields=*&returnGeometry=true&resultRecordCount=200&f=json`;

      try {
        const res2 = await fetch(envUrl);
        if (!res2.ok) {
          console.warn(
            `[infra] HIFLD substations envelope query HTTP ${res2.status} for ${siteLat},${siteLng}`,
          );
          return [];
        }
        const feats2 = ((await res2.json()) as { features?: SubFeature[] }).features;
        return Array.isArray(feats2) ? feats2 : [];
      } catch (err) {
        console.warn('[infra] HIFLD substations envelope fetch failed:', err);
        return [];
      }
    },
    TTL_LOCATION,
  );

  return featuresToSubstations(features, siteLat, siteLng);
}

/** Map raw ArcGIS substation features → `NearbySubstation[]`, sorted nearest
 *  first. Shared by the in-box `querySubstationsHIFLD` and the widened
 *  `findNearestSubstation` fallback. */
function featuresToSubstations(
  features: SubFeature[],
  siteLat: number,
  siteLng: number,
): NearbySubstation[] {
  const subs: NearbySubstation[] = [];
  for (const feat of features) {
    const attrs = feat.attributes ?? {};
    const geom = feat.geometry;

    const name = String(getAttr(attrs, 'NAME', 'Name', 'name') ?? '').trim();
    if (!name || name === 'NOT AVAILABLE') continue;

    let lat = geom?.y ?? Number(getAttr(attrs, 'LATITUDE', 'Latitude', 'LAT') ?? 0);
    let lng = geom?.x ?? Number(getAttr(attrs, 'LONGITUDE', 'Longitude', 'LONG', 'LON') ?? 0);
    if (lat === -999999 || lng === -999999 || (!lat && !lng)) continue;
    // ArcGIS sometimes swaps lat/lng — sanity check
    if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) [lat, lng] = [lng, lat];

    const maxVolt = Number(getAttr(attrs, 'MAX_VOLT', 'Max_Volt') ?? 0);
    const minVolt = Number(getAttr(attrs, 'MIN_VOLT', 'Min_Volt') ?? 0);
    const status = String(getAttr(attrs, 'STATUS', 'Status') ?? 'IN SERVICE');
    const lineCount = Number(getAttr(attrs, 'LINES', 'Lines') ?? 0);
    const owner = String(getAttr(attrs, 'OWNER', 'Owner') ?? '');

    // HIFLD substation id (ArcGIS `ID`) — joins to substation_queue_load.
    // Same field infraIngestion.ts and powerMapData.ts read for hifldId.
    const hifldRaw = getAttr(attrs, 'ID', 'Id', 'id');
    const hifldNum = hifldRaw != null ? Number(hifldRaw) : NaN;

    const distanceMi = haversineMi(siteLat, siteLng, lat, lng);

    subs.push({
      name,
      owner,
      maxVolt,
      minVolt,
      status,
      lines: lineCount,
      distanceMi,
      lat,
      lng,
      ...(Number.isFinite(hifldNum) && hifldNum > 0 ? { hifldId: hifldNum } : {}),
    });
  }

  return subs.sort((a, b) => a.distanceMi - b.distanceMi || b.maxVolt - a.maxVolt);
}

// ── Composed lookup (substations + lines) ───────────────────────────────────

function withTimeout<T>(p: Promise<T>, fallback: T, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/**
 * Fetch the grid infrastructure `analyzeGrid` needs for a coordinate: nearby
 * substations (line-derived merged with the HIFLD mirror) and nearby
 * transmission lines. Keyless and Worker-safe. A stalled ArcGIS upstream
 * degrades to empty results after INFRA_TIMEOUT_MS rather than hanging.
 */
export async function lookupGridInfra(
  lat: number,
  lng: number,
): Promise<{ nearbySubstations: NearbySubstation[]; nearbyLines: NearbyLine[] }> {
  const [lineFeatures, hifldSubstations] = await Promise.all([
    withTimeout(queryLinesWithGeometry(lat, lng), [] as LineFeature[], INFRA_TIMEOUT_MS),
    withTimeout(querySubstationsHIFLD(lat, lng), [] as NearbySubstation[], INFRA_TIMEOUT_MS),
  ]);

  const lineSubstations = extractSubstations(lineFeatures, lat, lng);
  const nearbySubstations = mergeSubstations(lineSubstations, hifldSubstations, lat, lng);
  const nearbyLines = lineFeatures.map((f) => f.line);

  return { nearbySubstations, nearbyLines };
}

// ── Nearest-infrastructure fallback (when the ~10mi screen is empty) ─────────

/** Widen the substation search to ~75mi and return the single nearest one
 *  (within the distance cap), or null. Keyless and Worker-safe. */
export async function findNearestSubstation(
  siteLat: number,
  siteLng: number,
): Promise<NearbySubstation | null> {
  const cacheKey = `hifld:subs:near:${siteLat.toFixed(3)},${siteLng.toFixed(3)}`;
  const features = await cachedFetch(
    cacheKey,
    async () => {
      const geom = envelopeForOffset(siteLat, siteLng, WIDE_LAT_OFFSET);
      const url =
        `${HIFLD_SUBSTATIONS_URL}?` +
        `where=1%3D1` +
        `&geometry=${geom}` +
        `&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects` +
        `&inSR=4326&outSR=4326&outFields=*&returnGeometry=true&resultRecordCount=1000&f=json`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(
            `[infra] Nearest-substation widen HTTP ${res.status} for ${siteLat},${siteLng}`,
          );
          return [];
        }
        const feats = ((await res.json()) as { features?: SubFeature[] }).features;
        return Array.isArray(feats) ? feats : [];
      } catch (err) {
        console.warn('[infra] Nearest-substation widen fetch failed:', err);
        return [];
      }
    },
    TTL_LOCATION,
  );

  const subs = featuresToSubstations(features, siteLat, siteLng);
  return subs.find((s) => s.distanceMi > 0 && s.distanceMi <= NEAREST_SEARCH_RADIUS_MI) ?? null;
}

/** Widen the transmission-line search to ~75mi and return the single nearest
 *  line (with `distanceMi`, within the cap), or null. Computes a true
 *  point-to-polyline distance. Keyless and Worker-safe. */
export async function findNearestLine(
  siteLat: number,
  siteLng: number,
): Promise<NearbyLine | null> {
  const cacheKey = `infra:lines:near:${siteLat.toFixed(3)},${siteLng.toFixed(3)}`;
  return cachedFetch(
    cacheKey,
    async () => {
      const url =
        `${TRANSMISSION_LINES_URL}/query?` +
        `where=1%3D1` +
        `&geometry=${encodeURIComponent(envelopeForOffset(siteLat, siteLng, WIDE_LAT_OFFSET))}` +
        `&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects` +
        `&inSR=4326&outSR=4326` +
        `&outFields=OWNER%2CVOLTAGE%2CVOLT_CLASS%2CSUB_1%2CSUB_2%2CSTATUS` +
        `&returnGeometry=true&resultRecordCount=2000&f=json`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`[infra] Nearest-line widen HTTP ${res.status} for ${siteLat},${siteLng}`);
          return null;
        }
        const data = (await res.json()) as {
          error?: unknown;
          features?: Array<{
            attributes: Record<string, unknown>;
            geometry?: { paths?: number[][][] };
          }>;
        };
        if (data.error) {
          console.warn('[infra] Nearest-line widen returned error:', data.error);
          return null;
        }
        let best: NearbyLine | null = null;
        let bestDist = Infinity;
        for (const f of data.features ?? []) {
          const paths = f.geometry?.paths;
          if (!paths || paths.length === 0) continue;
          const d = distanceToPathMi(siteLat, siteLng, paths);
          if (d < bestDist) {
            bestDist = d;
            const a = f.attributes;
            best = {
              owner: String(a.OWNER ?? ''),
              voltage: Number(a.VOLTAGE) || 0,
              voltClass: String(a.VOLT_CLASS ?? ''),
              sub1: String(a.SUB_1 ?? ''),
              sub2: String(a.SUB_2 ?? ''),
              status: String(a.STATUS ?? ''),
              distanceMi: d,
            };
          }
        }
        return best && bestDist <= NEAREST_SEARCH_RADIUS_MI ? best : null;
      } catch (err) {
        console.warn('[infra] Nearest-line widen fetch failed:', err);
        return null;
      }
    },
    TTL_LOCATION,
  );
}

export interface NearestGridInfra {
  nearestSubstation: NearbySubstation | null;
  nearestLine: NearbyLine | null;
  /** Radius (mi) of the widened search that produced the results above. */
  searchRadiusMi: number;
}

/**
 * Fallback for sites where the ~10mi screen found nothing: widen to ~75mi and
 * report the single nearest substation and/or line. Only searches the category
 * the caller asks for (`needSubstation` / `needLine`). A stalled upstream
 * degrades to null after INFRA_TIMEOUT_MS.
 */
export async function findNearestGridInfra(
  siteLat: number,
  siteLng: number,
  opts: { needSubstation: boolean; needLine: boolean },
): Promise<NearestGridInfra> {
  const [nearestSubstation, nearestLine] = await Promise.all([
    opts.needSubstation
      ? withTimeout(findNearestSubstation(siteLat, siteLng), null, INFRA_TIMEOUT_MS)
      : Promise.resolve<NearbySubstation | null>(null),
    opts.needLine
      ? withTimeout(findNearestLine(siteLat, siteLng), null, INFRA_TIMEOUT_MS)
      : Promise.resolve<NearbyLine | null>(null),
  ]);
  return { nearestSubstation, nearestLine, searchRadiusMi: NEAREST_SEARCH_RADIUS_MI };
}
