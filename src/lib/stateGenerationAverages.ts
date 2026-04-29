/**
 * State-level electricity generation by fuel type (thousand MWh), from EIA.
 *
 * Source: U.S. Energy Information Administration, Electric Power Monthly
 * Table 1.7 — Net Generation by State by Type of Producer by Energy Source (2023 annual).
 *
 * Values are annual totals in thousand MWh. Used as fallback when EIA API key is not set.
 * To refresh: pull updated numbers from https://www.eia.gov/electricity/data/state/
 */

export type StateGeneration = Record<string, number>;

export const STATE_GENERATION: Record<string, StateGeneration> = {
  TX: {
    'Natural Gas': 231_870,
    'Wind': 112_690,
    'Coal': 42_960,
    'Nuclear': 41_530,
    'Solar': 28_310,
    'Hydroelectric': 1_240,
    'Biomass': 2_150,
    'Petroleum': 490,
    'Other': 1_230,
  },
  OK: {
    'Natural Gas': 27_410,
    'Wind': 30_820,
    'Coal': 6_690,
    'Hydroelectric': 2_870,
    'Solar': 1_630,
    'Petroleum': 70,
    'Other': 210,
  },
  AZ: {
    'Nuclear': 31_890,
    'Natural Gas': 26_970,
    'Solar': 7_660,
    'Coal': 7_240,
    'Hydroelectric': 5_870,
    'Wind': 840,
    'Biomass': 130,
    'Other': 170,
  },
  NM: {
    'Natural Gas': 10_290,
    'Wind': 7_180,
    'Coal': 4_310,
    'Solar': 3_890,
    'Other': 130,
  },
  TN: {
    'Nuclear': 33_210,
    'Natural Gas': 13_870,
    'Hydroelectric': 12_110,
    'Coal': 5_620,
    'Wind': 630,
    'Solar': 560,
    'Biomass': 1_070,
    'Petroleum': 120,
    'Other': 90,
  },
  CA: {
    'Natural Gas': 87_920,
    'Solar': 52_860,
    'Hydroelectric': 34_460,
    'Wind': 16_040,
    'Nuclear': 15_640,
    'Geothermal': 11_350,
    'Biomass': 5_790,
    'Coal': 240,
    'Petroleum': 180,
    'Other': 2_370,
  },
  FL: {
    'Natural Gas': 161_030,
    'Nuclear': 28_320,
    'Solar': 14_770,
    'Coal': 7_110,
    'Petroleum': 1_290,
    'Biomass': 3_120,
    'Other': 420,
  },
  OH: {
    'Natural Gas': 55_310,
    'Nuclear': 31_530,
    'Coal': 16_650,
    'Wind': 6_490,
    'Solar': 1_770,
    'Hydroelectric': 640,
    'Biomass': 850,
    'Petroleum': 510,
    'Other': 290,
  },
  PA: {
    'Nuclear': 72_160,
    'Natural Gas': 60_490,
    'Coal': 8_090,
    'Wind': 4_350,
    'Hydroelectric': 3_210,
    'Solar': 1_580,
    'Biomass': 2_730,
    'Petroleum': 310,
    'Other': 660,
  },
  IL: {
    'Nuclear': 98_410,
    'Wind': 17_030,
    'Natural Gas': 8_710,
    'Coal': 5_390,
    'Solar': 2_960,
    'Hydroelectric': 290,
    'Biomass': 970,
    'Other': 520,
  },
};

export function getStateGenerationFallback(stateAbbr: string | null): StateGeneration | null {
  if (!stateAbbr) return null;
  return STATE_GENERATION[stateAbbr] ?? null;
}
