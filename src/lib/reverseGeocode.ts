/**
 * Reverse geocoding — returns county and nearest city/town for a lat/lng.
 *
 * Primary: BigDataCloud (no API key, client-side, fast).
 * Fallback: Nominatim / OpenStreetMap.
 *
 * Results are cached by rounded coordinates to avoid repeat lookups.
 */

export interface GeoLocation {
  city: string;
  county: string;
}

// Cache by rounded lat/lng (3 decimal places ≈ 100m precision)
const cache = new Map<string, GeoLocation>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

async function tryBigDataCloud(lat: number, lng: number): Promise<GeoLocation | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    const city = data.city || data.locality || '';
    // County is in localityInfo.administrative — find the county-level entry
    let county = '';
    const admins = data.localityInfo?.administrative;
    if (Array.isArray(admins)) {
      // Look for adminLevel 2 (county) or name containing "County"
      const countyEntry = admins.find(
        (a: { adminLevel?: number; name?: string }) =>
          a.adminLevel === 2 || (a.name && a.name.includes('County')),
      );
      if (countyEntry?.name) {
        county = countyEntry.name;
      }
    }

    if (city || county) return { city, county };
    return null;
  } catch {
    return null;
  }
}

async function tryNominatim(lat: number, lng: number): Promise<GeoLocation | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RBPowerPlatform/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();

    const city = data.address?.city || data.address?.town || data.address?.village || '';
    const county = data.address?.county || '';

    if (city || county) return { city, county };
    return null;
  } catch {
    return null;
  }
}

/**
 * Reverse geocode a lat/lng to get county and nearest city.
 * Returns cached result if available.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoLocation> {
  const key = cacheKey(lat, lng);
  const cached = cache.get(key);
  if (cached) return cached;

  const result = (await tryBigDataCloud(lat, lng)) ?? (await tryNominatim(lat, lng)) ?? { city: '', county: '' };

  cache.set(key, result);
  return result;
}
