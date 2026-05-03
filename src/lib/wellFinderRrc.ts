/**
 * Well Finder — Texas Railroad Commission (RRC) data layer.
 *
 * Browser-direct ArcGIS REST queries against the public RRC GIS service:
 *   gis.rrc.texas.gov/server/rest/services/rrc_public/RRC_Public_Viewer_Srvs/MapServer/1
 *
 * CORS is open, no auth required. Layer 1 = Well Locations (points).
 *
 * Schema (verified live):
 *   API                       — string, 8-char API number
 *   GIS_SYMBOL_DESCRIPTION    — human-readable status (e.g. "Shut-In Oil")
 *   GIS_LAT83 / GIS_LONG83    — NAD83 lat/lng (also returned in geometry.x/y)
 *   OBJECTID                  — server row id (used for pagination)
 *
 * The layer is attribute-thin. Operator name, depth, completion date, etc.
 * require a separate ETL pipeline (RRC bulk MFT downloads) — Phase 2.
 */
import { cachedFetch, TTL_INFRASTRUCTURE } from './requestCache';

const RRC_WELLS_LAYER =
  'https://gis.rrc.texas.gov/server/rest/services/rrc_public/RRC_Public_Viewer_Srvs/MapServer/1/query';

/** Per-page record cap on the RRC layer. */
const RRC_PAGE_SIZE = 1000;

export interface RrcWell {
  api: string;
  status: string;
  lat: number;
  lng: number;
}

/** Texas bounding box (rough). */
export const TEXAS_BBOX = {
  lngMin: -106.65,
  lngMax: -93.51,
  latMin: 25.84,
  latMax: 36.50,
};

/** Default initial map view — centered on Permian Basin. */
export const PERMIAN_VIEW = {
  longitude: -102.5,
  latitude: 31.8,
  zoom: 7,
};

/**
 * All status values the RRC Public Viewer Layer 1 emits via
 * `GIS_SYMBOL_DESCRIPTION`. Verified live against the layer (counts as of
 * the last query for reference; full layer = ~1.39M wells):
 *
 *   Plugged Oil Well                  329,952   Permitted Location      113,004
 *   Oil Well                          317,204   Plugged Gas Well         67,750
 *   Dry Hole                          294,833   Canceled / Abandoned     44,550
 *   Gas Well                          126,463   Injection / Disposal*    42,070
 *   Plugged Oil / Gas                  23,228   Shut-In Oil               5,864
 *   Oil/Gas Well                       23,135   Shut-In Gas               2,180
 *
 * Order below = display order in the filter panel (loosely grouped:
 * producing → shut-in → permitted → plugged → injection → other).
 */
export const ALL_WELL_STATUSES = [
  'Oil Well',
  'Gas Well',
  'Oil/Gas Well',
  'Shut-In Oil',
  'Shut-In Gas',
  'Permitted Location',
  'Plugged Oil Well',
  'Plugged Gas Well',
  'Plugged Oil / Gas',
  'Dry Hole',
  'Canceled / Abandoned Location',
  'Injection / Disposal',
  'Injection / Disposal from Oil',
  'Injection / Disposal from Gas',
  'Injection / Disposal from Oil/Gas',
  'Observation Well',
] as const;

export type WellStatus = typeof ALL_WELL_STATUSES[number];

/**
 * Default selection — reactivation use case (the tool's primary purpose).
 * Producing wells are 200K+ each in TX and overwhelm live-mode pagination,
 * so they're toggled off by default. Easy to enable from the legend.
 */
export const DEFAULT_VISIBLE_STATUSES: WellStatus[] = [
  'Shut-In Oil',
  'Shut-In Gas',
];

/** Color palette per well status. */
export const STATUS_COLORS: Record<string, string> = {
  // Producing — green family (acquisition candidates)
  'Oil Well':                          '#10B981', // emerald
  'Gas Well':                          '#34D399', // lighter emerald
  'Oil/Gas Well':                      '#059669', // darker emerald

  // Shut-in — amber (primary reactivation candidates)
  'Shut-In Oil':                       '#F59E0B',
  'Shut-In Gas':                       '#FBBF24',

  // Permitted — blue (planned/permitted but not yet drilled)
  'Permitted Location':                '#3B82F6',

  // Plugged — dark grays (sealed permanently)
  'Plugged Oil Well':                  '#1F2937',
  'Plugged Gas Well':                  '#374151',
  'Plugged Oil / Gas':                 '#4B5563',

  // Failed / canceled — light grays
  'Dry Hole':                          '#9CA3AF',
  'Canceled / Abandoned Location':     '#D1D5DB',

  // Injection / disposal — violet family
  'Injection / Disposal':              '#8B5CF6',
  'Injection / Disposal from Oil':     '#A78BFA',
  'Injection / Disposal from Gas':     '#C4B5FD',
  'Injection / Disposal from Oil/Gas': '#7C3AED',

  // Observation — light blue
  'Observation Well':                  '#0EA5E9',
};

export function colorForStatus(status: string): string {
  return STATUS_COLORS[status] ?? '#7A756E';
}

interface ArcGisFeature {
  attributes: {
    API?: string;
    GIS_SYMBOL_DESCRIPTION?: string;
    GIS_LAT83?: number;
    GIS_LONG83?: number;
    OBJECTID?: number;
  };
  geometry?: {
    x?: number;
    y?: number;
  };
}

interface ArcGisResponse {
  features?: ArcGisFeature[];
  exceededTransferLimit?: boolean;
  error?: { message?: string };
}

interface FetchOptions {
  statuses: string[];
  bbox?: { lngMin: number; latMin: number; lngMax: number; latMax: number };
  /** Hard cap on total records returned, for safety. Defaults to 50k. */
  maxRecords?: number;
  /** Optional progress callback as pages stream in. */
  onProgress?: (loaded: number) => void;
  signal?: AbortSignal;
}

/**
 * Build the where clause for a status filter list.
 * Returns `1=1` when the list is empty (no filter).
 */
function buildWhere(statuses: string[]): string {
  if (statuses.length === 0) return '1=1';
  const inList = statuses.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');
  return `GIS_SYMBOL_DESCRIPTION IN (${inList})`;
}

/**
 * Fetch one page of wells from RRC.
 */
async function fetchPage(
  where: string,
  offset: number,
  bbox: FetchOptions['bbox'],
  signal?: AbortSignal,
): Promise<{ wells: RrcWell[]; exceededTransferLimit: boolean }> {
  const params = new URLSearchParams({
    where,
    outFields: 'API,GIS_SYMBOL_DESCRIPTION',
    outSR: '4326',
    returnGeometry: 'true',
    f: 'json',
    resultRecordCount: String(RRC_PAGE_SIZE),
    resultOffset: String(offset),
    orderByFields: 'OBJECTID',
  });

  if (bbox) {
    params.set(
      'geometry',
      `${bbox.lngMin},${bbox.latMin},${bbox.lngMax},${bbox.latMax}`,
    );
    params.set('geometryType', 'esriGeometryEnvelope');
    params.set('inSR', '4326');
    params.set('spatialRel', 'esriSpatialRelIntersects');
  }

  const url = `${RRC_WELLS_LAYER}?${params}`;

  const data = await cachedFetch<ArcGisResponse>(
    url,
    async () => {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`RRC query failed: ${res.status}`);
      return res.json();
    },
    TTL_INFRASTRUCTURE,
  );

  if (data.error) {
    throw new Error(data.error.message ?? 'RRC query error');
  }

  const wells: RrcWell[] = (data.features ?? [])
    .map((f) => {
      const a = f.attributes ?? {};
      const lng = f.geometry?.x ?? a.GIS_LONG83 ?? 0;
      const lat = f.geometry?.y ?? a.GIS_LAT83 ?? 0;
      return {
        api: String(a.API ?? ''),
        status: String(a.GIS_SYMBOL_DESCRIPTION ?? 'Unknown'),
        lat,
        lng,
      };
    })
    .filter((w) => w.lat !== 0 && w.lng !== 0);

  return {
    wells,
    exceededTransferLimit: data.exceededTransferLimit === true,
  };
}

/**
 * Fetch wells from RRC with full pagination.
 * Walks `resultOffset` until the layer reports no more pages.
 */
export async function fetchWells(opts: FetchOptions): Promise<{
  wells: RrcWell[];
  truncated: boolean;
}> {
  const { statuses, bbox, maxRecords = 50000, onProgress, signal } = opts;
  const where = buildWhere(statuses);

  const all: RrcWell[] = [];
  let offset = 0;
  let truncated = false;

  // Hard cap on pages so a misbehaving layer can't run away.
  const maxPages = Math.ceil(maxRecords / RRC_PAGE_SIZE);

  for (let i = 0; i < maxPages; i++) {
    const { wells, exceededTransferLimit } = await fetchPage(where, offset, bbox, signal);
    all.push(...wells);
    onProgress?.(all.length);

    if (signal?.aborted) break;
    if (wells.length === 0) break;
    if (!exceededTransferLimit && wells.length < RRC_PAGE_SIZE) break;

    offset += RRC_PAGE_SIZE;

    if (all.length >= maxRecords) {
      truncated = true;
      break;
    }
  }

  return { wells: all, truncated };
}

/** Get total count for a where clause (uses returnCountOnly). */
export async function countWells(opts: {
  statuses: string[];
  bbox?: FetchOptions['bbox'];
}): Promise<number> {
  const where = buildWhere(opts.statuses);
  const params = new URLSearchParams({
    where,
    returnCountOnly: 'true',
    f: 'json',
  });
  if (opts.bbox) {
    params.set(
      'geometry',
      `${opts.bbox.lngMin},${opts.bbox.latMin},${opts.bbox.lngMax},${opts.bbox.latMax}`,
    );
    params.set('geometryType', 'esriGeometryEnvelope');
    params.set('inSR', '4326');
    params.set('spatialRel', 'esriSpatialRelIntersects');
  }
  const url = `${RRC_WELLS_LAYER}?${params}`;
  const data = await cachedFetch<{ count?: number; error?: { message?: string } }>(
    url,
    async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`RRC count failed: ${res.status}`);
      return res.json();
    },
    TTL_INFRASTRUCTURE,
  );
  if (data.error) throw new Error(data.error.message ?? 'RRC count error');
  return data.count ?? 0;
}

/**
 * Read the PMTiles URL/path from Vite env. May be either:
 *  - a full https:// URL (used directly)
 *  - a Firebase Storage path like "well-finder/wells.pmtiles"
 *    (resolved via getDownloadURL in the component)
 *  - empty/missing (live RRC fallback mode)
 */
export function getPmtilesUrl(): string | null {
  const url = import.meta.env.VITE_WELL_FINDER_PMTILES_URL;
  return typeof url === 'string' && url.length > 0 ? url : null;
}

/** True if the configured value is a Firebase Storage path (not a full URL). */
export function isPmtilesPath(value: string): boolean {
  return !/^https?:\/\//i.test(value);
}

/**
 * Lookup a single well's lat/lng/status by API#. Used when a sidebar row is
 * clicked — we need the well's coordinates to fly the map there. Direct
 * RRC ArcGIS query, ~150 ms, free.
 */
export async function lookupWellByApi(api: string): Promise<{
  lat: number;
  lng: number;
  status: string;
} | null> {
  const params = new URLSearchParams({
    where: `API='${api.replace(/'/g, "''")}'`,
    outFields: 'API,GIS_SYMBOL_DESCRIPTION',
    outSR: '4326',
    returnGeometry: 'true',
    f: 'json',
    resultRecordCount: '1',
  });
  const url = `${RRC_WELLS_LAYER}?${params}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as ArcGisResponse;
    if (data.error || !data.features || data.features.length === 0) return null;
    const f = data.features[0];
    const lng = f.geometry?.x ?? f.attributes?.GIS_LONG83;
    const lat = f.geometry?.y ?? f.attributes?.GIS_LAT83;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return {
      lat,
      lng,
      status: String(f.attributes?.GIS_SYMBOL_DESCRIPTION ?? ''),
    };
  } catch {
    return null;
  }
}
