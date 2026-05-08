/**
 * Geohash encoder (precision 1–12). Public-domain algorithm — no dep needed.
 *
 * Used as a Firestore cache key for federal-layer results: precision 5 yields
 * a ~5 km × 5 km cell, which is well below the resolution of any federal
 * signal (district / state / RTO).
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function geohashEncode(lat: number, lng: number, precision = 5): string {
  if (precision < 1 || precision > 12) {
    throw new Error(`geohash precision must be 1–12, got ${precision}`);
  }

  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;

  let bits = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = '';

  while (geohash.length < precision) {
    if (evenBit) {
      const lngMid = (lngMin + lngMax) / 2;
      if (lng >= lngMid) {
        bits = (bits << 1) | 1;
        lngMin = lngMid;
      } else {
        bits = bits << 1;
        lngMax = lngMid;
      }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (lat >= latMid) {
        bits = (bits << 1) | 1;
        latMin = latMid;
      } else {
        bits = bits << 1;
        latMax = latMid;
      }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      geohash += BASE32[bits];
      bits = 0;
      bit = 0;
    }
  }

  return geohash;
}
