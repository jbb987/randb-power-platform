/**
 * Tribal-proximity lookup for the political-radar federal layer.
 *
 * Returns the nearest federally recognized reservation and a 50-mile flag.
 * The flag is only a *trigger* for Section 106 NHPA consultation — the
 * consultation only fires when a *federal* permit is needed (NEPA, USACE 404,
 * etc.). The UI text makes that conditional explicit.
 *
 * Source: TIGERweb AIANNHA MapServer, layer 2 — "Federal American Indian
 * Reservations." CORS-friendly, no auth.
 *   https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/AIANNHA/MapServer/2
 *
 * Each feature carries CENTLAT / CENTLON attributes already in WGS84, so we
 * skip ring math entirely and Haversine to the centroid. Centroid distance
 * is a slight overestimate of edge distance — fine for the 50-mile trigger,
 * which we'd rather have biased toward over-flagging than missing.
 */

import { cachedFetch, TTL_INFRASTRUCTURE } from '../requestCache';
import type { TribalProximity } from './types';

const ENDPOINT =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/AIANNHA/MapServer/2/query';

/** Envelope search radius — degrees latitude. ~1° ≈ 69 mi, so 1.5° ≈ 100 mi. */
const ENVELOPE_DEG = 1.5;

interface ArcGISFeature {
  attributes?: {
    NAME?: string;
    BASENAME?: string;
    CENTLAT?: string | number;
    CENTLON?: string | number;
  };
}

interface ArcGISResponse {
  features?: ArcGISFeature[];
  error?: { message?: string };
}

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface TribalProximityResult {
  data: TribalProximity | null;
  error: string | null;
}

export async function fetchTribalProximity(
  lat: number,
  lng: number,
): Promise<TribalProximityResult> {
  const xmin = lng - ENVELOPE_DEG;
  const ymin = lat - ENVELOPE_DEG;
  const xmax = lng + ENVELOPE_DEG;
  const ymax = lat + ENVELOPE_DEG;
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${xmin},${ymin},${xmax},${ymax}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'NAME,BASENAME,CENTLAT,CENTLON',
    returnGeometry: 'false',
    f: 'json',
  });
  const url = `${ENDPOINT}?${params.toString()}`;

  try {
    const data = await cachedFetch<ArcGISResponse>(
      url,
      async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`TIGERweb AIANNHA ${res.status}`);
        return (await res.json()) as ArcGISResponse;
      },
      TTL_INFRASTRUCTURE,
    );

    if (data.error) {
      return { data: null, error: data.error.message ?? 'TIGERweb AIANNHA error' };
    }

    let nearestMi: number | null = null;
    let nearestName: string | null = null;
    for (const f of data.features ?? []) {
      const cLat = typeof f.attributes?.CENTLAT === 'string' ? parseFloat(f.attributes.CENTLAT) : f.attributes?.CENTLAT;
      const cLng = typeof f.attributes?.CENTLON === 'string' ? parseFloat(f.attributes.CENTLON) : f.attributes?.CENTLON;
      if (typeof cLat !== 'number' || typeof cLng !== 'number') continue;
      if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) continue;
      const d = haversineMi(lat, lng, cLat, cLng);
      if (nearestMi === null || d < nearestMi) {
        nearestMi = d;
        nearestName = f.attributes?.NAME ?? f.attributes?.BASENAME ?? null;
      }
    }

    return {
      data: {
        nearestMi: nearestMi !== null ? Math.round(nearestMi * 10) / 10 : null,
        nearestName,
        within50Mi: nearestMi !== null && nearestMi <= 50,
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'TIGERweb AIANNHA fetch failed',
    };
  }
}
