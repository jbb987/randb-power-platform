import type { NearbyPowerPlant } from '../types';

export const FUEL_COLORS: Record<string, string> = {
  'Natural Gas':   '#C45D3E',  // Warm flame red-orange
  'Wind':          '#5B8FA8',  // Muted sky blue
  'Solar':         '#D4A24C',  // Golden amber
  'Coal':          '#5C5650',  // Dark warm gray
  'Nuclear':       '#9B0E18',  // Deep crimson
  'Hydroelectric': '#4A8C7B',  // Muted teal-green
  'Petroleum':     '#8C7B6B',  // Warm taupe
  'Biomass':       '#7A9A5A',  // Muted olive green
  'Geothermal':    '#A85A3E',  // Earthy brown
  'Other':         '#B8B3AC',  // Warm light gray
};

/** Normalize raw primarySource strings from ArcGIS to our standard keys. */
const SOURCE_ALIASES: Record<string, string> = {
  'solar':              'Solar',
  'wind':               'Wind',
  'natural gas':        'Natural Gas',
  'gas':                'Natural Gas',
  'ng':                 'Natural Gas',
  'landfill gas':       'Natural Gas',
  'other gases':        'Natural Gas',
  'coal':               'Coal',
  'petroleum coke':     'Coal',
  'nuclear':            'Nuclear',
  'hydroelectric':      'Hydroelectric',
  'hydro':              'Hydroelectric',
  'conventional hydroelectric': 'Hydroelectric',
  'pumped storage':     'Hydroelectric',
  'petroleum':          'Petroleum',
  'oil':                'Petroleum',
  'biomass':            'Biomass',
  'wood':               'Biomass',
  'wood/wood waste biomass': 'Biomass',
  'municipal solid waste': 'Biomass',
  'agricultural waste': 'Biomass',
  'geothermal':         'Geothermal',
  'other':              'Other',
  'batteries':          'Other',
  'battery':            'Other',
  'battery storage':    'Other',
  'storage':            'Other',
  'flywheels':          'Other',
};

function normalizeSource(raw: string): string {
  if (!raw) return 'Other';
  // Exact match first
  if (raw in FUEL_COLORS) return raw;
  // Case-insensitive alias lookup
  const lower = raw.toLowerCase().trim();
  if (lower in SOURCE_ALIASES) return SOURCE_ALIASES[lower];
  // Partial match fallback
  for (const [alias, standard] of Object.entries(SOURCE_ALIASES)) {
    if (lower.includes(alias)) return standard;
  }
  return 'Other';
}

export interface FuelMixEntry {
  source: string;
  value: number;
  pct: number;
  color: string;
}

/** Aggregate nearby power plants by fuel type into a % breakdown. */
export function computeSiteFuelMix(plants: NearbyPowerPlant[]): FuelMixEntry[] {
  const bySource = new Map<string, number>();
  for (const p of plants) {
    const key = normalizeSource(p.primarySource);
    bySource.set(key, (bySource.get(key) ?? 0) + p.capacityMW);
  }
  const total = [...bySource.values()].reduce((a, b) => a + b, 0);
  return [...bySource.entries()]
    .map(([source, mw]) => ({
      source,
      value: mw,
      pct: total > 0 ? (mw / total) * 100 : 0,
      color: FUEL_COLORS[source] ?? FUEL_COLORS.Other,
    }))
    .sort((a, b) => b.pct - a.pct);
}

/** Convert state generation-by-fuel (thousand MWh) into a % breakdown. */
export function computeStateGenMix(gen: Record<string, number>): FuelMixEntry[] {
  const total = Object.values(gen).reduce((a, b) => a + b, 0);
  return Object.entries(gen)
    .map(([source, mwh]) => ({
      source,
      value: mwh,
      pct: total > 0 ? (mwh / total) * 100 : 0,
      color: FUEL_COLORS[source] ?? FUEL_COLORS.Other,
    }))
    .sort((a, b) => b.pct - a.pct);
}
