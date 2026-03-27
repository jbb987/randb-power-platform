/**
 * State bounding boxes and metadata for the state-selection map flow.
 * Bounds from solarAverages.ts, extended with full state names and
 * center coordinates for label placement.
 */

export interface StateBoundary {
  abbr: string;
  name: string;
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
  centerLat: number;
  centerLng: number;
}

export const US_STATES: StateBoundary[] = [
  { abbr: 'AL', name: 'Alabama', latMin: 30.22, latMax: 35.01, lngMin: -88.47, lngMax: -84.89, centerLat: 32.81, centerLng: -86.68 },
  { abbr: 'AK', name: 'Alaska', latMin: 51.21, latMax: 71.39, lngMin: -179.15, lngMax: -129.98, centerLat: 64.20, centerLng: -152.49 },
  { abbr: 'AZ', name: 'Arizona', latMin: 31.33, latMax: 37.00, lngMin: -114.82, lngMax: -109.04, centerLat: 34.17, centerLng: -111.93 },
  { abbr: 'AR', name: 'Arkansas', latMin: 33.00, latMax: 36.50, lngMin: -94.62, lngMax: -89.64, centerLat: 34.75, centerLng: -92.13 },
  { abbr: 'CA', name: 'California', latMin: 32.53, latMax: 42.01, lngMin: -124.41, lngMax: -114.13, centerLat: 37.27, centerLng: -119.27 },
  { abbr: 'CO', name: 'Colorado', latMin: 37.00, latMax: 41.00, lngMin: -109.06, lngMax: -102.04, centerLat: 39.00, centerLng: -105.55 },
  { abbr: 'CT', name: 'Connecticut', latMin: 40.95, latMax: 42.05, lngMin: -73.73, lngMax: -71.79, centerLat: 41.50, centerLng: -72.76 },
  { abbr: 'DE', name: 'Delaware', latMin: 38.45, latMax: 39.84, lngMin: -75.79, lngMax: -75.05, centerLat: 39.15, centerLng: -75.42 },
  { abbr: 'FL', name: 'Florida', latMin: 24.52, latMax: 31.00, lngMin: -87.63, lngMax: -80.03, centerLat: 27.76, centerLng: -83.83 },
  { abbr: 'GA', name: 'Georgia', latMin: 30.36, latMax: 35.00, lngMin: -85.61, lngMax: -80.84, centerLat: 32.68, centerLng: -83.22 },
  { abbr: 'HI', name: 'Hawaii', latMin: 18.91, latMax: 22.24, lngMin: -160.25, lngMax: -154.81, centerLat: 20.58, centerLng: -157.53 },
  { abbr: 'ID', name: 'Idaho', latMin: 42.00, latMax: 49.00, lngMin: -117.24, lngMax: -111.04, centerLat: 45.50, centerLng: -114.14 },
  { abbr: 'IL', name: 'Illinois', latMin: 36.97, latMax: 42.51, lngMin: -91.51, lngMax: -87.02, centerLat: 39.74, centerLng: -89.26 },
  { abbr: 'IN', name: 'Indiana', latMin: 37.77, latMax: 41.76, lngMin: -88.10, lngMax: -84.78, centerLat: 39.77, centerLng: -86.44 },
  { abbr: 'IA', name: 'Iowa', latMin: 40.37, latMax: 43.50, lngMin: -96.64, lngMax: -90.14, centerLat: 41.94, centerLng: -93.39 },
  { abbr: 'KS', name: 'Kansas', latMin: 37.00, latMax: 40.00, lngMin: -102.05, lngMax: -94.59, centerLat: 38.50, centerLng: -98.32 },
  { abbr: 'KY', name: 'Kentucky', latMin: 36.50, latMax: 39.15, lngMin: -89.57, lngMax: -81.96, centerLat: 37.82, centerLng: -85.76 },
  { abbr: 'LA', name: 'Louisiana', latMin: 28.93, latMax: 33.02, lngMin: -94.04, lngMax: -88.82, centerLat: 30.97, centerLng: -91.43 },
  { abbr: 'ME', name: 'Maine', latMin: 43.06, latMax: 47.46, lngMin: -71.08, lngMax: -66.95, centerLat: 45.26, centerLng: -69.01 },
  { abbr: 'MD', name: 'Maryland', latMin: 37.91, latMax: 39.72, lngMin: -79.49, lngMax: -75.05, centerLat: 38.81, centerLng: -77.27 },
  { abbr: 'MA', name: 'Massachusetts', latMin: 41.24, latMax: 42.89, lngMin: -73.51, lngMax: -69.93, centerLat: 42.07, centerLng: -71.72 },
  { abbr: 'MI', name: 'Michigan', latMin: 41.70, latMax: 48.26, lngMin: -90.42, lngMax: -82.42, centerLat: 44.98, centerLng: -86.42 },
  { abbr: 'MN', name: 'Minnesota', latMin: 43.50, latMax: 49.38, lngMin: -97.24, lngMax: -89.49, centerLat: 46.44, centerLng: -93.36 },
  { abbr: 'MS', name: 'Mississippi', latMin: 30.17, latMax: 34.99, lngMin: -91.66, lngMax: -88.10, centerLat: 32.58, centerLng: -89.88 },
  { abbr: 'MO', name: 'Missouri', latMin: 35.99, latMax: 40.61, lngMin: -95.77, lngMax: -89.10, centerLat: 38.30, centerLng: -92.44 },
  { abbr: 'MT', name: 'Montana', latMin: 44.36, latMax: 49.00, lngMin: -116.05, lngMax: -104.04, centerLat: 46.68, centerLng: -110.04 },
  { abbr: 'NE', name: 'Nebraska', latMin: 40.00, latMax: 43.00, lngMin: -104.05, lngMax: -95.31, centerLat: 41.50, centerLng: -99.68 },
  { abbr: 'NV', name: 'Nevada', latMin: 35.00, latMax: 42.00, lngMin: -120.01, lngMax: -114.04, centerLat: 38.50, centerLng: -117.02 },
  { abbr: 'NH', name: 'New Hampshire', latMin: 42.70, latMax: 45.30, lngMin: -72.56, lngMax: -70.70, centerLat: 44.00, centerLng: -71.63 },
  { abbr: 'NJ', name: 'New Jersey', latMin: 38.93, latMax: 41.36, lngMin: -75.57, lngMax: -73.89, centerLat: 40.14, centerLng: -74.73 },
  { abbr: 'NM', name: 'New Mexico', latMin: 31.33, latMax: 37.00, lngMin: -109.05, lngMax: -103.00, centerLat: 34.17, centerLng: -106.02 },
  { abbr: 'NY', name: 'New York', latMin: 40.50, latMax: 45.01, lngMin: -79.76, lngMax: -71.86, centerLat: 42.75, centerLng: -75.81 },
  { abbr: 'NC', name: 'North Carolina', latMin: 33.84, latMax: 36.59, lngMin: -84.32, lngMax: -75.46, centerLat: 35.21, centerLng: -79.89 },
  { abbr: 'ND', name: 'North Dakota', latMin: 45.94, latMax: 49.00, lngMin: -104.05, lngMax: -96.55, centerLat: 47.47, centerLng: -100.30 },
  { abbr: 'OH', name: 'Ohio', latMin: 38.40, latMax: 41.98, lngMin: -84.82, lngMax: -80.52, centerLat: 40.19, centerLng: -82.67 },
  { abbr: 'OK', name: 'Oklahoma', latMin: 33.62, latMax: 37.00, lngMin: -103.00, lngMax: -94.43, centerLat: 35.31, centerLng: -98.72 },
  { abbr: 'OR', name: 'Oregon', latMin: 41.99, latMax: 46.29, lngMin: -124.57, lngMax: -116.46, centerLat: 44.14, centerLng: -120.51 },
  { abbr: 'PA', name: 'Pennsylvania', latMin: 39.72, latMax: 42.27, lngMin: -80.52, lngMax: -74.69, centerLat: 40.99, centerLng: -77.60 },
  { abbr: 'RI', name: 'Rhode Island', latMin: 41.15, latMax: 42.02, lngMin: -71.86, lngMax: -71.12, centerLat: 41.58, centerLng: -71.49 },
  { abbr: 'SC', name: 'South Carolina', latMin: 32.03, latMax: 35.21, lngMin: -83.35, lngMax: -78.54, centerLat: 33.62, centerLng: -80.95 },
  { abbr: 'SD', name: 'South Dakota', latMin: 42.48, latMax: 45.94, lngMin: -104.06, lngMax: -96.44, centerLat: 44.21, centerLng: -100.25 },
  { abbr: 'TN', name: 'Tennessee', latMin: 34.98, latMax: 36.68, lngMin: -90.31, lngMax: -81.65, centerLat: 35.83, centerLng: -85.98 },
  { abbr: 'TX', name: 'Texas', latMin: 25.84, latMax: 36.50, lngMin: -106.65, lngMax: -93.51, centerLat: 31.17, centerLng: -100.08 },
  { abbr: 'UT', name: 'Utah', latMin: 37.00, latMax: 42.00, lngMin: -114.05, lngMax: -109.04, centerLat: 39.50, centerLng: -111.55 },
  { abbr: 'VT', name: 'Vermont', latMin: 42.73, latMax: 45.02, lngMin: -73.44, lngMax: -71.46, centerLat: 43.87, centerLng: -72.45 },
  { abbr: 'VA', name: 'Virginia', latMin: 36.54, latMax: 39.47, lngMin: -83.68, lngMax: -75.24, centerLat: 38.00, centerLng: -79.46 },
  { abbr: 'WA', name: 'Washington', latMin: 45.54, latMax: 49.00, lngMin: -124.85, lngMax: -116.92, centerLat: 47.27, centerLng: -120.88 },
  { abbr: 'WV', name: 'West Virginia', latMin: 37.20, latMax: 40.64, lngMin: -82.64, lngMax: -77.72, centerLat: 38.92, centerLng: -80.18 },
  { abbr: 'WI', name: 'Wisconsin', latMin: 42.49, latMax: 47.08, lngMin: -92.89, lngMax: -86.25, centerLat: 44.78, centerLng: -89.57 },
  { abbr: 'WY', name: 'Wyoming', latMin: 41.00, latMax: 45.00, lngMin: -111.06, lngMax: -104.05, centerLat: 43.00, centerLng: -107.55 },
];

const BY_ABBR = new Map(US_STATES.map((s) => [s.abbr, s]));

export function getStateBounds(abbr: string): StateBoundary | null {
  return BY_ABBR.get(abbr) ?? null;
}
