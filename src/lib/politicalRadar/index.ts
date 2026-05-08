/**
 * Political Radar — public entry point.
 *
 * v1 ships the federal layer fully. State / county / city / sub-municipal
 * are stubbed (`status: 'stub'`) so the UI can render the full 5-card layout
 * today and have layers slot in over the next few PRs.
 */

import { parseCoordinates } from '../../utils/parseCoordinates';
import { analyzeFederalLayer } from './federal';
import { readFederalCache, writeFederalCache } from './cache';
import { geohashEncode } from './geohash';
import type {
  FederalLayerData,
  PoliticalRadarResult,
  PoliticalLayerStub,
  RiskBand,
} from './types';

export type { PoliticalRadarResult, FederalLayerData } from './types';
export * from './types';

interface AnalyzeInput {
  /** "lat, lng" string (decimal or DMS — parsed via parseCoordinates). */
  coordinates?: string;
}

function stub(kind: PoliticalLayerStub['kind'], label: string): PoliticalLayerStub {
  return { kind, status: 'stub', label };
}

/**
 * Combined risk score is on a 0-100 scale; the federal layer contributes 3
 * points per the weights memo. Other layers contribute 0 in v1 because
 * they're stubbed; their slots will fill in with subsequent PRs.
 */
function combineScore(federal: FederalLayerData): { score: number; band: RiskBand } {
  const score = federal.subScore; // 0–3; max layer contribution is 3 in v1
  // Combined band mirrors the federal band until other layers come online.
  return { score, band: federal.band };
}

export async function analyzePoliticalRadar(input: AnalyzeInput): Promise<PoliticalRadarResult> {
  const coords = input.coordinates ? parseCoordinates(input.coordinates) : null;
  if (!coords) {
    throw new Error('Political radar requires valid coordinates.');
  }

  const geohash5 = geohashEncode(coords.lat, coords.lng, 5);

  // Try the cache first.
  let federal: FederalLayerData | null = await readFederalCache(geohash5);
  let fromCache = !!federal;

  if (!federal) {
    federal = await analyzeFederalLayer({ lat: coords.lat, lng: coords.lng });
    // Fire-and-forget the cache write so it doesn't extend the user-facing
    // wait. Errors get logged inside writeFederalCache.
    void writeFederalCache(geohash5, federal);
    fromCache = false;
  }

  const { score, band } = combineScore(federal);

  return {
    coordinates: coords,
    geohash5,
    combinedScore: score,
    combinedBand: band,
    layers: {
      federal: { kind: 'federal', status: 'ok', data: federal },
      state: stub('state', 'State legislature, PSC tariffs, AG actions'),
      county: stub('county', 'Zoning, moratoria, county commissioners'),
      city: stub('city', 'City ordinances, councilmembers, mayoral posture'),
      submunicipal: stub('submunicipal', 'Townships, special districts, opposition groups'),
    },
    analyzedAt: Date.now(),
    fromCache,
  };
}
