/**
 * Water Analysis — Phase 1 & 2
 *
 * Data sources (all public, free):
 * Phase 1:
 * - FEMA NFHL ArcGIS REST: Flood zone designation (hazards.fema.gov)
 * - USGS NLDI API: Stream/basin delineation and monitoring stations (api.water.usgs.gov/nldi)
 * - USFWS NWI ArcGIS REST: National Wetlands Inventory (fwspublicservices.wim.usgs.gov)
 *
 * Phase 2:
 * - USGS NWIS IV: Groundwater monitoring wells (waterservices.usgs.gov) — CORS ✓
 * - ESRI Live Feed: US Drought Intensity current conditions — CORS ✓
 * - EPA ECHO: NPDES discharge permits (echodata.epa.gov) — CORS ✓ (2-step)
 * - NOAA ACIS: Historical precipitation (data.rcc-acis.org) — CORS ✓
 *
 * CORS notes:
 * - FEMA NFHL: does NOT support CORS — proxied via Vite dev server (/api/fema)
 *   and Cloudflare Worker in production (functions/worker.ts).
 * - USGS NLDI: supports CORS natively ✓
 * - USFWS NWI: does NOT support CORS — proxied via Vite dev server (/api/nwi)
 *   and Cloudflare Worker in production (functions/worker.ts).
 */

import type {
  DischargePermit,
  DischargePermitsInfo,
  DroughtInfo,
  DroughtLevel,
  FloodRiskLevel,
  FloodZoneInfo,
  GroundwaterInfo,
  GroundwaterWell,
  MonitoringStation,
  PrecipitationInfo,
  StreamInfo,
  WaterAnalysisResult,
  WetlandFeature,
  WetlandsInfo,
} from './waterAnalysis.types';
import { geocodeAddress } from './infraLookup';
import { cachedFetch, TTL_INFRASTRUCTURE, TTL_LOCATION, TTL_SHORT } from './requestCache';

// ── FEMA NFHL ───────────────────────────────────────────────────────────────

/**
 * FEMA National Flood Hazard Layer — Flood Hazard Area sublayer (28).
 * MapServer 28 = S_FLD_HAZ_AR (Flood Hazard Areas)
 *
 * Proxied because hazards.fema.gov does not send CORS headers:
 *   dev → Vite proxy (/api/fema)
 *   prod → Cloudflare Worker (functions/worker.ts)
 */
const FEMA_NFHL_URL =
  '/api/fema/rest/services/public/NFHL/MapServer/28/query';
const FEMA_TIMEOUT_MS = 30000;
const FEMA_MAX_RETRIES = 3;
const FEMA_RETRY_DELAY_MS = 1500;

const FLOOD_ZONE_DESCRIPTIONS: Record<string, string> = {
  X: 'Minimal flood hazard — outside of the 0.2% annual chance floodplain',
  B: 'Moderate flood hazard — between the limits of the base flood and the 0.2% annual chance flood',
  C: 'Minimal flood hazard — above the 0.2% annual chance floodplain',
  A: 'Special Flood Hazard Area — 1% annual chance flood (100-year floodplain), no BFE',
  AE: 'Special Flood Hazard Area — 1% annual chance flood with Base Flood Elevations determined',
  AH: 'Special Flood Hazard Area — 1% annual chance shallow flooding (ponding), with BFE',
  AO: 'Special Flood Hazard Area — 1% annual chance shallow flooding (sheet flow), depth specified',
  AR: 'Special Flood Hazard Area — flood hazard due to levee system restoration',
  VE: 'Coastal High Hazard Area — 1% annual chance flood with wave action, with BFE',
  V: 'Coastal High Hazard Area — 1% annual chance flood with wave action, no BFE',
  D: 'Undetermined flood hazard — possible but not studied',
};

/** Derive a plain-language description, handling A1–A30 and V1–V30 zones. */
function describeZone(zone: string): string {
  const base = FLOOD_ZONE_DESCRIPTIONS[zone];
  if (base) return base;

  if (/^A\d+$/.test(zone)) {
    return 'Special Flood Hazard Area — 1% annual chance flood with Base Flood Elevations (numbered zone)';
  }
  if (/^V\d+$/.test(zone)) {
    return 'Coastal High Hazard Area — 1% annual chance flood with wave action (numbered zone)';
  }

  return `Flood zone ${zone} — consult local floodplain administrator for details`;
}

function classifyFloodRisk(zone: string, subtype: string): FloodRiskLevel {
  if (!zone || zone === 'AREA NOT INCLUDED') return 'unknown';

  if (zone === 'VE' || /^V\d+$/.test(zone) || zone === 'V') return 'very-high';

  if (zone === 'A' || /^A\d+$/.test(zone) || zone === 'AE' || zone === 'AH' ||
      zone === 'AO' || zone === 'AR') return 'high';

  if (subtype === 'FLOODWAY') return 'very-high';

  if (zone === 'B' || zone === 'D') return 'moderate';

  if (zone === 'X' && subtype && subtype.includes('0.2')) return 'moderate';

  if (zone === 'X' || zone === 'C') return 'minimal';

  return 'unknown';
}

async function fetchFloodZone(lat: number, lng: number): Promise<FloodZoneInfo> {
  return cachedFetch(
    `water:flood:${lat.toFixed(3)},${lng.toFixed(3)}`,
    async () => {
      const params = new URLSearchParams({
        geometry: `${lng},${lat}`,
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: 'FLD_ZONE,ZONE_SUBTY,STATIC_BFE',
        returnGeometry: 'false',
        f: 'json',
      });

      let lastError: Error | null = null;
      const fullUrl = `${FEMA_NFHL_URL}?${params}`;
      console.log(`[FEMA] Starting fetch for ${lat.toFixed(3)},${lng.toFixed(3)} → ${fullUrl}`);

      for (let attempt = 1; attempt <= FEMA_MAX_RETRIES; attempt++) {
        const t0 = performance.now();
        try {
          const res = await fetch(fullUrl, {
            signal: AbortSignal.timeout(FEMA_TIMEOUT_MS),
          });
          console.log(`[FEMA] Attempt ${attempt}: HTTP ${res.status} after ${Math.round(performance.now() - t0)}ms`);
          if (!res.ok) throw new Error(`FEMA NFHL returned HTTP ${res.status}`);

          const data = await res.json();
          if (data.error) throw new Error(`FEMA NFHL error: ${data.error.message}`);

          if (!data.features || data.features.length === 0) {
            return {
              zone: 'UNMAPPED',
              zoneSubtype: '',
              staticBfe: null,
              riskLevel: 'unknown' as FloodRiskLevel,
              description: 'No FEMA flood zone data available for this location. The area may be unmapped.',
            };
          }

          const a = data.features[0].attributes as Record<string, unknown>;
          const zone = String(a.FLD_ZONE ?? 'UNKNOWN').trim();
          const zoneSubtype = String(a.ZONE_SUBTY ?? '').trim();
          const bfeRaw = a.STATIC_BFE;
          const staticBfe = bfeRaw != null && Number(bfeRaw) > -9000 ? Number(bfeRaw) : null;
          const riskLevel = classifyFloodRisk(zone, zoneSubtype);
          const description = describeZone(zone);

          if (attempt > 1) console.log(`[FEMA] Succeeded on attempt ${attempt}/${FEMA_MAX_RETRIES}`);
          return { zone, zoneSubtype, staticBfe, riskLevel, description };
        } catch (err) {
          const elapsed = Math.round(performance.now() - t0);
          lastError = err instanceof Error ? err : new Error(String(err));
          const errName = err instanceof Error ? err.name : 'Unknown';
          console.warn(`[FEMA] Attempt ${attempt}/${FEMA_MAX_RETRIES} failed after ${elapsed}ms — name=${errName} message="${lastError.message}"`);
          if (attempt < FEMA_MAX_RETRIES) {
            console.warn(`[FEMA] Retrying in ${FEMA_RETRY_DELAY_MS}ms...`);
            await new Promise((r) => setTimeout(r, FEMA_RETRY_DELAY_MS));
          }
        }
      }

      console.error(`[FEMA] All ${FEMA_MAX_RETRIES} attempts failed. Final error:`, lastError);
      throw lastError ?? new Error('FEMA NFHL unavailable');
    },
    TTL_LOCATION,
  );
}

// ── USGS NLDI ───────────────────────────────────────────────────────────────

const NLDI_BASE = 'https://api.water.usgs.gov/nldi/linked-data';

interface NldiComidResponse {
  features?: Array<{
    properties: {
      comid?: string | number;
      name?: string;
      reachcode?: string;
      streamleve?: number;
      [key: string]: unknown;
    };
  }>;
}

interface NldiStationFeature {
  properties: {
    identifier?: string;
    name?: string;
    type?: string;
    [key: string]: unknown;
  };
}

async function fetchStreamData(lat: number, lng: number): Promise<StreamInfo> {
  return cachedFetch(
    `water:stream:${lat.toFixed(3)},${lng.toFixed(3)}`,
    async () => {
      const positionUrl =
        `${NLDI_BASE}/comid/position?coords=POINT(${lng}%20${lat})`;

      let comid: string | null = null;
      let streamName: string | null = null;
      let reachCode: string | null = null;
      let streamOrder: number | null = null;

      try {
        const posRes = await fetch(positionUrl, { signal: AbortSignal.timeout(15000) });
        if (posRes.ok) {
          const posData = (await posRes.json()) as NldiComidResponse;
          const feature = posData.features?.[0];
          if (feature) {
            comid = feature.properties.comid != null
              ? String(feature.properties.comid)
              : null;
            streamName = feature.properties.name || null;
            reachCode = feature.properties.reachcode || null;
            streamOrder = typeof feature.properties.streamleve === 'number'
              ? feature.properties.streamleve
              : null;
          }
        }
      } catch { /* NLDI position query failed — continue */ }

      if (!comid) {
        return {
          comid: null,
          streamName: null,
          reachCode: null,
          streamOrder: null,
          basinAreaKm2: null,
          navigationStatus: 'not-found',
          monitoringStations: [],
        };
      }

      const [basinAreaKm2, monitoringStations] = await Promise.all([
        fetchBasinArea(comid),
        fetchMonitoringStations(comid),
      ]);

      return {
        comid,
        streamName,
        reachCode,
        streamOrder,
        basinAreaKm2,
        navigationStatus: 'found',
        monitoringStations,
      };
    },
    TTL_LOCATION,
  );
}

async function fetchBasinArea(comid: string): Promise<number | null> {
  try {
    const url = `${NLDI_BASE}/comid/${comid}/basin?simplified=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;

    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) return null;

    const areaSqKm = feature.properties?.areasqkm ?? feature.properties?.AreaSqKm ?? null;
    return areaSqKm != null ? Number(areaSqKm) : null;
  } catch {
    return null;
  }
}

async function fetchMonitoringStations(comid: string): Promise<MonitoringStation[]> {
  try {
    const url = `${NLDI_BASE}/comid/${comid}/navigate/UT/nwissite?distance=50`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];

    const data = await res.json();
    const features: NldiStationFeature[] = data.features ?? [];

    return features.slice(0, 5).map((f) => {
      const id = String(f.properties.identifier ?? f.properties.name ?? '');
      const name = String(f.properties.name ?? id);
      const type = String(f.properties.type ?? 'USGS Stream Gauge');
      return {
        identifier: id,
        name,
        type,
        url: id
          ? `https://waterdata.usgs.gov/nwis/uv?site_no=${id.replace(/^USGS-/, '')}`
          : 'https://waterdata.usgs.gov',
      };
    });
  } catch {
    return [];
  }
}

// ── NWI Wetlands ─────────────────────────────────────────────────────────────

/**
 * USFWS National Wetlands Inventory ArcGIS REST service.
 * Layer 0 = Wetlands polygons.
 * Buffer: ~500 feet (~0.0023 degrees latitude).
 */
/**
 * Proxied through Vite dev server to avoid CORS.
 * Vite proxy: /api/nwi → https://fwspublicservices.wim.usgs.gov
 */
const NWI_URL =
  '/api/nwi/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query';

const BUFFER_DEG = 0.0023;

function decodeWetlandType(attribute: string): string {
  if (!attribute) return 'Unknown Wetland';

  const code = attribute.toUpperCase();

  if (code.startsWith('PEM')) return 'Palustrine Emergent Marsh';
  if (code.startsWith('PFO')) return 'Palustrine Forested Wetland';
  if (code.startsWith('PSS')) return 'Palustrine Scrub-Shrub Wetland';
  if (code.startsWith('PAB')) return 'Palustrine Aquatic Bed';
  if (code.startsWith('PUB')) return 'Palustrine Unconsolidated Bottom';
  if (code.startsWith('POW')) return 'Palustrine Open Water';
  if (code.startsWith('L'))   return 'Lacustrine (Lake) Wetland';
  if (code.startsWith('REM')) return 'Riverine Emergent';
  if (code.startsWith('ROW') || code.startsWith('RUB')) return 'Riverine Open Water / Streambed';
  if (code.startsWith('R'))   return 'Riverine Wetland';
  if (code.startsWith('E'))   return 'Estuarine Wetland';
  if (code.startsWith('M'))   return 'Marine Wetland';

  return `Wetland (${attribute})`;
}

/**
 * The NWI MapServer is notoriously slow and frequently returns 500/503.
 * We retry up to 3 times with a 2-second delay between attempts.
 */
const NWI_TIMEOUT_MS = 20_000;
const NWI_MAX_RETRIES = 3;
const NWI_RETRY_DELAY_MS = 2_000;

async function fetchWetlands(lat: number, lng: number): Promise<WetlandsInfo> {
  return cachedFetch(
    `water:wetlands:${lat.toFixed(3)},${lng.toFixed(3)}`,
    async () => {
      const envelope = `${lng - BUFFER_DEG},${lat - BUFFER_DEG},${lng + BUFFER_DEG},${lat + BUFFER_DEG}`;

      const params = new URLSearchParams({
        geometry: envelope,
        geometryType: 'esriGeometryEnvelope',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: 'Wetlands.ATTRIBUTE,Wetlands.WETLAND_TYPE,Wetlands.ACRES',
        returnGeometry: 'false',
        resultRecordCount: '20',
        f: 'json',
      });

      const NWI_MANUAL_LINK = 'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer';

      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= NWI_MAX_RETRIES; attempt++) {
        try {
          const res = await fetch(`${NWI_URL}?${params}`, {
            signal: AbortSignal.timeout(NWI_TIMEOUT_MS),
          });

          if (!res.ok) {
            lastError = new Error(`NWI returned HTTP ${res.status}`);
            if (attempt < NWI_MAX_RETRIES) {
              console.warn(`[NWI] Attempt ${attempt}/${NWI_MAX_RETRIES} failed (HTTP ${res.status}), retrying in ${NWI_RETRY_DELAY_MS}ms...`);
              await new Promise((r) => setTimeout(r, NWI_RETRY_DELAY_MS));
              continue;
            }
            throw new Error(`NWI service unavailable after ${NWI_MAX_RETRIES} attempts — verify wetlands manually at ${NWI_MANUAL_LINK}`);
          }

          // The NWI service sometimes returns HTML error pages instead of JSON
          const text = await res.text();
          if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
            lastError = new Error('NWI returned HTML instead of JSON');
            if (attempt < NWI_MAX_RETRIES) {
              console.warn(`[NWI] Attempt ${attempt}/${NWI_MAX_RETRIES} returned HTML, retrying in ${NWI_RETRY_DELAY_MS}ms...`);
              await new Promise((r) => setTimeout(r, NWI_RETRY_DELAY_MS));
              continue;
            }
            throw new Error(`NWI service temporarily unavailable after ${NWI_MAX_RETRIES} attempts — verify wetlands manually at ${NWI_MANUAL_LINK}`);
          }

          const data = JSON.parse(text);
          if (data.error) throw new Error(`NWI error: ${data.error.message}`);

          if (!data.features || data.features.length === 0) {
            return { hasWetlands: false, wetlands: [], nearestWetlandFt: null };
          }

          const wetlands: WetlandFeature[] = [];
          const bufferFt = Math.round(BUFFER_DEG * 364000); // ~500 ft

          for (const f of data.features) {
            const a = f.attributes as Record<string, unknown>;
            const attribute = String(a['Wetlands.ATTRIBUTE'] ?? a.ATTRIBUTE ?? '');
            const wetlandType = String(a['Wetlands.WETLAND_TYPE'] ?? a.WETLAND_TYPE ?? '') || decodeWetlandType(attribute);
            const rawAcres = a['Wetlands.ACRES'] ?? a.ACRES;
            const acres = rawAcres != null ? Number(rawAcres) : null;

            wetlands.push({ attribute, wetlandType: wetlandType || decodeWetlandType(attribute), acres, distanceFt: bufferFt });
          }

          if (attempt > 1) console.log(`[NWI] Succeeded on attempt ${attempt}/${NWI_MAX_RETRIES}`);
          return { hasWetlands: true, wetlands, nearestWetlandFt: bufferFt };

        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < NWI_MAX_RETRIES) {
            console.warn(`[NWI] Attempt ${attempt}/${NWI_MAX_RETRIES} failed (${lastError.message}), retrying in ${NWI_RETRY_DELAY_MS}ms...`);
            await new Promise((r) => setTimeout(r, NWI_RETRY_DELAY_MS));
          }
        }
      }

      throw lastError ?? new Error('NWI service unavailable');
    },
    TTL_SHORT,
  );
}

// ── Phase 2: USGS Groundwater Monitoring ─────────────────────────────────────

/**
 * USGS NWIS Instantaneous Values service.
 * Parameter 72019 = depth to water level (ft below land surface).
 * Uses bBox query to find active GW monitoring wells near the site.
 * CORS: Access-Control-Allow-Origin: * ✓
 */
const USGS_IV_URL = 'https://waterservices.usgs.gov/nwis/iv/';

async function fetchGroundwaterData(lat: number, lng: number): Promise<GroundwaterInfo> {
  return cachedFetch(
    `water:groundwater:${lat.toFixed(3)},${lng.toFixed(3)}`,
    async () => {
      const bboxPad = 0.5;
      // Round to 5 decimals — USGS NWIS rejects bBox coords with excessive
      // precision (e.g. float artifacts like 31.820050000000002) as HTTP 400.
      const fmt = (n: number) => (Math.round(n * 1e5) / 1e5).toString();
      const bbox = `${fmt(lng - bboxPad)},${fmt(lat - bboxPad)},${fmt(lng + bboxPad)},${fmt(lat + bboxPad)}`;

      // Use last 90 days of data to ensure we get recent readings
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 90);
      const startDT = startDate.toISOString().split('T')[0];
      const endDT = endDate.toISOString().split('T')[0];

      const params = new URLSearchParams({
        format: 'json',
        bBox: bbox,
        parameterCd: '72019',
        siteType: 'GW',
        siteStatus: 'active',
        startDT,
        endDT,
      });

      const res = await fetch(`${USGS_IV_URL}?${params}`, {
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`USGS NWIS returned HTTP ${res.status}`);

      const data = await res.json();
      const timeSeries: Array<Record<string, unknown>> = data?.value?.timeSeries ?? [];

      if (timeSeries.length === 0) {
        return { wells: [], wellCount: 0 };
      }

      const wells: GroundwaterWell[] = timeSeries.slice(0, 10).map((series) => {
        const sourceInfo = series.sourceInfo as Record<string, unknown>;
        const siteName = String(sourceInfo?.siteName ?? '');
        const siteCode = (sourceInfo?.siteCode as Array<{ value: string }>)?.[0]?.value ?? '';
        const values = (series.values as Array<{ value: Array<{ value: string; dateTime: string }> }>)?.[0]?.value ?? [];

        // Find the latest non-null, non-sentinel reading
        let depthToWaterFt: number | null = null;
        let measurementDate: string | null = null;
        for (let i = values.length - 1; i >= 0; i--) {
          const v = values[i];
          const num = parseFloat(v.value);
          if (!isNaN(num) && num > -999000) {
            depthToWaterFt = num;
            measurementDate = v.dateTime ?? null;
            break;
          }
        }

        return {
          siteNo: siteCode,
          name: siteName,
          depthToWaterFt,
          measurementDate,
          url: siteCode
            ? `https://waterdata.usgs.gov/nwis/uv?site_no=${siteCode}`
            : 'https://waterdata.usgs.gov',
        };
      });

      return { wells, wellCount: timeSeries.length };
    },
    TTL_LOCATION,
  );
}

// ── Phase 2: US Drought Monitor ──────────────────────────────────────────────

/**
 * ESRI ArcGIS Online: US Drought Intensity — Current Conditions live feed.
 * Layer 3 = current weekly USDM snapshot.
 * Source: esri_livefeeds2 (public, no auth required)
 * CORS: Access-Control-Allow-Origin: * ✓
 */
const DROUGHT_LAYER_URL =
  'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/US_Drought_Intensity_v1/FeatureServer/3/query';

const DROUGHT_LABELS: Record<number, string> = {
  0: 'D0 — Abnormally Dry',
  1: 'D1 — Moderate Drought',
  2: 'D2 — Severe Drought',
  3: 'D3 — Extreme Drought',
  4: 'D4 — Exceptional Drought',
};

function dmToLevel(dm: number): DroughtLevel {
  const map: Record<number, DroughtLevel> = { 0: 'D0', 1: 'D1', 2: 'D2', 3: 'D3', 4: 'D4' };
  return map[dm] ?? 'none';
}

async function fetchDroughtData(lat: number, lng: number): Promise<DroughtInfo> {
  return cachedFetch(
    `water:drought:${lat.toFixed(3)},${lng.toFixed(3)}`,
    async () => {
      const geometry = JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } });

      const params = new URLSearchParams({
        geometry,
        geometryType: 'esriGeometryPoint',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: 'dm,ddate',
        returnGeometry: 'false',
        f: 'json',
      });

      const res = await fetch(`${DROUGHT_LAYER_URL}?${params}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Drought layer returned HTTP ${res.status}`);

      const data = await res.json();
      if (data.error) throw new Error(`Drought query error: ${data.error.message ?? data.error.code}`);

      const features: Array<{ attributes: Record<string, unknown> }> = data.features ?? [];

      if (features.length === 0) {
        // No drought polygon = no drought conditions
        return {
          currentLevel: 'none',
          levelLabel: 'No Drought',
          measureDate: '',
        };
      }

      const attrs = features[0].attributes;
      const dm = typeof attrs.dm === 'number' ? attrs.dm : parseInt(String(attrs.dm ?? '-1'), 10);
      const ddateMs = typeof attrs.ddate === 'number' ? attrs.ddate : null;

      const measureDate = ddateMs
        ? new Date(ddateMs).toISOString().split('T')[0]
        : '';

      const currentLevel = dm >= 0 ? dmToLevel(dm) : 'none';
      const levelLabel = dm >= 0 ? (DROUGHT_LABELS[dm] ?? `D${dm}`) : 'No Drought';

      return { currentLevel, levelLabel, measureDate };
    },
    TTL_LOCATION,
  );
}

// ── Phase 2: EPA ECHO Discharge Permits ──────────────────────────────────────

/**
 * EPA ECHO CWA REST services.
 * Two-step: get_facilities returns a QueryID, then get_qid retrieves facilities.
 * CORS: both endpoints return Access-Control-Allow-Origin headers ✓
 */
const ECHO_BASE = 'https://echodata.epa.gov/echo';
const ECHO_RADIUS_MI = 10;

async function fetchDischargePermits(lat: number, lng: number): Promise<DischargePermitsInfo> {
  return cachedFetch(
    `water:permits:${lat.toFixed(3)},${lng.toFixed(3)}`,
    async () => {
      // Step 1: query to get a QueryID
      const step1Params = new URLSearchParams({
        output: 'JSON',
        p_lat: String(lat),
        p_long: String(lng),
        p_radius: String(ECHO_RADIUS_MI),
      });

      const step1Res = await fetch(`${ECHO_BASE}/cwa_rest_services.get_facilities?${step1Params}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!step1Res.ok) throw new Error(`EPA ECHO get_facilities returned HTTP ${step1Res.status}`);

      const step1Data = await step1Res.json();
      const results1 = step1Data?.Results ?? {};
      const queryId: string = String(results1.QueryID ?? '');
      const totalCount = parseInt(String(results1.QueryRows ?? '0'), 10);

      if (!queryId) throw new Error('EPA ECHO did not return a QueryID');

      if (totalCount === 0) {
        return { permits: [], totalCount: 0, radiusMi: ECHO_RADIUS_MI };
      }

      // Step 2: retrieve actual facilities using the QueryID
      const step2Params = new URLSearchParams({
        qid: queryId,
        pageno: '1',
        output: 'JSON',
      });

      const step2Res = await fetch(`${ECHO_BASE}/cwa_rest_services.get_qid?${step2Params}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!step2Res.ok) throw new Error(`EPA ECHO get_qid returned HTTP ${step2Res.status}`);

      const step2Data = await step2Res.json();
      const facilities: Array<Record<string, unknown>> = step2Data?.Results?.Facilities ?? [];

      const permits: DischargePermit[] = facilities
        .slice(0, 10)
        .map((f) => ({
          facilityName: String(f.CWPName ?? f.FacName ?? ''),
          permitNumber: String(f.MasterExternalPermitNmbr ?? f.SourceID ?? ''),
          permitStatus: String(f.CWPPermitStatusDesc ?? ''),
          city: String(f.CWPCity ?? f.FacCity ?? ''),
          state: String(f.CWPState ?? f.FacState ?? ''),
        }))
        .filter((p) => p.facilityName || p.permitNumber);

      return { permits, totalCount, radiusMi: ECHO_RADIUS_MI };
    },
    TTL_LOCATION,
  );
}

// ── Phase 2: Historical Precipitation ────────────────────────────────────────

/**
 * NOAA Regional Climate Centers Applied Climate Information System (ACIS).
 * Grid 1 = PRISM 800m climatological analysis.
 * Returns daily precipitation (inches) — we aggregate to annual averages.
 * CORS: Access-Control-Allow-Origin: * ✓
 */
const ACIS_URL = 'https://data.rcc-acis.org/GridData';
const PRECIP_YEARS = 10;

async function fetchPrecipitation(lat: number, lng: number): Promise<PrecipitationInfo> {
  return cachedFetch(
    `water:precip:${lat.toFixed(3)},${lng.toFixed(3)}`,
    async () => {
      const endYear = new Date().getFullYear() - 1; // last completed year
      const startYear = endYear - PRECIP_YEARS + 1;
      const sdate = `${startYear}-01-01`;
      const edate = `${endYear}-12-31`;

      const params = new URLSearchParams({
        loc: `${lng},${lat}`,
        grid: '1',
        sdate,
        edate,
        elems: 'pcpn',
      });

      const res = await fetch(`${ACIS_URL}?${params}`, {
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`NOAA ACIS returned HTTP ${res.status}`);

      const data = await res.json();
      const records: Array<[string, number | string | null]> = data?.data ?? [];

      if (records.length === 0) {
        throw new Error('NOAA ACIS returned no precipitation data for this location');
      }

      // Aggregate daily values to annual totals
      const annualTotals: Record<string, number> = {};
      const annualCounts: Record<string, number> = {};

      for (const [date, val] of records) {
        if (val === null || val === 'M' || val === 'T') continue;
        const num = typeof val === 'number' ? val : parseFloat(String(val));
        if (isNaN(num) || num < 0) continue;
        const year = date.slice(0, 4);
        annualTotals[year] = (annualTotals[year] ?? 0) + num;
        annualCounts[year] = (annualCounts[year] ?? 0) + 1;
      }

      // Only include years with nearly complete data (≥350 days)
      const completedYears = Object.keys(annualTotals).filter(
        (y) => (annualCounts[y] ?? 0) >= 350,
      );

      if (completedYears.length === 0) {
        throw new Error('Insufficient precipitation data — fewer than 350 valid days per year');
      }

      const totalInches = completedYears.reduce((sum, y) => sum + annualTotals[y], 0);
      const avgAnnualInches = Math.round((totalInches / completedYears.length) * 10) / 10;

      const firstYear = completedYears[0];
      const lastYear = completedYears[completedYears.length - 1];
      const dataYearsRange = firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`;

      return {
        avgAnnualInches,
        dataYearsRange,
        dataSource: 'NOAA ACIS / PRISM 800m Grid',
      };
    },
    TTL_INFRASTRUCTURE,
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export interface WaterAnalysisOptions {
  coordinates?: { lat: number; lng: number };
  address?: string;
  /**
   * Previously saved result. Sub-sections that have non-null data and no
   * error are kept as-is; only missing or errored sub-sections are re-fetched.
   * This prevents transient upstream failures from wiping out good data.
   */
  existing?: Partial<WaterAnalysisResult>;
}

export async function analyzeWater(opts: WaterAnalysisOptions): Promise<WaterAnalysisResult> {
  let { lat, lng } = opts.coordinates ?? { lat: 0, lng: 0 };

  if (!opts.coordinates || (lat === 0 && lng === 0)) {
    if (!opts.address) throw new Error('Provide an address or coordinates.');
    ({ lat, lng } = await geocodeAddress(opts.address));
  }

  const existing = opts.existing;

  // Only re-fetch sub-sections that are missing or previously errored.
  // A section is "good" if it has non-null data AND no error string.
  const keep = {
    flood: !!existing && existing.floodZone != null && !existing.floodZoneError,
    stream: !!existing && existing.stream != null && !existing.streamError,
    wetlands: !!existing && existing.wetlands != null && !existing.wetlandsError,
    groundwater: !!existing && existing.groundwater != null && !existing.groundwaterError,
    drought: !!existing && existing.drought != null && !existing.droughtError,
    permits: !!existing && existing.dischargePermits != null && !existing.dischargePermitsError,
    precip: !!existing && existing.precipitation != null && !existing.precipitationError,
  };

  const skip = <T>(): Promise<T> => Promise.reject(new Error('__skipped__'));

  const [
    floodResult,
    streamResult,
    wetlandsResult,
    groundwaterResult,
    droughtResult,
    permitsResult,
    precipResult,
  ] = await Promise.allSettled([
    keep.flood ? skip<FloodZoneInfo>() : fetchFloodZone(lat, lng),
    keep.stream ? skip<StreamInfo>() : fetchStreamData(lat, lng),
    keep.wetlands ? skip<WetlandsInfo>() : fetchWetlands(lat, lng),
    keep.groundwater ? skip<GroundwaterInfo>() : fetchGroundwaterData(lat, lng),
    keep.drought ? skip<DroughtInfo>() : fetchDroughtData(lat, lng),
    keep.permits ? skip<DischargePermitsInfo>() : fetchDischargePermits(lat, lng),
    keep.precip ? skip<PrecipitationInfo>() : fetchPrecipitation(lat, lng),
  ]);

  function pick<T>(
    r: PromiseSettledResult<T>,
    kept: boolean,
    existingValue: T | null | undefined,
    existingError: string | null | undefined,
    fallbackErrorMsg: string,
  ): { value: T | null; error: string | null } {
    if (kept) return { value: existingValue ?? null, error: existingError ?? null };
    if (r.status === 'fulfilled') return { value: r.value, error: null };
    const msg = r.reason instanceof Error ? r.reason.message : fallbackErrorMsg;
    return { value: null, error: msg };
  }

  const flood = pick(floodResult, keep.flood, existing?.floodZone, existing?.floodZoneError, 'Flood zone lookup failed');
  const stream = pick(streamResult, keep.stream, existing?.stream, existing?.streamError, 'Stream data lookup failed');
  const wetlands = pick(wetlandsResult, keep.wetlands, existing?.wetlands, existing?.wetlandsError, 'Wetlands lookup failed');
  const groundwater = pick(groundwaterResult, keep.groundwater, existing?.groundwater, existing?.groundwaterError, 'Groundwater lookup failed');
  const drought = pick(droughtResult, keep.drought, existing?.drought, existing?.droughtError, 'Drought data lookup failed');
  const permits = pick(permitsResult, keep.permits, existing?.dischargePermits, existing?.dischargePermitsError, 'Discharge permits lookup failed');
  const precip = pick(precipResult, keep.precip, existing?.precipitation, existing?.precipitationError, 'Precipitation data lookup failed');

  return {
    lat,
    lng,
    analyzedAt: Date.now(),
    floodZone: flood.value,
    floodZoneError: flood.error,
    stream: stream.value,
    streamError: stream.error,
    wetlands: wetlands.value,
    wetlandsError: wetlands.error,
    groundwater: groundwater.value,
    groundwaterError: groundwater.error,
    drought: drought.value,
    droughtError: drought.error,
    dischargePermits: permits.value,
    dischargePermitsError: permits.error,
    precipitation: precip.value,
    precipitationError: precip.error,
  };
}
