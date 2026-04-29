import type { NearbyPowerPlant, SiteRegistryEntry } from '../types';

const HEADERS = [
  'Site Name',
  'Acres',
  'Latitude',
  'Longitude',
  'Plant 1 Name',
  'Plant 1 MW',
  'Plant 2 Name',
  'Plant 2 MW',
];

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str === '') return '';
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getNearbyPlants(site: SiteRegistryEntry): NearbyPowerPlant[] {
  const infra = site.infraResult as { nearbyPowerPlants?: NearbyPowerPlant[] } | null | undefined;
  const plants = infra?.nearbyPowerPlants;
  if (!Array.isArray(plants)) return [];
  return [...plants].sort((a, b) => (a.distanceMi ?? Infinity) - (b.distanceMi ?? Infinity));
}

export function buildSitesCsv(sites: SiteRegistryEntry[]): string {
  const rows: string[] = [HEADERS.join(',')];

  for (const site of sites) {
    const plants = getNearbyPlants(site);
    const [p1, p2] = [plants[0], plants[1]];
    const name = site.name || (site.coordinates ? `${site.coordinates.lat.toFixed(4)}, ${site.coordinates.lng.toFixed(4)}` : '');

    rows.push(
      [
        escapeCell(name),
        escapeCell(site.acreage > 0 ? site.acreage : ''),
        escapeCell(site.coordinates?.lat ?? 0),
        escapeCell(site.coordinates?.lng ?? 0),
        escapeCell(p1?.name ?? ''),
        escapeCell(p1?.capacityMW ?? ''),
        escapeCell(p2?.name ?? ''),
        escapeCell(p2?.capacityMW ?? ''),
      ].join(','),
    );
  }

  return rows.join('\n');
}

export function downloadSitesCsv(sites: SiteRegistryEntry[]): void {
  const csv = buildSitesCsv(sites);
  // BOM so Excel detects UTF-8 correctly when opening directly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `sites-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
