/**
 * Broadband Data Lookup.
 *
 * Data sources (all public, free):
 * - FCC Census Block API (geo.fcc.gov): FIPS, county, state from lat/lon
 * - ArcGIS Living Atlas – FCC BDC: Provider availability by census block
 * - Built-in: ISO/RTO detection (reused from infraLookup)
 *
 * Flow: coordinates → FIPS → ArcGIS BDC query → BroadbandResult
 */

import type {
  BroadbandProvider,
  BroadbandResult,
  ConnectivityTier,
  MobileBroadbandProvider,
  MobileTechnology,
  NearbyServiceBlock,
  NearbyFiberRoute,
  TechnologyType,
} from '../types';
import { MOBILE_TECH_CODE_MAP, TECH_CODE_MAP } from '../types';
import { geocodeAddress } from './infraLookup';
import { cachedFetch, TTL_LOCATION, TTL_INFRASTRUCTURE } from './requestCache';

// ── Endpoints ───────────────────────────────────────────────────────────────

const FCC_CENSUS_URL = 'https://geo.fcc.gov/api/census/block/find';

/**
 * ArcGIS Living Atlas – FCC Broadband Data Collection.
 * Org: jIL9msH9OI208GCb (Esri Content / Living Atlas)
 *
 * Layer structure (6 sublayers + related tables):
 * 0 = State, 1 = County, 2 = Tract, 3 = Block Group, 4 = Block, 5 = H3 Hex
 * Each sublayer has a related table with per-provider detail.
 *
 * We query layer 4 (Block) by census block FIPS, then the related table
 * for individual provider records.
 */
const ARCGIS_FCC_BDC =
  'https://services8.arcgis.com/peDZJliSvYims39Q/arcgis/rest/services';

// Try multiple vintage names — Esri updates biannually
// Org peDZJliSvYims39Q on services8 is the Esri Living Atlas content org
const BDC_SERVICE_NAMES = [
  'FCC_Broadband_Data_Collection_June_2025_View',
  'FCC_Broadband_Data_Collection_December_2024_View',
  'FCC_Broadband_Data_Collection_June_2024_View',
];

const BLOCK_LAYER = 4;    // Census Block sublayer

// ── FCC Census Block API ────────────────────────────────────────────────────

interface CensusBlockResult {
  fips: string;
  countyFips: string;
  countyName: string;
  stateCode: string;
  stateName: string;
}

async function queryCensusBlock(lat: number, lng: number): Promise<CensusBlockResult> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    format: 'json',
  });

  const cacheKey = `fcc:census:${lat.toFixed(5)},${lng.toFixed(5)}`;
  return cachedFetch(cacheKey, async () => {
    const res = await fetch(`${FCC_CENSUS_URL}?${params}`);
    if (!res.ok) throw new Error(`FCC Census API returned ${res.status}`);

    const data = await res.json();
    if (data.status !== 'OK' || !data.Block?.FIPS) {
      throw new Error('Could not resolve census block for these coordinates.');
    }

    return {
      fips: data.Block.FIPS,
      countyFips: data.County?.FIPS ?? data.Block.FIPS.slice(0, 5),
      countyName: data.County?.name ?? '',
      stateCode: data.State?.code ?? '',
      stateName: data.State?.name ?? '',
    };
  }, TTL_LOCATION);
}

// ── ArcGIS FCC BDC Query ────────────────────────────────────────────────────

/**
 * Discover the working FeatureServer URL by trying multiple vintage names.
 * Result is cached via the shared request cache.
 */
async function discoverServiceUrl(): Promise<string | null> {
  return cachedFetch('bdc:serviceUrl', async () => {
    for (const name of BDC_SERVICE_NAMES) {
      const url = `${ARCGIS_FCC_BDC}/${name}/FeatureServer`;
      try {
        const res = await fetch(`${url}?f=json`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) continue;
        const data = await res.json();
        if (data.layers && data.layers.length > 0) {
          return url;
        }
      } catch {
        continue;
      }
    }
    return null;
  }, TTL_INFRASTRUCTURE);
}

/** Block-level summary attributes from the ArcGIS BDC layer. */
interface BlockSummary {
  attributes: Record<string, unknown>;
  objectId: number | null;
}

/**
 * Query the ArcGIS FCC BDC FeatureServer for broadband data at a census block.
 *
 * Strategy:
 * 1. Spatial query on Block layer (4) to find the census block polygon
 * 2. Try to get per-provider detail from the related table
 * 3. If related table is empty, extract summary data from block attributes
 *    (served/underserved counts by technology type)
 */
async function queryBroadbandProviders(
  lat: number,
  lng: number,
  fips: string,
): Promise<BroadbandProvider[]> {
  const serviceUrl = await discoverServiceUrl();
  if (!serviceUrl) return [];

  try {
    // Find the census block that contains this point
    const block = await findBlock(serviceUrl, lat, lng, fips);
    if (!block) return [];

    // Try to get individual provider records from detail tables
    const geoid = String(block.attributes.GEOID ?? '');
    if (geoid) {
      const providers = await queryProvidersByGeoid(serviceUrl, geoid);
      if (providers.length > 0) return providers;
    }

    // Fallback: synthesize provider info from block-level summary attributes
    return extractProvidersFromSummary(block.attributes);
  } catch {
    return [];
  }
}

/** Find the census block by spatial query, falling back to FIPS attribute query. */
async function findBlock(
  serviceUrl: string,
  lat: number,
  lng: number,
  fips: string,
): Promise<BlockSummary | null> {
  const cacheKey = `bdc:block:${lat.toFixed(5)},${lng.toFixed(5)}:${fips}`;
  return cachedFetch(cacheKey, async () => {
    // Strategy 1: spatial point query
    const spatialUrl =
      `${serviceUrl}/${BLOCK_LAYER}/query?` +
      `where=1%3D1` +
      `&geometry=${lng}%2C${lat}` +
      `&geometryType=esriGeometryPoint` +
      `&spatialRel=esriSpatialRelIntersects` +
      `&inSR=4326` +
      `&outFields=*` +
      `&returnGeometry=false` +
      `&resultRecordCount=1` +
      `&f=json`;

    try {
      const res = await fetch(spatialUrl, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        if (!data.error && data.features?.length > 0) {
          const a = data.features[0].attributes;
          return { attributes: a, objectId: a.OBJECTID ?? a.FID ?? null };
        }
      }
    } catch { /* fall through */ }

    // Strategy 2: attribute query by FIPS code
    const fipsUrl =
      `${serviceUrl}/${BLOCK_LAYER}/query?` +
      `where=GEOID%3D%27${fips}%27+OR+geoid20%3D%27${fips}%27` +
      `&outFields=*` +
      `&returnGeometry=false` +
      `&resultRecordCount=1` +
      `&f=json`;

    try {
      const res = await fetch(fipsUrl, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        if (!data.error && data.features?.length > 0) {
          const a = data.features[0].attributes;
          return { attributes: a, objectId: a.OBJECTID ?? a.FID ?? null };
        }
      }
    } catch { /* fall through */ }

    return null;
  }, TTL_LOCATION);
}

/**
 * Query BDC provider detail table directly by GEOID.
 *
 * The BDC FeatureServer has 6 layers (0-5) and 6 tables (6-11).
 * Table 7 = "BDC Records for Blocks" — contains per-provider records
 * with fields: GEOID, ProviderName, FRN, Technology, TotalBSLs, etc.
 */
const BLOCK_PROVIDER_TABLE = 7;

async function queryProvidersByGeoid(
  serviceUrl: string,
  geoid: string,
): Promise<BroadbandProvider[]> {
  const key = `bdc:providers:${geoid}`;
  return cachedFetch(key, async () => {
    try {
      const url =
        `${serviceUrl}/${BLOCK_PROVIDER_TABLE}/query?` +
        `where=${encodeURIComponent(`GEOID='${geoid}'`)}` +
        `&outFields=*` +
        `&returnGeometry=false` +
        `&resultRecordCount=50` +
        `&f=json`;

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return [];

      const data = await res.json();
      if (data.error || !data.features?.length) return [];

      const providers: BroadbandProvider[] = [];
      for (const f of data.features) {
        const p = parseProviderRecord(f.attributes);
        if (p) providers.push(p);
      }

      return deduplicateProviders(providers);
    } catch {
      return [];
    }
  }, TTL_LOCATION);
}

/**
 * Extract broadband info from block-level summary attributes.
 *
 * The BDC block layer has fields like:
 * - TotalBSLs, ServedBSLs, UnderservedBSLs, UnservedBSLs
 * - ServedBSLsFiber, ServedBSLsCable, ServedBSLsFixedWireless, etc.
 * - UniqueProviders, UniqueProvidersFiber, etc.
 *
 * We synthesize approximate provider entries from these counts.
 */
function extractProvidersFromSummary(a: Record<string, unknown>): BroadbandProvider[] {
  const providers: BroadbandProvider[] = [];

  // Helper to read numeric attributes with flexible naming
  const num = (...keys: string[]): number => {
    for (const k of keys) {
      if (a[k] != null && Number(a[k]) > 0) return Number(a[k]);
    }
    return 0;
  };

  // Technology-specific served BSL counts → infer availability
  const fiberServed = num('ServedBSLsFiber', 'served_bsls_fiber');
  const cableServed = num('ServedBSLsCable', 'served_bsls_cable');
  const copperServed = num('ServedBSLsCopper', 'served_bsls_copper');
  const fwServed = num(
    'ServedBSLsLicFixedWireless', 'served_bsls_lic_fixed_wireless',
    'ServedBSLsFixedWireless', 'served_bsls_fixed_wireless',
    'ServedBSLsLTFW', 'ServedBSLsLBRTFW',
  );

  const fiberUnderserved = num('UnderservedBSLsFiber', 'underserved_bsls_fiber');
  const cableUnderserved = num('UnderservedBSLsCable', 'underserved_bsls_cable');
  const copperUnderserved = num('UnderservedBSLsCopper', 'underserved_bsls_copper');
  const fwUnderserved = num(
    'UnderservedBSLsLicFixedWireless', 'underserved_bsls_lic_fixed_wireless',
    'UnderservedBSLsFixedWireless', 'underserved_bsls_fixed_wireless',
    'UnderservedBSLsLTFW', 'UnderservedBSLsLBRTFW',
  );

  const providerCountFiber = num('UniqueProvidersFiber', 'unique_providers_fiber');
  const providerCountTotal = num('UniqueProviders', 'unique_providers');

  // Synthesize provider entries based on what technology types have coverage
  if (fiberServed > 0 || fiberUnderserved > 0) {
    providers.push({
      providerName: providerCountFiber > 1
        ? `${providerCountFiber} Fiber Providers`
        : 'Fiber Provider (area)',
      technology: 'Fiber',
      techCode: 50,
      maxDown: fiberServed > 0 ? 1000 : 100, // estimate: served=gig, underserved=100
      maxUp: fiberServed > 0 ? 500 : 20,
      lowLatency: true,
    });
  }

  if (cableServed > 0 || cableUnderserved > 0) {
    providers.push({
      providerName: 'Cable Provider (area)',
      technology: 'Cable',
      techCode: 40,
      maxDown: cableServed > 0 ? 300 : 50,
      maxUp: cableServed > 0 ? 20 : 5,
      lowLatency: true,
    });
  }

  if (copperServed > 0 || copperUnderserved > 0) {
    providers.push({
      providerName: 'DSL Provider (area)',
      technology: 'DSL',
      techCode: 10,
      maxDown: copperServed > 0 ? 100 : 25,
      maxUp: copperServed > 0 ? 20 : 3,
      lowLatency: true,
    });
  }

  if (fwServed > 0 || fwUnderserved > 0) {
    providers.push({
      providerName: 'Fixed Wireless Provider (area)',
      technology: 'Fixed Wireless',
      techCode: 70,
      maxDown: fwServed > 0 ? 100 : 25,
      maxUp: fwServed > 0 ? 20 : 3,
      lowLatency: true,
    });
  }

  // If we have a total provider count but no tech breakdown, add a generic entry
  if (providers.length === 0 && providerCountTotal > 0) {
    providers.push({
      providerName: `${providerCountTotal} Provider(s) in area`,
      technology: 'Other',
      techCode: 0,
      maxDown: 0,
      maxUp: 0,
      lowLatency: false,
    });
  }

  return providers;
}

/** Estimated speeds by technology type (conservative, for when table lacks speed fields). */
const SPEED_ESTIMATES: Record<number, { down: number; up: number }> = {
  10: { down: 100, up: 20 },   // DSL / Copper
  40: { down: 300, up: 20 },   // Cable
  50: { down: 1000, up: 500 }, // Fiber
  60: { down: 100, up: 5 },    // GSO Satellite (HughesNet/Viasat)
  61: { down: 250, up: 30 },   // NGSO Satellite (Starlink)
  70: { down: 50, up: 10 },    // Unlicensed Fixed Wireless
  71: { down: 100, up: 20 },   // Licensed Fixed Wireless
  72: { down: 50, up: 10 },    // Licensed-by-Rule Fixed Wireless
};

/** Parse a single provider record from the BDC detail table. */
function parseProviderRecord(a: Record<string, unknown>): BroadbandProvider | null {
  if (!a) return null;

  // Field names: BDC tables use ProviderName + Technology
  const providerName =
    String(a.ProviderName ?? a.provider_name ?? a.brand_name ?? a.BrandName ?? a.dba_name ?? a.DBAName ?? '');
  if (!providerName) return null;

  const techCode = Number(a.Technology ?? a.tech_code ?? a.TechCode ?? a.technology_code ?? 0);
  const technology: TechnologyType = TECH_CODE_MAP[techCode] ?? 'Other';

  // BDC block-level tables may not have speed fields — use actual if present, else estimate
  const speeds = SPEED_ESTIMATES[techCode] ?? { down: 0, up: 0 };
  const maxDown = Number(a.max_advertised_download_speed ?? a.MaxAdDown ?? a.max_down ?? a.MaxDown ?? 0) || speeds.down;
  const maxUp = Number(a.max_advertised_upload_speed ?? a.MaxAdUp ?? a.max_up ?? a.MaxUp ?? 0) || speeds.up;

  // Low latency: terrestrial technologies are low latency, GSO satellite is high
  const lowLatency = techCode !== 60; // GSO satellite = high latency; everything else = low

  return { providerName, technology, techCode, maxDown, maxUp, lowLatency };
}

/** Remove duplicate provider+technology entries, keeping the highest speed. */
function deduplicateProviders(providers: BroadbandProvider[]): BroadbandProvider[] {
  const map = new Map<string, BroadbandProvider>();

  for (const p of providers) {
    const key = `${p.providerName}|${p.technology}`;
    const existing = map.get(key);
    if (!existing || p.maxDown > existing.maxDown) {
      map.set(key, p);
    }
  }

  return [...map.values()].sort((a, b) => b.maxDown - a.maxDown);
}

// ── Classification ──────────────────────────────────────────────────────────

function classifyConnectivity(providers: BroadbandProvider[]): ConnectivityTier {
  const hasServed = providers.some(
    (p) => p.lowLatency && p.maxDown >= 100 && p.maxUp >= 20 &&
           ['Fiber', 'Cable', 'DSL', 'Fixed Wireless'].includes(p.technology),
  );
  if (hasServed) return 'Served';

  const hasUnderserved = providers.some(
    (p) => p.lowLatency && p.maxDown >= 25 && p.maxUp >= 3,
  );
  if (hasUnderserved) return 'Underserved';

  return 'Unserved';
}

// ── ISO Detection (reused logic from infraLookup) ───────────────────────────

function detectIso(lat: number, lng: number): string {
  // ERCOT
  if (lat >= 26 && lat <= 34.5 && lng >= -104 && lng <= -94 &&
      !(lng < -104.5) && !(lat > 34 && lng < -100) && !(lat > 33 && lng > -94.5))
    return 'ERCOT';
  // CAISO
  if (lat >= 32.5 && lat <= 42 && lng >= -124.5 && lng <= -114.5 && lng < -115.5)
    return 'CAISO';
  // NYISO
  if (lat >= 40.5 && lat <= 45.1 && lng >= -79.8 && lng <= -71.8)
    return 'NYISO';
  // ISO-NE
  if (lat >= 41 && lat <= 47.5 && lng >= -73.7 && lng <= -66.9)
    return 'ISO-NE';
  // PJM
  if (lat >= 36 && lat <= 42.5 && lng >= -85.5 && lng <= -74 &&
      !(lat > 40.5 && lng > -74.5 && lng < -71.8))
    return 'PJM';
  // MISO
  if (((lat >= 37 && lat <= 49 && lng >= -104 && lng <= -82.5) ||
       (lat >= 29 && lat < 37 && lng >= -97 && lng <= -88)) &&
      !(lat >= 36 && lat <= 42.5 && lng >= -85.5 && lng <= -74) &&
      !(lat >= 26 && lat <= 34.5 && lng >= -104 && lng <= -94))
    return 'MISO';
  // SPP
  if (lat >= 33 && lat <= 43 && lng >= -104 && lng <= -93 &&
      !(lat < 34 && lng > -100) && !(lat > 43))
    return 'SPP';
  // Defaults
  if (lng < -104) return 'WECC';
  if (lat < 37 && lng > -90) return 'SERC';
  return '';
}

// ── County-Level Provider Query ──────────────────────────────────────────────

const COUNTY_PROVIDER_TABLE = 10; // "BDC Records for Counties"

async function queryCountyProviders(countyFips: string): Promise<BroadbandProvider[]> {
  const key = `bdc:county:${countyFips}`;
  return cachedFetch(key, async () => {
    const serviceUrl = await discoverServiceUrl();
    if (!serviceUrl) return [];

    try {
      const url =
        `${serviceUrl}/${COUNTY_PROVIDER_TABLE}/query?` +
        `where=${encodeURIComponent(`GEOID='${countyFips}'`)}` +
        `&outFields=*` +
        `&returnGeometry=false` +
        `&resultRecordCount=200` +
        `&f=json`;

      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return [];

      const data = await res.json();
      if (data.error || !data.features?.length) return [];

      const providers: BroadbandProvider[] = [];
      for (const f of data.features) {
        const p = parseProviderRecord(f.attributes);
        if (p) providers.push(p);
      }

      return deduplicateProviders(providers);
    } catch {
      return [];
    }
  }, TTL_LOCATION);
}

// ── Nearby Fiber Routes ─────────────────────────────────────────────────────

const FIBER_ROUTES_URL =
  'https://services5.arcgis.com/aYs2RC3pluEvAuE3/ArcGIS/rest/services/Existing_Fiber_Routes/FeatureServer/0';

const FIBER_SEARCH_RADIUS = 0.29; // ~20 miles in degrees latitude

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fiberEnvelope(lat: number, lng: number): string {
  const lo = FIBER_SEARCH_RADIUS / Math.cos((lat * Math.PI) / 180) * Math.cos((30 * Math.PI) / 180);
  return `${lng - lo},${lat - FIBER_SEARCH_RADIUS},${lng + lo},${lat + FIBER_SEARCH_RADIUS}`;
}

async function queryNearbyFiber(lat: number, lng: number): Promise<NearbyFiberRoute[]> {
  const key = `fiber:nearby:${lat.toFixed(3)},${lng.toFixed(3)}`;
  return cachedFetch(key, async () => {
    try {
      const url =
        `${FIBER_ROUTES_URL}/query?` +
        `where=1%3D1` +
        `&geometry=${encodeURIComponent(fiberEnvelope(lat, lng))}` +
        `&geometryType=esriGeometryEnvelope` +
        `&spatialRel=esriSpatialRelIntersects` +
        `&inSR=4326&outSR=4326` +
        `&outFields=*` +
        `&returnGeometry=true` +
        `&resultRecordCount=50` +
        `&f=json`;

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return [];

      const data = await res.json();
      if (data.error) return [];

      const routeMap = new Map<string, NearbyFiberRoute>();

      for (const f of data.features ?? []) {
        const a = f.attributes as Record<string, unknown>;
        const paths: number[][][] | undefined = f.geometry?.paths;

        const name = String(a.NAME ?? a.Name ?? a.ROUTE_NAME ?? 'Unknown Route');
        const owner = String(a.OWNER ?? a.Owner ?? a.OPERATOR ?? '');

        // Find closest vertex on the polyline
        let minDist = Infinity;
        if (paths) {
          for (const path of paths) {
            for (const pt of path) {
              const d = haversineMi(lat, lng, pt[1], pt[0]); // [lng, lat]
              if (d < minDist) minDist = d;
            }
          }
        }

        const existing = routeMap.get(name);
        if (!existing || minDist < existing.distanceMi) {
          routeMap.set(name, {
            name,
            owner,
            type: 'long-haul',
            distanceMi: Math.round(minDist * 10) / 10,
          });
        }
      }

      return [...routeMap.values()].sort((a, b) => a.distanceMi - b.distanceMi);
    } catch {
      return [];
    }
  }, TTL_LOCATION);
}

// ── Nearby Fiber Block Detection ────────────────────────────────────────────

const NEARBY_BLOCK_SEARCH_RADIUS = 0.029; // ~2 miles in degrees latitude

function nearbyBlockEnvelope(lat: number, lng: number): string {
  const r = NEARBY_BLOCK_SEARCH_RADIUS;
  const lngOffset = r / Math.cos((lat * Math.PI) / 180);
  return `${lng - lngOffset},${lat - r},${lng + lngOffset},${lat + r}`;
}

function polygonCentroid(rings: number[][][]): { lat: number; lng: number } | null {
  const ring = rings[0]; // outer ring
  if (!ring || ring.length === 0) return null;
  // Esri rings repeat the first vertex as the last — exclude closing vertex
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;
  if (pts.length === 0) return null;
  let sumLng = 0, sumLat = 0;
  for (const pt of pts) {
    sumLng += pt[0];
    sumLat += pt[1];
  }
  return { lng: sumLng / pts.length, lat: sumLat / pts.length };
}

/**
 * When the target census block lacks fiber or cable, search nearby blocks (~2 mi)
 * for wired service availability. Returns blocks sorted by distance with
 * fiber + cable provider details.
 */
async function queryNearbyServiceBlocks(
  serviceUrl: string,
  lat: number,
  lng: number,
  excludeGeoid: string,
): Promise<NearbyServiceBlock[]> {
  const key = `bdc:nearbyService:${lat.toFixed(4)},${lng.toFixed(4)}`;
  return cachedFetch(key, async () => {
    const envelope = nearbyBlockEnvelope(lat, lng);
    const outFields = [
      'GEOID',
      'ServedBSLsFiber', 'UnderservedBSLsFiber', 'UniqueProvidersFiber',
      'ServedBSLsCable', 'UnderservedBSLsCable', 'UniqueProvidersCable',
      'ServedBSLsLTFW', 'UnderservedBSLsLTFW',
      'ServedBSLsLBRTFW', 'UnderservedBSLsLBRTFW',
    ].join(',');
    const url =
      `${serviceUrl}/${BLOCK_LAYER}/query?` +
      `where=1%3D1` +
      `&geometry=${encodeURIComponent(envelope)}` +
      `&geometryType=esriGeometryEnvelope` +
      `&spatialRel=esriSpatialRelIntersects` +
      `&inSR=4326&outSR=4326` +
      `&outFields=${encodeURIComponent(outFields)}` +
      `&returnGeometry=true` +
      `&resultRecordCount=25` +
      `&f=json`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];

    const data = await res.json();
    if (data.error || !data.features?.length) return [];

    // Helper to read numeric attributes with flexible naming
    const num = (a: Record<string, unknown>, ...keys: string[]): number => {
      for (const k of keys) {
        if (a[k] != null && Number(a[k]) > 0) return Number(a[k]);
      }
      return 0;
    };

    // Filter to nearby blocks that have fiber or cable, excluding the target block
    const candidates: { geoid: string; distanceMi: number; attrs: Record<string, unknown>; hasFiber: boolean; hasCable: boolean; hasFixedWireless: boolean }[] = [];

    for (const f of data.features) {
      const a = f.attributes as Record<string, unknown>;
      const geoid = String(a.GEOID ?? a.geoid20 ?? '');
      if (!geoid || geoid === excludeGeoid) continue;

      const hasFiber = num(a, 'ServedBSLsFiber') > 0 || num(a, 'UnderservedBSLsFiber') > 0;
      const hasCable = num(a, 'ServedBSLsCable') > 0 || num(a, 'UnderservedBSLsCable') > 0;
      const hasFixedWireless = num(a, 'ServedBSLsLTFW') > 0 || num(a, 'UnderservedBSLsLTFW') > 0
        || num(a, 'ServedBSLsLBRTFW') > 0 || num(a, 'UnderservedBSLsLBRTFW') > 0;
      if (!hasFiber && !hasCable && !hasFixedWireless) continue;

      // Compute distance from site to block centroid
      let dist = Infinity;
      const rings: number[][][] | undefined = f.geometry?.rings;
      if (rings && rings.length > 0) {
        const c = polygonCentroid(rings);
        if (c) dist = haversineMi(lat, lng, c.lat, c.lng);
      }

      candidates.push({
        geoid,
        distanceMi: Math.round(dist * 10) / 10,
        attrs: a,
        hasFiber,
        hasCable,
        hasFixedWireless,
      });
    }

    if (candidates.length === 0) return [];

    // Sort by distance; cap at 5 closest
    candidates.sort((a, b) => a.distanceMi - b.distanceMi);
    const top = candidates.slice(0, 5);

    // Fetch provider details for all candidates in parallel
    const details = await Promise.all(
      top.map(async (c) => {
        const techFilter = (p: BroadbandProvider) =>
          p.technology === 'Fiber' || p.technology === 'Cable' || p.technology === 'Fixed Wireless';

        let terrestrialProviders: BroadbandProvider[] = [];
        const detailed = await queryProvidersByGeoid(serviceUrl, c.geoid);
        terrestrialProviders = detailed.filter(techFilter);

        // Fallback to summary-based synthesis if detail table is empty
        if (terrestrialProviders.length === 0) {
          terrestrialProviders = extractProvidersFromSummary(c.attrs).filter(techFilter);
        }

        return {
          geoid: c.geoid,
          distanceMi: c.distanceMi,
          providers: terrestrialProviders,
          fiberAvailable: c.hasFiber,
          cableAvailable: c.hasCable,
          fixedWirelessAvailable: c.hasFixedWireless,
        } satisfies NearbyServiceBlock;
      }),
    );

    return details;
  }, TTL_LOCATION);
}

// ── Mobile Broadband Coverage ────────────────────────────────────────────────

/**
 * Query mobile broadband coverage at a location.
 *
 * The FCC BDC ArcGIS Living Atlas service only includes *fixed* broadband.
 * Mobile broadband data is available through the FCC BDC Public Data API,
 * but that requires an authenticated FCC account + API token (not public).
 *
 * This function queries the BDC block-level detail table for any mobile
 * technology codes (300=5G-NR, 400=5G-NR-NSA, 500=4G-LTE, 600=3G)
 * in case Esri adds mobile records to a future Living Atlas update.
 *
 * If no mobile records are found (expected for current data), returns [].
 */
const MOBILE_TECH_CODES = new Set([300, 400, 500, 600]);

async function queryMobileCoverage(
  _lat: number,
  _lng: number,
  fips: string,
): Promise<MobileBroadbandProvider[]> {
  const key = `bdc:mobile:${fips}`;
  return cachedFetch(key, async () => {
    const serviceUrl = await discoverServiceUrl();
    if (!serviceUrl) return [];

    try {
      // Try the block-level detail table — mobile records use tech codes 300-600
      const url =
        `${serviceUrl}/${BLOCK_PROVIDER_TABLE}/query?` +
        `where=${encodeURIComponent(
          `GEOID='${fips}' AND (Technology=300 OR Technology=400 OR Technology=500 OR Technology=600)`,
        )}` +
        `&outFields=*` +
        `&returnGeometry=false` +
        `&resultRecordCount=50` +
        `&f=json`;

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return [];

      const data = await res.json();
      if (data.error || !data.features?.length) return [];

      const providers: MobileBroadbandProvider[] = [];
      for (const f of data.features) {
        const p = parseMobileProviderRecord(f.attributes);
        if (p) providers.push(p);
      }

      return deduplicateMobileProviders(providers);
    } catch {
      return [];
    }
  }, TTL_LOCATION);
}

/** Estimated mobile speeds by technology (conservative). */
const MOBILE_SPEED_ESTIMATES: Record<number, { down: number; up: number }> = {
  300: { down: 200, up: 30 },   // 5G NR
  400: { down: 150, up: 25 },   // 5G NR Non-Standalone
  500: { down: 50, up: 10 },    // 4G LTE
  600: { down: 5, up: 1 },      // 3G
};

/** Parse a single mobile provider record from the BDC detail table. */
function parseMobileProviderRecord(a: Record<string, unknown>): MobileBroadbandProvider | null {
  if (!a) return null;

  const providerName =
    String(a.ProviderName ?? a.provider_name ?? a.brand_name ?? a.BrandName ?? a.dba_name ?? a.DBAName ?? '');
  if (!providerName) return null;

  const techCode = Number(a.Technology ?? a.tech_code ?? a.TechCode ?? a.technology_code ?? 0);
  if (!MOBILE_TECH_CODES.has(techCode)) return null;

  const technology: MobileTechnology = MOBILE_TECH_CODE_MAP[techCode] ?? '4G LTE';
  const speeds = MOBILE_SPEED_ESTIMATES[techCode] ?? { down: 0, up: 0 };
  const maxDown = Number(a.max_advertised_download_speed ?? a.MaxAdDown ?? a.max_down ?? a.MaxDown ?? 0) || speeds.down;
  const maxUp = Number(a.max_advertised_upload_speed ?? a.MaxAdUp ?? a.max_up ?? a.MaxUp ?? 0) || speeds.up;

  return { providerName, technology, techCode, maxDown, maxUp };
}

/** Remove duplicate mobile provider+technology entries, keeping the highest speed. */
function deduplicateMobileProviders(providers: MobileBroadbandProvider[]): MobileBroadbandProvider[] {
  const map = new Map<string, MobileBroadbandProvider>();

  for (const p of providers) {
    const key = `${p.providerName}|${p.technology}`;
    const existing = map.get(key);
    if (!existing || p.maxDown > existing.maxDown) {
      map.set(key, p);
    }
  }

  return [...map.values()].sort((a, b) => b.maxDown - a.maxDown);
}

/** Build the FCC broadband map mobile coverage URL for a location. */
function buildFccMobileMapUrl(lat: number, lng: number): string {
  const addr = encodeURIComponent(`${lat}, ${lng}`);
  return (
    `https://broadbandmap.fcc.gov/location-summary/mobile` +
    `?version=jun2025` +
    `&addr_full=${addr}` +
    `&lat=${lat}&lon=${lng}` +
    `&zoom=15.00`
  );
}

// ── FCC Map URL ─────────────────────────────────────────────────────────────

function buildFccMapUrl(lat: number, lng: number): string {
  const addr = encodeURIComponent(`${lat}, ${lng}`);
  return (
    `https://broadbandmap.fcc.gov/location-summary/fixed` +
    `?version=jun2025` +
    `&addr_full=${addr}` +
    `&lat=${lat}&lon=${lng}` +
    `&zoom=15.00&br=r&speed=100_20&tech=1_2_3_6_7`
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export interface BroadbandLookupOptions {
  coordinates?: { lat: number; lng: number };
  address?: string;
}

export async function lookupBroadband(opts: BroadbandLookupOptions): Promise<BroadbandResult> {
  let { lat, lng } = opts.coordinates ?? { lat: 0, lng: 0 };

  if (!opts.coordinates || (lat === 0 && lng === 0)) {
    if (!opts.address) throw new Error('Provide an address or coordinates.');
    ({ lat, lng } = await geocodeAddress(opts.address));
  }

  // Census block first (needed for FIPS-based queries)
  const census = await queryCensusBlock(lat, lng);

  // Run block providers, county providers, fiber routes, and mobile in parallel
  const results = await Promise.allSettled([
    queryBroadbandProviders(lat, lng, census.fips),
    queryCountyProviders(census.countyFips),
    queryNearbyFiber(lat, lng),
    queryMobileCoverage(lat, lng, census.fips),
  ]);

  function errMsg(r: PromiseSettledResult<unknown>, fallback: string): string | null {
    return r.status === 'rejected'
      ? (r.reason instanceof Error ? r.reason.message : fallback)
      : null;
  }

  const providers = results[0].status === 'fulfilled' ? results[0].value : [];
  const countyProviders = results[1].status === 'fulfilled' ? results[1].value : [];
  const nearbyFiberRoutes = results[2].status === 'fulfilled' ? results[2].value : [];
  const mobileProviders = results[3].status === 'fulfilled' ? results[3].value : [];

  const fiberAvailable = providers.some((p) => p.technology === 'Fiber');
  const cableAvailable = providers.some((p) => p.technology === 'Cable');

  const fixedWirelessAvailable = providers.some((p) => p.technology === 'Fixed Wireless');

  // Phase 2: If any terrestrial service missing, check nearby blocks
  let nearbyServiceBlocks: NearbyServiceBlock[] = [];
  if (!fiberAvailable || !cableAvailable || !fixedWirelessAvailable) {
    const serviceUrl = await discoverServiceUrl();
    if (serviceUrl) {
      try {
        nearbyServiceBlocks = await queryNearbyServiceBlocks(serviceUrl, lat, lng, census.fips);
      } catch { /* nearby service is advisory, never breaks primary flow */ }
    }
  }

  const tier = classifyConnectivity(providers);
  const iso = detectIso(lat, lng);

  return {
    fips: census.fips,
    countyFips: census.countyFips,
    countyName: census.countyName,
    stateCode: census.stateCode,
    stateName: census.stateName,

    providers,
    totalProviders: new Set(providers.map((p) => p.providerName)).size,
    fiberAvailable,
    cableAvailable,
    fixedWirelessAvailable,
    maxDownload: providers.length > 0 ? Math.max(...providers.map((p) => p.maxDown)) : 0,
    maxUpload: providers.length > 0 ? Math.max(...providers.map((p) => p.maxUp)) : 0,

    mobileProviders,

    countyProviders,
    nearbyFiberRoutes,
    nearbyServiceBlocks,

    tier,
    iso,
    utilityTerritory: [],

    fccMapUrl: buildFccMapUrl(lat, lng),
    fccMobileMapUrl: buildFccMobileMapUrl(lat, lng),
    analyzedAt: Date.now(),

    providersError: errMsg(results[0], 'Broadband providers lookup failed'),
    fiberError: errMsg(results[2], 'Fiber routes lookup failed'),
  };
}
