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
  TechnologyType,
} from '../types';
import { TECH_CODE_MAP } from '../types';
import { geocodeAddress } from './infraLookup';

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
}

// ── ArcGIS FCC BDC Query ────────────────────────────────────────────────────

/**
 * Discover the working FeatureServer URL by trying multiple vintage names.
 * Caches the result for the session.
 */
let _cachedServiceUrl: string | null = null;

async function discoverServiceUrl(): Promise<string | null> {
  if (_cachedServiceUrl) return _cachedServiceUrl;

  for (const name of BDC_SERVICE_NAMES) {
    const url = `${ARCGIS_FCC_BDC}/${name}/FeatureServer`;
    try {
      const res = await fetch(`${url}?f=json`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.layers && data.layers.length > 0) {
        console.log('[BDC] Discovered service:', name);
        console.log('[BDC] Layers:', data.layers?.map((l: { id: number; name: string }) => `${l.id}: ${l.name}`));
        console.log('[BDC] Tables:', data.tables?.map((t: { id: number; name: string }) => `${t.id}: ${t.name}`));
        _cachedServiceUrl = url;
        return url;
      }
    } catch {
      continue;
    }
  }
  console.warn('[BDC] No working service URL found');
  return null;
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
    if (!block) {
      console.warn('[BDC] No census block found');
      return [];
    }

    console.log('[BDC] Block found, OID:', block.objectId);
    console.log('[BDC] Block attributes:', JSON.stringify(block.attributes, null, 2));

    // Try to get individual provider records from detail tables
    const geoid = String(block.attributes.GEOID ?? '');
    if (block.objectId != null && geoid) {
      const providers = await queryRelatedProviders(serviceUrl, block.objectId, geoid);
      if (providers.length > 0) {
        console.log('[BDC] Got providers from detail table:', providers.length);
        return providers;
      }
    }

    // Fallback: synthesize provider info from block-level summary attributes
    console.log('[BDC] Using block summary fallback');
    return extractProvidersFromSummary(block.attributes);
  } catch (err) {
    console.error('[BDC] Query error:', err);
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
}

/**
 * Query provider detail tables directly by GEOID.
 *
 * The BDC FeatureServer has 6 layers (0-5) and 6 tables (6-11).
 * Tables mirror layers: table 10 = Block provider detail (layer 4 = Block).
 * No relationships are defined, so we query tables directly.
 */
async function queryRelatedProviders(
  serviceUrl: string,
  _objectId: number,
  geoid?: string,
): Promise<BroadbandProvider[]> {
  if (!geoid) return [];

  // Table 7 = "BDC Records for Blocks" (per the discovered service)
  // Try block table first, then others
  const tableIds = [7, 6, 8, 9, 10, 11];

  for (const tableId of tableIds) {
    try {
      // Step 1: Discover field names for this table
      const schemaRes = await fetch(`${serviceUrl}/${tableId}?f=json`, { signal: AbortSignal.timeout(5000) });
      if (!schemaRes.ok) continue;

      const schema = await schemaRes.json();
      if (schema.error) continue;

      const fieldNames: string[] = (schema.fields ?? []).map((f: { name: string }) => f.name);
      console.log(`[BDC] Table ${tableId} (${schema.name}): fields:`, fieldNames);

      // Step 2: Find the GEOID-like field
      const geoidField = fieldNames.find(
        (f) => /^(GEOID|BlockGEOID|block_geoid|geoid|GeographyID|BlockCode|block_fips)$/i.test(f)
      );

      if (!geoidField) {
        // If no GEOID field, try to get one record to inspect
        const sampleUrl =
          `${serviceUrl}/${tableId}/query?` +
          `where=1%3D1` +
          `&outFields=*` +
          `&returnGeometry=false` +
          `&resultRecordCount=1` +
          `&f=json`;

        const sampleRes = await fetch(sampleUrl, { signal: AbortSignal.timeout(10000) });
        if (sampleRes.ok) {
          const sampleData = await sampleRes.json();
          if (sampleData.features?.length > 0) {
            console.log(`[BDC] Table ${tableId} sample record:`, JSON.stringify(sampleData.features[0].attributes, null, 2));
          }
        }
        console.log(`[BDC] Table ${tableId}: no GEOID field found in`, fieldNames);
        continue;
      }

      // Step 3: Query by GEOID
      console.log(`[BDC] Table ${tableId}: querying ${geoidField}='${geoid}'`);
      const url =
        `${serviceUrl}/${tableId}/query?` +
        `where=${encodeURIComponent(`${geoidField}='${geoid}'`)}` +
        `&outFields=*` +
        `&returnGeometry=false` +
        `&resultRecordCount=50` +
        `&f=json`;

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;

      const data = await res.json();

      if (data.error) {
        console.log(`[BDC] Table ${tableId}: query error:`, data.error.message);
        continue;
      }

      console.log(`[BDC] Table ${tableId}: ${data.features?.length ?? 0} records`);

      if (!data.features?.length) continue;

      // Log first record
      console.log(`[BDC] Table ${tableId} first record:`, JSON.stringify(data.features[0].attributes, null, 2));

      const providers: BroadbandProvider[] = [];
      for (const f of data.features) {
        const p = parseProviderRecord(f.attributes);
        if (p) providers.push(p);
      }

      if (providers.length > 0) {
        console.log(`[BDC] Got ${providers.length} providers from table ${tableId}`);
        return deduplicateProviders(providers);
      }
    } catch (err) {
      console.log(`[BDC] Table ${tableId}: fetch error`, err);
      continue;
    }
  }

  return [];
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
  );

  const fiberUnderserved = num('UnderservedBSLsFiber', 'underserved_bsls_fiber');
  const cableUnderserved = num('UnderservedBSLsCable', 'underserved_bsls_cable');
  const copperUnderserved = num('UnderservedBSLsCopper', 'underserved_bsls_copper');
  const fwUnderserved = num(
    'UnderservedBSLsLicFixedWireless', 'underserved_bsls_lic_fixed_wireless',
    'UnderservedBSLsFixedWireless', 'underserved_bsls_fixed_wireless',
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
      techCode: 60,
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

  // Census block first (needed for FIPS-based provider query)
  const census = await queryCensusBlock(lat, lng);
  const providers = await queryBroadbandProviders(lat, lng, census.fips);

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
    fiberAvailable: providers.some((p) => p.technology === 'Fiber'),
    cableAvailable: providers.some((p) => p.technology === 'Cable'),
    fixedWirelessAvailable: providers.some((p) => p.technology === 'Fixed Wireless'),
    maxDownload: providers.length > 0 ? Math.max(...providers.map((p) => p.maxDown)) : 0,
    maxUpload: providers.length > 0 ? Math.max(...providers.map((p) => p.maxUp)) : 0,

    tier,
    iso,
    utilityTerritory: [], // Will be populated if power infra data available

    fccMapUrl: buildFccMapUrl(lat, lng),
    analyzedAt: Date.now(),
  };
}
