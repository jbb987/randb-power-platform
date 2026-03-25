/**
 * State-level average retail electricity prices (cents/kWh) from EIA.
 *
 * Source: U.S. Energy Information Administration, Electric Power Monthly
 * Table 5.6.A — Average Retail Price of Electricity (2024 annual averages).
 *
 * Values are annual averages across all months. Relatively stable year-to-year.
 * To refresh: pull updated numbers from https://www.eia.gov/electricity/monthly/
 */

export interface ElectricityAverage {
  commercial: number;  // cents/kWh
  industrial: number;  // cents/kWh
  allSectors: number;  // cents/kWh
}

export const US_NATIONAL_AVERAGE: ElectricityAverage = {
  commercial: 13.59,
  industrial: 8.71,
  allSectors: 12.99,
};

export const STATE_ELECTRICITY_AVERAGES: Record<string, ElectricityAverage> = {
  AL: { commercial: 13.22, industrial: 7.57, allSectors: 12.41 },
  AK: { commercial: 22.93, industrial: 20.15, allSectors: 23.46 },
  AZ: { commercial: 12.28, industrial: 7.83, allSectors: 12.65 },
  AR: { commercial: 10.63, industrial: 7.34, allSectors: 10.43 },
  CA: { commercial: 24.70, industrial: 19.66, allSectors: 27.27 },
  CO: { commercial: 12.19, industrial: 9.10, allSectors: 13.08 },
  CT: { commercial: 21.60, industrial: 18.42, allSectors: 25.40 },
  DE: { commercial: 12.39, industrial: 9.36, allSectors: 13.42 },
  FL: { commercial: 12.09, industrial: 10.01, allSectors: 13.68 },
  GA: { commercial: 12.11, industrial: 7.18, allSectors: 12.16 },
  HI: { commercial: 37.53, industrial: 33.02, allSectors: 39.97 },
  ID: { commercial: 8.56, industrial: 6.74, allSectors: 9.72 },
  IL: { commercial: 11.30, industrial: 8.49, allSectors: 13.27 },
  IN: { commercial: 13.12, industrial: 8.76, allSectors: 12.77 },
  IA: { commercial: 13.74, industrial: 7.63, allSectors: 12.60 },
  KS: { commercial: 12.79, industrial: 9.10, allSectors: 13.15 },
  KY: { commercial: 11.06, industrial: 6.63, allSectors: 10.33 },
  LA: { commercial: 10.71, industrial: 6.40, allSectors: 10.14 },
  ME: { commercial: 17.91, industrial: 13.26, allSectors: 20.33 },
  MD: { commercial: 13.36, industrial: 10.16, allSectors: 14.52 },
  MA: { commercial: 22.44, industrial: 19.88, allSectors: 26.39 },
  MI: { commercial: 14.01, industrial: 9.41, allSectors: 15.63 },
  MN: { commercial: 12.18, industrial: 8.96, allSectors: 13.25 },
  MS: { commercial: 11.83, industrial: 7.23, allSectors: 11.53 },
  MO: { commercial: 10.96, industrial: 7.79, allSectors: 11.82 },
  MT: { commercial: 11.36, industrial: 6.98, allSectors: 11.05 },
  NE: { commercial: 10.85, industrial: 8.24, allSectors: 11.21 },
  NV: { commercial: 10.45, industrial: 7.18, allSectors: 11.30 },
  NH: { commercial: 19.70, industrial: 16.46, allSectors: 22.57 },
  NJ: { commercial: 15.22, industrial: 12.09, allSectors: 17.47 },
  NM: { commercial: 12.07, industrial: 7.71, allSectors: 12.89 },
  NY: { commercial: 18.68, industrial: 11.77, allSectors: 20.52 },
  NC: { commercial: 10.78, industrial: 7.15, allSectors: 11.35 },
  ND: { commercial: 10.55, industrial: 8.44, allSectors: 10.97 },
  OH: { commercial: 11.82, industrial: 7.90, allSectors: 12.52 },
  OK: { commercial: 10.12, industrial: 6.48, allSectors: 10.22 },
  OR: { commercial: 10.36, industrial: 6.93, allSectors: 10.96 },
  PA: { commercial: 12.31, industrial: 8.39, allSectors: 13.35 },
  RI: { commercial: 21.45, industrial: 18.71, allSectors: 25.13 },
  SC: { commercial: 11.63, industrial: 6.99, allSectors: 11.90 },
  SD: { commercial: 11.52, industrial: 9.18, allSectors: 12.34 },
  TN: { commercial: 11.88, industrial: 7.72, allSectors: 11.42 },
  TX: { commercial: 11.16, industrial: 7.75, allSectors: 12.08 },
  UT: { commercial: 9.82, industrial: 7.04, allSectors: 10.27 },
  VT: { commercial: 18.56, industrial: 14.22, allSectors: 19.84 },
  VA: { commercial: 10.94, industrial: 7.87, allSectors: 11.79 },
  WA: { commercial: 9.87, industrial: 5.38, allSectors: 10.24 },
  WV: { commercial: 11.14, industrial: 7.46, allSectors: 10.78 },
  WI: { commercial: 13.14, industrial: 9.31, allSectors: 14.02 },
  WY: { commercial: 10.77, industrial: 7.49, allSectors: 9.86 },
  DC: { commercial: 14.44, industrial: 12.10, allSectors: 14.55 },
};

export function getStateElectricityAverage(state: string | null): ElectricityAverage | null {
  if (!state) return null;
  return STATE_ELECTRICITY_AVERAGES[state] ?? null;
}
