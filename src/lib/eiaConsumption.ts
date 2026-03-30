/**
 * Estimated power consumption by state.
 *
 * Source: EIA Electric Power Monthly — Table 5.1 (2024 annual data).
 * Values are total retail electricity sales in GWh per year, converted
 * to average MW demand:  avgMW = (GWh × 1000) / 8760.
 *
 * Population figures from US Census 2024 estimates for per-capita calc.
 *
 * We expose per-capita MW so the map can estimate consumption for any
 * area using population density data.
 */

export interface StateConsumption {
  state: string;
  abbr: string;
  annualGWh: number;
  population: number;
  /** Average demand in MW */
  avgDemandMW: number;
  /** Per-capita average demand in kW */
  perCapitaKW: number;
}

// EIA 2024 annual retail sales (GWh) + Census 2024 population estimates
const RAW_DATA: [string, string, number, number][] = [
  ['Alabama', 'AL', 88_700, 5_108_000],
  ['Alaska', 'AK', 6_200, 733_000],
  ['Arizona', 'AZ', 79_800, 7_431_000],
  ['Arkansas', 'AR', 48_500, 3_046_000],
  ['California', 'CA', 265_000, 38_965_000],
  ['Colorado', 'CO', 55_800, 5_912_000],
  ['Connecticut', 'CT', 28_500, 3_617_000],
  ['Delaware', 'DE', 11_600, 1_018_000],
  ['Florida', 'FL', 248_000, 22_975_000],
  ['Georgia', 'GA', 140_000, 11_029_000],
  ['Hawaii', 'HI', 9_100, 1_440_000],
  ['Idaho', 'ID', 25_500, 1_973_000],
  ['Illinois', 'IL', 134_000, 12_550_000],
  ['Indiana', 'IN', 98_000, 6_876_000],
  ['Iowa', 'IA', 50_200, 3_207_000],
  ['Kansas', 'KS', 40_100, 2_940_000],
  ['Kentucky', 'KY', 70_500, 4_526_000],
  ['Louisiana', 'LA', 89_500, 4_625_000],
  ['Maine', 'ME', 11_400, 1_395_000],
  ['Maryland', 'MD', 58_000, 6_185_000],
  ['Massachusetts', 'MA', 51_000, 7_001_000],
  ['Michigan', 'MI', 100_000, 10_037_000],
  ['Minnesota', 'MN', 67_000, 5_738_000],
  ['Mississippi', 'MS', 47_000, 2_940_000],
  ['Missouri', 'MO', 77_000, 6_196_000],
  ['Montana', 'MT', 14_800, 1_133_000],
  ['Nebraska', 'NE', 31_500, 1_978_000],
  ['Nevada', 'NV', 40_500, 3_194_000],
  ['New Hampshire', 'NH', 10_700, 1_402_000],
  ['New Jersey', 'NJ', 75_000, 9_290_000],
  ['New Mexico', 'NM', 20_500, 2_115_000],
  ['New York', 'NY', 142_000, 19_572_000],
  ['North Carolina', 'NC', 133_000, 10_835_000],
  ['North Dakota', 'ND', 18_200, 783_000],
  ['Ohio', 'OH', 140_000, 11_785_000],
  ['Oklahoma', 'OK', 58_000, 4_019_000],
  ['Oregon', 'OR', 44_500, 4_241_000],
  ['Pennsylvania', 'PA', 143_000, 12_962_000],
  ['Rhode Island', 'RI', 7_500, 1_096_000],
  ['South Carolina', 'SC', 80_000, 5_373_000],
  ['South Dakota', 'SD', 12_700, 919_000],
  ['Tennessee', 'TN', 98_000, 7_126_000],
  ['Texas', 'TX', 430_000, 30_503_000],
  ['Utah', 'UT', 31_500, 3_417_000],
  ['Vermont', 'VT', 5_300, 647_000],
  ['Virginia', 'VA', 113_000, 8_683_000],
  ['Washington', 'WA', 90_000, 7_812_000],
  ['West Virginia', 'WV', 28_000, 1_770_000],
  ['Wisconsin', 'WI', 68_000, 5_893_000],
  ['Wyoming', 'WY', 14_200, 577_000],
];

export const STATE_CONSUMPTION: StateConsumption[] = RAW_DATA.map(
  ([state, abbr, annualGWh, population]) => {
    const avgDemandMW = (annualGWh * 1000) / 8760;
    return {
      state,
      abbr,
      annualGWh,
      population,
      avgDemandMW: Math.round(avgDemandMW),
      perCapitaKW: Number(((avgDemandMW * 1000) / population).toFixed(2)),
    };
  },
);

const BY_ABBR = new Map(STATE_CONSUMPTION.map((s) => [s.abbr, s]));
const BY_NAME = new Map(STATE_CONSUMPTION.map((s) => [s.state.toLowerCase(), s]));

export function getStateConsumption(stateNameOrAbbr: string | null): StateConsumption | null {
  if (!stateNameOrAbbr) return null;
  const upper = stateNameOrAbbr.toUpperCase();
  if (BY_ABBR.has(upper)) return BY_ABBR.get(upper)!;
  return BY_NAME.get(stateNameOrAbbr.toLowerCase()) ?? null;
}

/** US average per-capita demand in kW (computed from state data). */
export const US_AVG_PER_CAPITA_KW = Number(
  (
    STATE_CONSUMPTION.reduce((sum, s) => sum + s.avgDemandMW * 1000, 0) /
    STATE_CONSUMPTION.reduce((sum, s) => sum + s.population, 0)
  ).toFixed(2),
);
