/**
 * State-level solar resource averages (kWh/m²/day) from NREL NSRDB.
 *
 * Values are long-term annual averages. Stable for 3-5+ years.
 * To refresh: update the numbers from NREL's published state summaries.
 */

export interface SolarAverage {
  ghi: number;     // Global Horizontal Irradiance (kWh/m²/day)
  latTilt: number; // Latitude-tilt Irradiance (kWh/m²/day)
}

export const US_NATIONAL_AVERAGE: SolarAverage = { ghi: 4.5, latTilt: 4.9 };

export const STATE_SOLAR_AVERAGES: Record<string, SolarAverage> = {
  AL: { ghi: 4.8, latTilt: 5.2 },
  AK: { ghi: 2.8, latTilt: 3.3 },
  AZ: { ghi: 6.6, latTilt: 7.3 },
  AR: { ghi: 4.8, latTilt: 5.2 },
  CA: { ghi: 5.8, latTilt: 6.4 },
  CO: { ghi: 5.5, latTilt: 6.1 },
  CT: { ghi: 3.8, latTilt: 4.3 },
  DE: { ghi: 4.2, latTilt: 4.7 },
  FL: { ghi: 5.3, latTilt: 5.7 },
  GA: { ghi: 5.0, latTilt: 5.4 },
  HI: { ghi: 5.6, latTilt: 6.0 },
  ID: { ghi: 4.7, latTilt: 5.4 },
  IL: { ghi: 4.1, latTilt: 4.6 },
  IN: { ghi: 4.0, latTilt: 4.5 },
  IA: { ghi: 4.2, latTilt: 4.7 },
  KS: { ghi: 5.0, latTilt: 5.6 },
  KY: { ghi: 4.2, latTilt: 4.7 },
  LA: { ghi: 5.0, latTilt: 5.4 },
  ME: { ghi: 3.8, latTilt: 4.4 },
  MD: { ghi: 4.2, latTilt: 4.7 },
  MA: { ghi: 3.8, latTilt: 4.3 },
  MI: { ghi: 3.7, latTilt: 4.2 },
  MN: { ghi: 4.0, latTilt: 4.6 },
  MS: { ghi: 4.9, latTilt: 5.3 },
  MO: { ghi: 4.5, latTilt: 5.0 },
  MT: { ghi: 4.5, latTilt: 5.2 },
  NE: { ghi: 4.8, latTilt: 5.4 },
  NV: { ghi: 6.2, latTilt: 6.9 },
  NH: { ghi: 3.7, latTilt: 4.3 },
  NJ: { ghi: 4.1, latTilt: 4.6 },
  NM: { ghi: 6.4, latTilt: 7.1 },
  NY: { ghi: 3.7, latTilt: 4.2 },
  NC: { ghi: 4.7, latTilt: 5.1 },
  ND: { ghi: 4.2, latTilt: 4.9 },
  OH: { ghi: 3.9, latTilt: 4.4 },
  OK: { ghi: 5.2, latTilt: 5.7 },
  OR: { ghi: 4.0, latTilt: 4.6 },
  PA: { ghi: 3.8, latTilt: 4.3 },
  RI: { ghi: 3.8, latTilt: 4.3 },
  SC: { ghi: 4.9, latTilt: 5.3 },
  SD: { ghi: 4.5, latTilt: 5.2 },
  TN: { ghi: 4.5, latTilt: 5.0 },
  TX: { ghi: 5.5, latTilt: 5.8 },
  UT: { ghi: 5.7, latTilt: 6.4 },
  VT: { ghi: 3.6, latTilt: 4.2 },
  VA: { ghi: 4.4, latTilt: 4.9 },
  WA: { ghi: 3.6, latTilt: 4.2 },
  WV: { ghi: 3.9, latTilt: 4.4 },
  WI: { ghi: 3.9, latTilt: 4.4 },
  WY: { ghi: 5.1, latTilt: 5.8 },
  DC: { ghi: 4.2, latTilt: 4.7 },
};

// ── State detection from coordinates ────────────────────────────────────────
// Bounding-box approach. ~90-95% accurate — sufficient for reference averages.
// Order: smaller / more specific states first to avoid overlap issues.

interface StateBounds {
  abbr: string;
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

const STATE_BOUNDS: StateBounds[] = [
  // Small / specific states first
  { abbr: 'DC', latMin: 38.79, latMax: 38.99, lngMin: -77.12, lngMax: -76.91 },
  { abbr: 'RI', latMin: 41.15, latMax: 42.02, lngMin: -71.86, lngMax: -71.12 },
  { abbr: 'DE', latMin: 38.45, latMax: 39.84, lngMin: -75.79, lngMax: -75.05 },
  { abbr: 'CT', latMin: 40.95, latMax: 42.05, lngMin: -73.73, lngMax: -71.79 },
  { abbr: 'NJ', latMin: 38.93, latMax: 41.36, lngMin: -75.57, lngMax: -73.89 },
  { abbr: 'NH', latMin: 42.70, latMax: 45.30, lngMin: -72.56, lngMax: -70.70 },
  { abbr: 'VT', latMin: 42.73, latMax: 45.02, lngMin: -73.44, lngMax: -71.46 },
  { abbr: 'MA', latMin: 41.24, latMax: 42.89, lngMin: -73.51, lngMax: -69.93 },
  { abbr: 'HI', latMin: 18.91, latMax: 22.24, lngMin: -160.25, lngMax: -154.81 },
  // Mid-size states
  { abbr: 'MD', latMin: 37.91, latMax: 39.72, lngMin: -79.49, lngMax: -75.05 },
  { abbr: 'WV', latMin: 37.20, latMax: 40.64, lngMin: -82.64, lngMax: -77.72 },
  { abbr: 'SC', latMin: 32.03, latMax: 35.21, lngMin: -83.35, lngMax: -78.54 },
  { abbr: 'ME', latMin: 43.06, latMax: 47.46, lngMin: -71.08, lngMax: -66.95 },
  { abbr: 'IN', latMin: 37.77, latMax: 41.76, lngMin: -88.10, lngMax: -84.78 },
  { abbr: 'KY', latMin: 36.50, latMax: 39.15, lngMin: -89.57, lngMax: -81.96 },
  { abbr: 'TN', latMin: 34.98, latMax: 36.68, lngMin: -90.31, lngMax: -81.65 },
  { abbr: 'VA', latMin: 36.54, latMax: 39.47, lngMin: -83.68, lngMax: -75.24 },
  { abbr: 'OH', latMin: 38.40, latMax: 41.98, lngMin: -84.82, lngMax: -80.52 },
  { abbr: 'PA', latMin: 39.72, latMax: 42.27, lngMin: -80.52, lngMax: -74.69 },
  { abbr: 'NY', latMin: 40.50, latMax: 45.01, lngMin: -79.76, lngMax: -71.86 },
  { abbr: 'NC', latMin: 33.84, latMax: 36.59, lngMin: -84.32, lngMax: -75.46 },
  { abbr: 'GA', latMin: 30.36, latMax: 35.00, lngMin: -85.61, lngMax: -80.84 },
  { abbr: 'AL', latMin: 30.22, latMax: 35.01, lngMin: -88.47, lngMax: -84.89 },
  { abbr: 'MS', latMin: 30.17, latMax: 34.99, lngMin: -91.66, lngMax: -88.10 },
  { abbr: 'LA', latMin: 28.93, latMax: 33.02, lngMin: -94.04, lngMax: -88.82 },
  { abbr: 'AR', latMin: 33.00, latMax: 36.50, lngMin: -94.62, lngMax: -89.64 },
  { abbr: 'FL', latMin: 24.52, latMax: 31.00, lngMin: -87.63, lngMax: -80.03 },
  { abbr: 'MI', latMin: 41.70, latMax: 48.26, lngMin: -90.42, lngMax: -82.42 },
  { abbr: 'WI', latMin: 42.49, latMax: 47.08, lngMin: -92.89, lngMax: -86.25 },
  { abbr: 'IL', latMin: 36.97, latMax: 42.51, lngMin: -91.51, lngMax: -87.02 },
  { abbr: 'IA', latMin: 40.37, latMax: 43.50, lngMin: -96.64, lngMax: -90.14 },
  { abbr: 'MO', latMin: 35.99, latMax: 40.61, lngMin: -95.77, lngMax: -89.10 },
  { abbr: 'MN', latMin: 43.50, latMax: 49.38, lngMin: -97.24, lngMax: -89.49 },
  { abbr: 'OK', latMin: 33.62, latMax: 37.00, lngMin: -103.00, lngMax: -94.43 },
  { abbr: 'KS', latMin: 37.00, latMax: 40.00, lngMin: -102.05, lngMax: -94.59 },
  { abbr: 'NE', latMin: 40.00, latMax: 43.00, lngMin: -104.05, lngMax: -95.31 },
  { abbr: 'SD', latMin: 42.48, latMax: 45.94, lngMin: -104.06, lngMax: -96.44 },
  { abbr: 'ND', latMin: 45.94, latMax: 49.00, lngMin: -104.05, lngMax: -96.55 },
  // Large western states
  { abbr: 'TX', latMin: 25.84, latMax: 36.50, lngMin: -106.65, lngMax: -93.51 },
  { abbr: 'NM', latMin: 31.33, latMax: 37.00, lngMin: -109.05, lngMax: -103.00 },
  { abbr: 'CO', latMin: 37.00, latMax: 41.00, lngMin: -109.06, lngMax: -102.04 },
  { abbr: 'WY', latMin: 41.00, latMax: 45.00, lngMin: -111.06, lngMax: -104.05 },
  { abbr: 'MT', latMin: 44.36, latMax: 49.00, lngMin: -116.05, lngMax: -104.04 },
  { abbr: 'AZ', latMin: 31.33, latMax: 37.00, lngMin: -114.82, lngMax: -109.04 },
  { abbr: 'UT', latMin: 37.00, latMax: 42.00, lngMin: -114.05, lngMax: -109.04 },
  { abbr: 'NV', latMin: 35.00, latMax: 42.00, lngMin: -120.01, lngMax: -114.04 },
  { abbr: 'ID', latMin: 42.00, latMax: 49.00, lngMin: -117.24, lngMax: -111.04 },
  { abbr: 'CA', latMin: 32.53, latMax: 42.01, lngMin: -124.41, lngMax: -114.13 },
  { abbr: 'OR', latMin: 41.99, latMax: 46.29, lngMin: -124.57, lngMax: -116.46 },
  { abbr: 'WA', latMin: 45.54, latMax: 49.00, lngMin: -124.85, lngMax: -116.92 },
  { abbr: 'AK', latMin: 51.21, latMax: 71.39, lngMin: -179.15, lngMax: -129.98 },
];

export function detectState(lat: number, lng: number): string | null {
  for (const s of STATE_BOUNDS) {
    if (lat >= s.latMin && lat <= s.latMax && lng >= s.lngMin && lng <= s.lngMax) {
      return s.abbr;
    }
  }
  return null;
}

export function getStateAverage(state: string | null): SolarAverage | null {
  if (!state) return null;
  return STATE_SOLAR_AVERAGES[state] ?? null;
}
