/**
 * EIA Open Data API v2 client.
 *
 * Fetches live state-level electricity demand and capacity factors
 * from the U.S. Energy Information Administration.
 *
 * Requires VITE_EIA_API_KEY environment variable.
 * Falls back to hardcoded values if the API is unreachable.
 */

import { cachedFetch, TTL_INFRASTRUCTURE } from './requestCache';

const EIA_BASE = 'https://api.eia.gov/v2/electricity';
const EIA_GAS_BASE = 'https://api.eia.gov/v2/natural-gas';

function getApiKey(): string | null {
  return import.meta.env.VITE_EIA_API_KEY ?? null;
}

// ── Hardcoded fallbacks (EIA 2024 national averages) ────────────────────────

export const FALLBACK_CAPACITY_FACTORS: Record<string, number> = {
  Solar: 0.25,
  Wind: 0.34,
  'Natural Gas': 0.44,
  Coal: 0.40,
  Nuclear: 0.93,
  Hydroelectric: 0.37,
  Petroleum: 0.12,
  Biomass: 0.55,
  Geothermal: 0.74,
  Other: 0.30,
};

/** Map our normalized source names to EIA fueltypeid codes */
const SOURCE_TO_FUEL_ID: Record<string, string> = {
  Solar: 'SUN',
  Wind: 'WND',
  'Natural Gas': 'NG',
  Coal: 'COL',
  Nuclear: 'NUC',
  Hydroelectric: 'WAT',
  Petroleum: 'OIL',
  Biomass: 'BIO',
  Geothermal: 'GEO',
  Other: 'OTH',
};

/** Map EIA fueltypeid codes back to our normalized source names */
const FUEL_ID_TO_SOURCE: Record<string, string> = {};
for (const [source, fuelId] of Object.entries(SOURCE_TO_FUEL_ID)) {
  FUEL_ID_TO_SOURCE[fuelId] = source;
}

// ── State demand (retail sales → avg MW) ────────────────────────────────────

/**
 * Fetch the average demand in MW for a state from EIA retail-sales data.
 * Uses the last 12 months of total retail electricity sales (MWh),
 * converted to average MW: (total MWh) / 8760.
 */
export async function fetchStateDemandMW(
  stateAbbr: string,
  signal?: AbortSignal,
): Promise<number | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const key = `eia:demand:${stateAbbr}`;
  return cachedFetch(key, async () => {
    try {
      const url =
        `${EIA_BASE}/retail-sales/data/` +
        `?api_key=${encodeURIComponent(apiKey)}` +
        `&data[0]=sales` +
        `&facets[stateid][]=${stateAbbr}` +
        `&facets[sectorid][]=ALL` +
        `&frequency=monthly` +
        `&sort[0][column]=period&sort[0][direction]=desc` +
        `&length=12`;

      const res = await fetch(url, { signal });
      if (!res.ok) return null;

      const json = await res.json();
      const rows = json?.response?.data;
      if (!Array.isArray(rows) || rows.length === 0) return null;

      // Sum last 12 months of sales (in million kWh = GWh)
      let totalGWh = 0;
      for (const row of rows) {
        const sales = Number(row.sales);
        if (!isNaN(sales) && sales > 0) {
          totalGWh += sales; // already in million kWh = GWh
        }
      }

      // Convert annual GWh to average MW: (GWh × 1000) / 8760
      const avgDemandMW = Math.round((totalGWh * 1000) / 8760);
      return avgDemandMW;
    } catch {
      return null;
    }
  }, TTL_INFRASTRUCTURE);
}

// ── Capacity factors by state + fuel type ───────────────────────────────────

/**
 * Fetch capacity factors by fuel type for a given state from EIA operational data.
 * Returns a map of our normalized source names to capacity factor values.
 */
export async function fetchStateCapacityFactors(
  stateAbbr: string,
  signal?: AbortSignal,
): Promise<Map<string, number> | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const key = `eia:capacityFactors:${stateAbbr}`;
  return cachedFetch(key, async () => {
    try {
      // Request capacity factors for all major fuel types
      const fuelFacets = Object.values(SOURCE_TO_FUEL_ID)
        .map((id) => `&facets[fueltypeid][]=${id}`)
        .join('');

      // Try to compute capacity factors from generation and nameplate capacity
      // EIA provides net generation (thousand MWh) and nameplate capacity (MW)
      const url =
        `${EIA_BASE}/electric-power-operational-data/data/` +
        `?api_key=${encodeURIComponent(apiKey)}` +
        `&data[0]=generation` +
        `&data[1]=total-nameplate-capacity` +
        `&facets[stateid][]=${stateAbbr}` +
        `&facets[sectorid][]=ALL` +
        fuelFacets +
        `&frequency=annual` +
        `&sort[0][column]=period&sort[0][direction]=desc` +
        `&length=20`;

      const res = await fetch(url, { signal });
      if (!res.ok) return null;

      const json = await res.json();
      const rows = json?.response?.data;
      if (!Array.isArray(rows) || rows.length === 0) return null;

      // Compute capacity factor = generation(MWh) / (capacity(MW) × 8760)
      // EIA generation is in thousand MWh, nameplate capacity in MW
      const result = new Map<string, number>();
      const seenFuels = new Set<string>();

      for (const row of rows) {
        const fuelId = String(row.fueltypeid ?? '');
        const sourceName = FUEL_ID_TO_SOURCE[fuelId];
        if (!sourceName || seenFuels.has(fuelId)) continue;

        const genThousandMWh = Number(row.generation);
        const capacityMW = Number(row['total-nameplate-capacity']);

        if (capacityMW > 0 && !isNaN(genThousandMWh)) {
          const cf = (genThousandMWh * 1000) / (capacityMW * 8760);
          if (cf > 0 && cf <= 1) {
            result.set(sourceName, Number(cf.toFixed(3)));
            seenFuels.add(fuelId);
          }
        }
      }

      if (result.size > 0) {
        return result;
      }
      return null;
    } catch {
      return null;
    }
  }, TTL_INFRASTRUCTURE);
}

/**
 * Get the capacity factor for a given source in a state.
 * Uses live EIA data if available, falls back to national average.
 */
export function getCapacityFactor(
  source: string,
  stateFactors: Map<string, number> | null,
): number {
  if (stateFactors) {
    const cf = stateFactors.get(source);
    if (cf !== undefined) return cf;
  }
  return FALLBACK_CAPACITY_FACTORS[source] ?? FALLBACK_CAPACITY_FACTORS.Other;
}

// ── Electricity retail prices by state ──────────────────────────────────────

export interface ElectricityPriceResult {
  commercial: number;  // cents/kWh
  industrial: number;  // cents/kWh
  allSectors: number;  // cents/kWh
}

/**
 * Fetch average retail electricity prices (cents/kWh) for a state from EIA.
 */
export async function fetchElectricityPrices(
  stateAbbr: string,
): Promise<ElectricityPriceResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const key = `eia:elecPrice:${stateAbbr}`;
  return cachedFetch(key, async () => {
    try {
      const url =
        `${EIA_BASE}/retail-sales/data/` +
        `?api_key=${encodeURIComponent(apiKey)}` +
        `&data[0]=price` +
        `&facets[stateid][]=${stateAbbr}` +
        `&facets[sectorid][]=COM` +
        `&facets[sectorid][]=IND` +
        `&facets[sectorid][]=ALL` +
        `&frequency=annual` +
        `&sort[0][column]=period&sort[0][direction]=desc` +
        `&length=3`;

      const res = await fetch(url);
      if (!res.ok) return null;

      const json = await res.json();
      const rows = json?.response?.data;
      if (!Array.isArray(rows) || rows.length === 0) return null;

      let commercial: number | null = null;
      let industrial: number | null = null;
      let allSectors: number | null = null;

      for (const row of rows) {
        const price = Number(row.price);
        if (isNaN(price) || price <= 0) continue;
        const sector = String(row.sectorid ?? '');
        if (sector === 'COM' && commercial === null) commercial = price;
        else if (sector === 'IND' && industrial === null) industrial = price;
        else if (sector === 'ALL' && allSectors === null) allSectors = price;
      }

      if (allSectors === null) return null;

      return {
        commercial: commercial ?? allSectors,
        industrial: industrial ?? allSectors,
        allSectors,
      };
    } catch {
      return null;
    }
  }, TTL_INFRASTRUCTURE);
}

// ── Natural Gas Pricing (Henry Hub + State Prices) ─────────────────────────

/**
 * Fetch the latest Henry Hub Natural Gas Futures (Contract 1) price from EIA.
 */
export async function fetchHenryHubPrice(): Promise<{ price: number; period: string } | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const key = 'eia:henryHub:latest';
  return cachedFetch(key, async () => {
    try {
      const url =
        `${EIA_GAS_BASE}/pri/fut/data/` +
        `?api_key=${encodeURIComponent(apiKey)}` +
        `&data[0]=value` +
        `&facets[series][]=RNGC1` +
        `&frequency=daily` +
        `&sort[0][column]=period&sort[0][direction]=desc` +
        `&length=1`;

      const res = await fetch(url);
      if (!res.ok) return null;

      const json = await res.json();
      const rows = json?.response?.data;
      if (!Array.isArray(rows) || rows.length === 0) return null;

      const price = Number(rows[0].value);
      const period = String(rows[0].period ?? '');
      if (isNaN(price) || price <= 0) return null;

      return { price, period };
    } catch {
      return null;
    }
  }, TTL_INFRASTRUCTURE);
}

/**
 * Fetch the latest state-level natural gas price for electric power consumers.
 */
export async function fetchStateGasPrice(
  stateAbbr: string,
): Promise<{ price: number; period: string } | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const key = `eia:stateGasPrice:${stateAbbr}`;
  return cachedFetch(key, async () => {
    try {
      const url =
        `${EIA_GAS_BASE}/pri/sum/data/` +
        `?api_key=${encodeURIComponent(apiKey)}` +
        `&data[0]=value` +
        `&facets[duoarea][]=S${stateAbbr}` +
        `&facets[process][]=PEU` +
        `&frequency=monthly` +
        `&sort[0][column]=period&sort[0][direction]=desc` +
        `&length=1`;

      const res = await fetch(url);
      if (!res.ok) return null;

      const json = await res.json();
      const rows = json?.response?.data;
      if (!Array.isArray(rows) || rows.length === 0) return null;

      const price = Number(rows[0].value);
      const period = String(rows[0].period ?? '');
      if (isNaN(price) || price <= 0) return null;

      return { price, period };
    } catch {
      return null;
    }
  }, TTL_INFRASTRUCTURE);
}
