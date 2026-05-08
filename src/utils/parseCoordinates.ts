/**
 * Parse coordinate strings in either decimal or DMS format.
 *
 * Supported formats:
 *   "28.656108, -98.843978"              — decimal degrees
 *   "28°39'22.0\"N 98°50'38.3\"W"        — DMS with NSEW
 *   "28°39'22.0\"N, 98°50'38.3\"W"       — DMS with comma separator
 *   "28° 39' 22.0\" N 98° 50' 38.3\" W"  — DMS with spaces
 */

/** Try to parse a single DMS component like `28°39'22.0"N` and return decimal degrees. */
function parseDmsPart(s: string): number | null {
  // Match: degrees ° minutes ' seconds " optional-direction
  const m = s.match(
    /(-?\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)\s*[''′]\s*(\d+(?:\.\d+)?)\s*["″]?\s*([NSEWnsew])?/,
  );
  if (!m) return null;

  const deg = parseFloat(m[1]);
  const min = parseFloat(m[2]);
  const sec = parseFloat(m[3]);
  const dir = m[4]?.toUpperCase();

  let decimal = Math.abs(deg) + min / 60 + sec / 3600;

  // Negative if S/W or if the degrees were negative
  if (dir === 'S' || dir === 'W' || deg < 0) {
    decimal = -decimal;
  }

  return decimal;
}

/** Check if the string contains DMS notation (degree symbol). */
function isDms(raw: string): boolean {
  return raw.includes('°');
}

export function parseCoordinates(raw: string | undefined): { lat: number; lng: number } | null {
  if (!raw || !raw.trim()) return null;

  const input = raw.trim();

  let lat: number;
  let lng: number;

  if (isDms(input)) {
    // Split on comma, or find two DMS groups by degree symbol
    const degParts = input.split('°');
    if (degParts.length < 3) return null; // Need at least 2 degree symbols → 3 parts

    // Strategy: split on comma first; if no comma, split by direction letters
    let parts: string[];
    if (input.includes(',')) {
      parts = input.split(',').map((s) => s.trim());
    } else {
      // Split after the first direction letter (N/S) to separate lat from lng
      const splitMatch = input.match(/(.+?[NSns]["″]?\s*),?\s*(.+)/);
      if (splitMatch) {
        parts = [splitMatch[1].trim(), splitMatch[2].trim()];
      } else {
        return null;
      }
    }

    if (parts.length !== 2) return null;

    const a = parseDmsPart(parts[0]);
    const b = parseDmsPart(parts[1]);
    if (a === null || b === null) return null;

    lat = a;
    lng = b;
  } else {
    // Decimal degrees: "lat, lng"
    const parts = input.split(',').map((s) => s.trim());
    if (parts.length !== 2) return null;

    lat = parseFloat(parts[0]);
    lng = parseFloat(parts[1]);

    if (isNaN(lat) || isNaN(lng)) return null;
  }

  // Range validation
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}
