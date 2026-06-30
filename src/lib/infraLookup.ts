/**
 * Power Infrastructure Lookup.
 *
 * Data sources (all public, free):
 * - GeoPlataform: Transmission lines, Power plants
 * - NREL: Solar/wind resource
 * - Built-in: ISO/RTO from coordinates, Utility from line ownership
 *
 * HIFLD (DHS) was shut down Aug 2025. Substations now come from a
 * public ArcGIS mirror with the same schema (75 k+ national records).
 * When NASA NCCS or EIA Atlas come back online, territory lookups
 * can be upgraded to API-based.
 *
 * Substation + transmission-line queries live in ./gridInfraQuery (keyless,
 * Worker-safe) so the public site-score endpoint can reuse them; this module
 * imports them and layers on the browser-coupled sources (NREL, EIA, Census
 * geocode, retail utility).
 */

import type {
  NearbySubstation,
  NearbyLine,
  NearbyPowerPlant,
  SolarWindResource,
  ElectricityPrice,
} from '../types';
import { detectStateFromCoords } from './solarAverages';
import { getStateElectricityAverage } from './electricityAverages';
import { cachedFetch, TTL_LOCATION, TTL_INFRASTRUCTURE } from './requestCache';
import { fetchElectricityPrices, fetchStateGenerationByFuel } from './eiaApi';
import { getStateGenerationFallback } from './stateGenerationAverages';
import { resolveRetailUtility, type RetailUtilityResolution } from './retailUtility';
import {
  haversineMi,
  queryLinesWithGeometry,
  querySubstationsHIFLD,
  extractSubstations,
  mergeSubstations,
  findExpandedGridInfra,
} from './gridInfraQuery';

export interface InfraResult {
  iso: string[];
  /** Transmission owner(s) near the site (legacy "utility territory" — NOT the retail utility). */
  utilityTerritory: string[];
  tsp: string[];
  /** Actual serving retail/distribution utility from service-territory polygons. */
  retailUtility: RetailUtilityResolution | null;
  nearestPoiName: string;
  nearestPoiDistMi: number;
  nearbySubstations: NearbySubstation[];
  nearbyLines: NearbyLine[];
  /** Fallback: ALL substations within the first expanded tier (25/50mi). Set only
   *  when `nearbySubstations` is empty (the ~10mi screen found nothing). Kept
   *  separate from `nearbySubstations` so customer-facing synthesis doesn't treat
   *  far grid as adjacent. */
  expandedSubstations?: NearbySubstation[];
  /** Radius (mi) the expanded substations were found at. */
  expandedSubstationRadiusMi?: number;
  /** Fallback: ALL transmission lines within the first expanded tier (each carries
   *  `distanceMi`). Set only when `nearbyLines` is empty. */
  expandedLines?: NearbyLine[];
  /** Radius (mi) the expanded lines were found at. */
  expandedLineRadiusMi?: number;
  nearbyPowerPlants: NearbyPowerPlant[];
  floodZone: null;
  solarWind: SolarWindResource | null;
  electricityPrice: ElectricityPrice | null;
  stateGenerationByFuel: Record<string, number> | null;
  detectedState: string | null;
  linesError: string | null;
  plantsError: string | null;
  solarError: string | null;
}

// ── Endpoints ───────────────────────────────────────────────────────────────

const GEOPLATFORM = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services';

const LAYERS = {
  powerPlants: `${GEOPLATFORM}/Power_Plants_in_the_US/FeatureServer/0`,
} as const;

const GEOCODE_URL =
  'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

// Routed through the Cloudflare Worker (prod) / Vite dev proxy at /api/nrel so the
// NREL (api.data.gov) key is injected server-side and never ships in the client bundle.
const NREL_SOLAR_URL = '/api/nrel/api/solar/solar_resource/v1.json';

const PLANT_LAT_OFFSET = 1.087; // ~75 miles — power plants screen a wider area to capture deliverable generation in the same load pocket

// ── ISO/RTO from coordinates ────────────────────────────────────────────────
// There are only 7 ISOs + 2 non-ISO regions in the continental US.
// Simple coordinate-based lookup is ~95%+ accurate for due diligence screening.

interface IsoRegion {
  name: string;
  /** Returns true if the point is inside this region. State is the resolved
   *  two-letter abbreviation from reverse-geocoding (FCC Block API or
   *  BigDataCloud/Nominatim) — null if resolution failed. */
  contains: (lat: number, lng: number, state: string | null) => boolean;
}

const ISO_REGIONS: IsoRegion[] = [
  {
    // ERCOT is intra-Texas only — gate on resolved state so OK/AR/LA border
    // sites aren't claimed by the bounding box. The polygon still narrows
    // within TX so panhandle/El Paso/east-TX carve-outs fall through to
    // SPP/WECC/MISO respectively.
    name: 'ERCOT',
    contains: (lat, lng, state) =>
      state === 'TX' &&
      lat >= 26 &&
      lat <= 34.5 &&
      lng >= -104 &&
      lng <= -94 &&
      // Exclude El Paso area
      !(lng < -104.5) &&
      // Exclude Texas panhandle (above ~34° and west of -100°)
      !(lat > 34 && lng < -100) &&
      // Rough eastern TX: ERCOT boundary cuts in around Texarkana
      !(lat > 33 && lng > -94.5),
  },
  {
    // CAISO covers most of California
    name: 'CAISO',
    contains: (lat, lng) =>
      lat >= 32.5 &&
      lat <= 42 &&
      lng >= -124.5 &&
      lng <= -114.5 &&
      // Rough CA shape — exclude Nevada side
      lng < -115.5,
  },
  {
    // NYISO covers New York state
    name: 'NYISO',
    contains: (lat, lng) => lat >= 40.5 && lat <= 45.1 && lng >= -79.8 && lng <= -71.8,
  },
  {
    // ISO-NE covers New England (CT, MA, ME, NH, RI, VT)
    name: 'ISO-NE',
    contains: (lat, lng) => lat >= 41 && lat <= 47.5 && lng >= -73.7 && lng <= -66.9,
  },
  {
    // PJM covers Mid-Atlantic + Ohio Valley
    // DE, DC, IL (partial), IN (partial), KY (partial), MD, MI (partial),
    // NJ, NC (partial), OH, PA, TN (partial), VA, WV
    name: 'PJM',
    contains: (lat, lng) =>
      lat >= 36 &&
      lat <= 42.5 &&
      lng >= -85.5 &&
      lng <= -74 &&
      // Exclude NY
      !(lat > 40.5 && lng > -74.5 && lng < -71.8),
  },
  {
    // MISO covers Midwest + Louisiana/Mississippi
    // Spans from Montana to Louisiana
    name: 'MISO',
    contains: (lat, lng) =>
      // Northern MISO: Upper Midwest
      ((lat >= 37 && lat <= 49 && lng >= -104 && lng <= -82.5) ||
        // Southern MISO: Louisiana, Mississippi, parts of AR/TX
        (lat >= 29 && lat < 37 && lng >= -97 && lng <= -88)) &&
      // Exclude PJM overlap
      !(lat >= 36 && lat <= 42.5 && lng >= -85.5 && lng <= -74) &&
      // Exclude ERCOT Texas
      !(lat >= 26 && lat <= 34.5 && lng >= -104 && lng <= -94),
  },
  {
    // SPP covers Kansas, Oklahoma, parts of surrounding states
    name: 'SPP',
    contains: (lat, lng) =>
      lat >= 33 &&
      lat <= 43 &&
      lng >= -104 &&
      lng <= -93 &&
      // Exclude ERCOT Texas
      !(lat < 34 && lng > -100) &&
      // Exclude MISO overlap in upper plains
      !(lat > 43),
  },
];

export function detectIso(state: string | null, lat: number, lng: number): string {
  for (const region of ISO_REGIONS) {
    if (region.contains(lat, lng, state)) return region.name;
  }
  // Default for western US outside CAISO
  if (lng < -104) return 'WECC';
  // Default for southeast
  if (lat < 37 && lng > -90) return 'SERC';
  return '';
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function plantEnvelope(lat: number, lng: number): string {
  const lo = (PLANT_LAT_OFFSET / Math.cos((lat * Math.PI) / 180)) * Math.cos((30 * Math.PI) / 180);
  return `${lng - lo},${lat - PLANT_LAT_OFFSET},${lng + lo},${lat + PLANT_LAT_OFFSET}`;
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
  const key = `geocode:${address.trim().toLowerCase()}`;
  return cachedFetch(
    key,
    async () => {
      const params = new URLSearchParams({
        singleLine: address,
        outFields: 'Match_addr',
        maxLocations: '1',
        f: 'json',
      });
      const res = await fetch(`${GEOCODE_URL}?${params}`);
      if (!res.ok) throw new Error(`Geocode request failed (${res.status})`);
      const data = await res.json();
      if (!data.candidates?.length) {
        throw new Error('Address could not be geocoded — check the address and try again.');
      }
      return { lat: data.candidates[0].location.y, lng: data.candidates[0].location.x };
    },
    TTL_INFRASTRUCTURE,
  );
}

// ── Queries ─────────────────────────────────────────────────────────────────

async function queryPowerPlants(lat: number, lng: number): Promise<NearbyPowerPlant[]> {
  const key = `infra:plants:75mi:${lat.toFixed(3)},${lng.toFixed(3)}`;
  return cachedFetch(
    key,
    async () => {
      const url =
        `${LAYERS.powerPlants}/query?` +
        `where=1%3D1` +
        `&geometry=${encodeURIComponent(plantEnvelope(lat, lng))}` +
        `&geometryType=esriGeometryEnvelope` +
        `&spatialRel=esriSpatialRelIntersects` +
        `&inSR=4326` +
        `&outFields=Plant_Name%2CPrimSource%2CInstall_MW%2CTotal_MW%2CUtility_Na%2CLatitude%2CLongitude` +
        `&returnGeometry=false` +
        `&resultRecordCount=100` +
        `&f=json`;

      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`[infra] Power plants query HTTP ${res.status} for ${lat},${lng}`);
          return [];
        }
        const data = await res.json();
        if (data.error) {
          console.warn('[infra] Power plants query returned error:', data.error);
          return [];
        }
        return (data.features ?? [])
          .map((f: { attributes: Record<string, unknown> }) => {
            const a = f.attributes;
            const pLat = Number(a.Latitude) || 0;
            const pLng = Number(a.Longitude) || 0;
            return {
              name: String(a.Plant_Name ?? ''),
              operator: String(a.Utility_Na ?? ''),
              primarySource: String(a.PrimSource ?? ''),
              capacityMW: Number(a.Install_MW) || 0,
              status: 'OP',
              distanceMi: haversineMi(lat, lng, pLat, pLng),
            } satisfies NearbyPowerPlant;
          })
          .sort((a: NearbyPowerPlant, b: NearbyPowerPlant) => a.distanceMi - b.distanceMi);
      } catch (err) {
        console.warn('[infra] Power plants fetch failed:', err);
        return [];
      }
    },
    TTL_LOCATION,
  );
}

/** Derive utility territory from most common line/substation owners. */
function deriveUtility(lines: NearbyLine[]): string[] {
  const counts = new Map<string, number>();
  for (const line of lines) {
    if (!line.owner || line.owner === 'NOT AVAILABLE') continue;
    counts.set(line.owner, (counts.get(line.owner) ?? 0) + 1);
  }
  // Sort by frequency, return top owners
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

async function querySolarWind(lat: number, lng: number): Promise<SolarWindResource | null> {
  const key = `nrel:solar:${lat.toFixed(3)},${lng.toFixed(3)}`;
  return cachedFetch(
    key,
    async () => {
      try {
        const params = new URLSearchParams({
          lat: String(lat),
          lon: String(lng),
        });
        const res = await fetch(`${NREL_SOLAR_URL}?${params}`);
        if (!res.ok) {
          console.warn(
            `NREL Solar API returned ${res.status} via the /api/nrel proxy — check the Worker's VITE_NREL_API_KEY secret or retry later.`,
          );
          return null;
        }
        const data = await res.json();
        const o = data.outputs;
        if (!o) return null;
        return {
          ghi: Number(o.avg_ghi?.annual) || 0,
          dni: Number(o.avg_dni?.annual) || 0,
          windSpeed: Number(o.avg_wind_speed?.annual) || 0,
          capacity: Number(o.avg_lat_tilt?.annual) || 0,
        };
      } catch {
        return null;
      }
    },
    TTL_INFRASTRUCTURE,
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export interface LookupOptions {
  coordinates?: { lat: number; lng: number };
  address?: string;
}

export async function lookupInfrastructure(opts: LookupOptions): Promise<InfraResult> {
  let { lat, lng } = opts.coordinates ?? { lat: 0, lng: 0 };

  if (!opts.coordinates || (lat === 0 && lng === 0)) {
    if (!opts.address) throw new Error('Provide an address or coordinates.');
    ({ lat, lng } = await geocodeAddress(opts.address));
  }

  const detectedState = await detectStateFromCoords(lat, lng);

  const results = await Promise.allSettled([
    queryLinesWithGeometry(lat, lng),
    queryPowerPlants(lat, lng),
    querySolarWind(lat, lng),
    detectedState ? fetchElectricityPrices(detectedState) : Promise.resolve(null),
    querySubstationsHIFLD(lat, lng),
    detectedState ? fetchStateGenerationByFuel(detectedState) : Promise.resolve(null),
    resolveRetailUtility(lat, lng),
  ]);

  function errMsg(r: PromiseSettledResult<unknown>, fallback: string): string | null {
    return r.status === 'rejected'
      ? r.reason instanceof Error
        ? r.reason.message
        : fallback
      : null;
  }

  const lineFeatures = results[0].status === 'fulfilled' ? results[0].value : [];
  const powerPlants = results[1].status === 'fulfilled' ? results[1].value : [];
  const solarWind = results[2].status === 'fulfilled' ? results[2].value : null;
  const liveElecPrice = results[3].status === 'fulfilled' ? results[3].value : null;
  const hifldSubstations = results[4].status === 'fulfilled' ? results[4].value : [];
  const stateGenResult = results[5].status === 'fulfilled' ? results[5].value : null;
  const retailUtility = results[6].status === 'fulfilled' ? results[6].value : null;

  const lines = lineFeatures.map((f) => f.line);
  // Merge both substation sources for best coverage and accuracy
  const lineSubstations = extractSubstations(lineFeatures, lat, lng);
  const substations = mergeSubstations(lineSubstations, hifldSubstations, lat, lng);
  const iso = detectIso(detectedState, lat, lng);

  // Expanded-radius fallback: when the ~10mi screen returns nothing for
  // substations and/or lines, widen in tiers (25→50mi) and surface ALL grid
  // within the first ring that has results — so remote sites show the full
  // picture + interconnection distances instead of a blank "none nearby".
  const expanded =
    substations.length === 0 || lines.length === 0
      ? await findExpandedGridInfra(lat, lng, {
          needSubstation: substations.length === 0,
          needLine: lines.length === 0,
        })
      : null;

  // Headline fields (Nearest POI, distance, transmission owner) fall back to the
  // expanded results so they don't read "Not Available" when grid exists nearby.
  const effSubs = substations.length > 0 ? substations : (expanded?.expandedSubstations ?? []);
  const effLines = lines.length > 0 ? lines : (expanded?.expandedLines ?? []);
  const nearest = effSubs.find((s) => s.distanceMi > 0) ?? effSubs[0];
  const utilities = deriveUtility(effLines);

  return {
    iso: iso ? [iso] : [],
    utilityTerritory: utilities,
    tsp: utilities.slice(0, 1), // Primary TSP = dominant line owner
    retailUtility,
    nearestPoiName: nearest?.name ?? '',
    nearestPoiDistMi: nearest?.distanceMi ?? 0,
    nearbySubstations: substations,
    nearbyLines: lines,
    ...(expanded
      ? {
          ...(expanded.expandedSubstations.length
            ? {
                expandedSubstations: expanded.expandedSubstations,
                ...(expanded.expandedSubstationRadiusMi != null
                  ? { expandedSubstationRadiusMi: expanded.expandedSubstationRadiusMi }
                  : {}),
              }
            : {}),
          ...(expanded.expandedLines.length
            ? {
                expandedLines: expanded.expandedLines,
                ...(expanded.expandedLineRadiusMi != null
                  ? { expandedLineRadiusMi: expanded.expandedLineRadiusMi }
                  : {}),
              }
            : {}),
        }
      : {}),
    nearbyPowerPlants: powerPlants,
    floodZone: null,
    solarWind,
    electricityPrice: liveElecPrice
      ? {
          commercial: liveElecPrice.commercial,
          industrial: liveElecPrice.industrial,
          allSectors: liveElecPrice.allSectors,
        }
      : (() => {
          const avg = getStateElectricityAverage(detectedState);
          return avg
            ? { commercial: avg.commercial, industrial: avg.industrial, allSectors: avg.allSectors }
            : null;
        })(),
    stateGenerationByFuel:
      stateGenResult?.generationBySource ?? getStateGenerationFallback(detectedState),
    detectedState,
    linesError: errMsg(results[0], 'Transmission lines lookup failed'),
    plantsError: errMsg(results[1], 'Power plants lookup failed'),
    solarError: errMsg(results[2], 'Solar/wind resource lookup failed'),
  };
}
