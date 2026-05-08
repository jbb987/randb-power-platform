/**
 * Resolve site coordinates → congressional district, then look up the House
 * rep and two senators via the Congress.gov member API.
 *
 * Steps:
 *   1. lat/lon → CD via TIGERweb /Legislative/MapServer (CORS-friendly,
 *      free, no key — different host from the CORS-blocked Census Geocoder).
 *   2. CD → House member + state → both senators via Congress.gov.
 *
 * Notes:
 * - The Congress.gov key is required only for step 2. Without the key we
 *   still return the resolved district but with `reps: []` and an explicit
 *   error — the UI shows that as "data unavailable" instead of a misleading
 *   green tick.
 * - State FIPS → 2-letter mapping is hand-coded below; keeps us off the
 *   network for that lookup and avoids another dependency.
 */

import { cachedFetch, TTL_INFRASTRUCTURE, TTL_SHORT } from '../requestCache';
import type { CongressionalRep } from './types';

const CD_ENDPOINT =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/0/query';

const STATE_FIPS_TO_USPS: Record<string, string> = {
  '01': 'AL',
  '02': 'AK',
  '04': 'AZ',
  '05': 'AR',
  '06': 'CA',
  '08': 'CO',
  '09': 'CT',
  '10': 'DE',
  '11': 'DC',
  '12': 'FL',
  '13': 'GA',
  '15': 'HI',
  '16': 'ID',
  '17': 'IL',
  '18': 'IN',
  '19': 'IA',
  '20': 'KS',
  '21': 'KY',
  '22': 'LA',
  '23': 'ME',
  '24': 'MD',
  '25': 'MA',
  '26': 'MI',
  '27': 'MN',
  '28': 'MS',
  '29': 'MO',
  '30': 'MT',
  '31': 'NE',
  '32': 'NV',
  '33': 'NH',
  '34': 'NJ',
  '35': 'NM',
  '36': 'NY',
  '37': 'NC',
  '38': 'ND',
  '39': 'OH',
  '40': 'OK',
  '41': 'OR',
  '42': 'PA',
  '44': 'RI',
  '45': 'SC',
  '46': 'SD',
  '47': 'TN',
  '48': 'TX',
  '49': 'UT',
  '50': 'VT',
  '51': 'VA',
  '53': 'WA',
  '54': 'WV',
  '55': 'WI',
  '56': 'WY',
};

interface CdQueryResponse {
  features?: Array<{
    attributes?: {
      STATE?: string;
      CD119?: string;
      BASENAME?: string;
      NAME?: string;
    };
  }>;
  error?: { message?: string };
}

interface ResolvedDistrict {
  state: string; // 2-letter USPS
  district: string; // numeric string ('23'), 'AL' for at-large, or 'AT'
  label: string; // 'TX-23'
}

async function lookupDistrict(lat: number, lng: number): Promise<ResolvedDistrict | null> {
  // The TIGERweb endpoint accepts the simple `lng,lat` form for point
  // geometries with esriGeometryPoint; the JSON-encoded form is rejected as
  // a 400 by the gateway. The outFields list must reference only fields
  // that exist on this layer (CD119FP / NAMELSAD do not — see layer schema).
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'STATE,CD119,BASENAME,NAME',
    returnGeometry: 'false',
    f: 'json',
  });
  const url = `${CD_ENDPOINT}?${params.toString()}`;

  const data = await cachedFetch<CdQueryResponse>(
    `politicalRadar:cd:${lat.toFixed(4)},${lng.toFixed(4)}`,
    async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`TIGERweb CD ${res.status}`);
      return (await res.json()) as CdQueryResponse;
    },
    TTL_INFRASTRUCTURE,
  );

  const f = data.features?.[0];
  const attr = f?.attributes;
  if (!attr) return null;

  const stateFips = attr.STATE ?? '';
  const usps = STATE_FIPS_TO_USPS[stateFips];
  if (!usps) return null;

  const district = (attr.CD119 ?? attr.BASENAME ?? '').replace(/^0+/, '') || 'AL';
  return {
    state: usps,
    district,
    label: `${usps}-${district}`,
  };
}

// ── Congress.gov member lookup ───────────────────────────────────────────

interface CongressMemberApiRow {
  bioguideId?: string;
  name?: string;
  partyName?: string;
  state?: string;
  district?: number | string | null;
  url?: string;
  terms?: { item?: Array<{ chamber?: string; endYear?: number | null; congress?: number }> };
}

interface MemberListResponse {
  members?: CongressMemberApiRow[];
}

interface MemberDetailResponse {
  member?: {
    bioguideId?: string;
    directOrderName?: string;
    invertedOrderName?: string;
    partyHistory?: Array<{ partyName?: string }>;
    addressInformation?: { phoneNumber?: string; officeAddress?: string };
    officialWebsiteUrl?: string;
    state?: string;
    district?: number | null;
    terms?: Array<{ chamber?: string; endYear?: number | null; congress?: number }>;
  };
}

function mapParty(name: string | undefined): 'R' | 'D' | 'I' | 'Other' | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower.startsWith('republic')) return 'R';
  if (lower.startsWith('democrat')) return 'D';
  if (lower.startsWith('independent')) return 'I';
  return 'Other';
}

/**
 * Distinguish chamber by the `district` field — Senate members come back
 * with `null` district, House members with a number. We tried inspecting the
 * `terms.item[].chamber` string first but the list-endpoint shape is
 * inconsistent (sometimes the array is empty), so this is the more reliable
 * signal.
 */
function inferChamber(member: CongressMemberApiRow): 'house' | 'senate' {
  return member.district === null || member.district === undefined ? 'senate' : 'house';
}

async function fetchEnrichedDetail(
  apiKey: string,
  bioguideId: string,
): Promise<{ phone?: string; url?: string; party?: string }> {
  try {
    const url = `https://api.congress.gov/v3/member/${bioguideId}?api_key=${apiKey}&format=json`;
    const data = await cachedFetch<MemberDetailResponse>(
      `politicalRadar:member:${bioguideId}`,
      async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Congress.gov member ${res.status}`);
        return (await res.json()) as MemberDetailResponse;
      },
      TTL_INFRASTRUCTURE,
    );
    const m = data.member;
    if (!m) return {};
    return {
      phone: m.addressInformation?.phoneNumber,
      url: m.officialWebsiteUrl,
      party: m.partyHistory?.[m.partyHistory.length - 1]?.partyName,
    };
  } catch {
    return {};
  }
}

/**
 * Current Congress number. The 119th began Jan 3 2025 and runs through
 * Jan 3 2027. Bump to 120 in early Jan 2027.
 */
const CURRENT_CONGRESS = 119;

async function fetchStateMembers(
  apiKey: string,
  stateUsps: string,
): Promise<CongressMemberApiRow[]> {
  // The congress-scoped endpoint guarantees only members serving in the
  // current Congress are returned — we don't have to parse term endYears.
  // Limit 50 covers Texas (38 House + 2 Senate) and every other state with
  // headroom; only CA approaches 55 with all members and we'd see that fast.
  const url = `https://api.congress.gov/v3/member/congress/${CURRENT_CONGRESS}/${stateUsps}?api_key=${apiKey}&limit=60&format=json`;
  const data = await cachedFetch<MemberListResponse>(
    `politicalRadar:stateMembers:${CURRENT_CONGRESS}:${stateUsps}`,
    async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Congress.gov state members ${res.status}`);
      return (await res.json()) as MemberListResponse;
    },
    TTL_SHORT,
  );
  return data.members ?? [];
}

export interface CongressionalRepsResult {
  resolvedDistrict: string | null;
  reps: CongressionalRep[];
  error: string | null;
}

export async function fetchCongressionalReps(
  lat: number,
  lng: number,
): Promise<CongressionalRepsResult> {
  let resolved: ResolvedDistrict | null = null;
  try {
    resolved = await lookupDistrict(lat, lng);
  } catch (err) {
    return {
      resolvedDistrict: null,
      reps: [],
      error: err instanceof Error ? err.message : 'District lookup failed',
    };
  }

  if (!resolved) {
    return {
      resolvedDistrict: null,
      reps: [],
      error: 'Could not resolve congressional district from coordinates.',
    };
  }

  const apiKey = import.meta.env.VITE_CONGRESS_API_KEY as string | undefined;
  if (!apiKey) {
    return {
      resolvedDistrict: resolved.label,
      reps: [],
      error: 'Congress.gov API key not configured (VITE_CONGRESS_API_KEY).',
    };
  }

  let stateMembers: CongressMemberApiRow[];
  try {
    stateMembers = await fetchStateMembers(apiKey, resolved.state);
  } catch (err) {
    return {
      resolvedDistrict: resolved.label,
      reps: [],
      error: err instanceof Error ? err.message : 'Member lookup failed',
    };
  }

  const senators = stateMembers.filter((m) => inferChamber(m) === 'senate');
  const districtNum = parseInt(resolved.district, 10);
  const houseMatch = stateMembers.find(
    (m) =>
      inferChamber(m) === 'house' &&
      m.district !== null &&
      m.district !== undefined &&
      Number(m.district) === (Number.isFinite(districtNum) ? districtNum : -1),
  );

  const picked = [...senators.slice(0, 2), ...(houseMatch ? [houseMatch] : [])];

  // Enrich with phone + website. Run in parallel to stay within the cold-fetch budget.
  const enriched = await Promise.all(
    picked.map(async (m) => {
      const detail = m.bioguideId ? await fetchEnrichedDetail(apiKey, m.bioguideId) : {};
      const chamber = inferChamber(m);
      return {
        bioguideId: m.bioguideId ?? null,
        name: m.name ?? '',
        party: mapParty(detail.party ?? m.partyName),
        chamber,
        state: resolved.state,
        district: chamber === 'house' ? resolved.district : undefined,
        phone: detail.phone,
        url: detail.url ?? m.url,
        // Committee data lives on a separate Congress.gov endpoint that
        // doesn't return assignments inline. v1 ships without committees.
        // Future PR: /member/{bioguideId}/committee-assignments.
        energyCommittees: [],
      } satisfies CongressionalRep;
    }),
  );

  return {
    resolvedDistrict: resolved.label,
    reps: enriched,
    error: null,
  };
}
