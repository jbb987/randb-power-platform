/**
 * Resolve site coordinates → congressional district → House rep + senators.
 *
 * Step 1 (lat/lon → CD) still hits TIGERweb live — the Census ArcGIS
 * service is CORS-friendly, free, and the district line is geographic so
 * it can't reasonably live in our Firestore cache.
 *
 * Step 2 (CD → 3 reps) reads from the `political-radar-federal-officials`
 * Firestore collection, populated weekly by the `refreshFederalOfficials`
 * Cloud Function. The browser never calls Congress.gov directly — no API
 * key in the client bundle.
 */

import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { cachedFetch, TTL_INFRASTRUCTURE } from '../requestCache';
import type { CongressionalRep } from './types';

const CD_ENDPOINT =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/0/query';

const OFFICIALS_COLLECTION = 'political-radar-federal-officials';
const META_DOC_PATH = ['political-radar-meta', 'officialsRefresh'] as const;

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
  district: string; // numeric string ('23'); 'AL' for at-large
  label: string; // 'TX-23'
}

async function lookupDistrict(lat: number, lng: number): Promise<ResolvedDistrict | null> {
  // Point geometry as `lng,lat` — TIGERweb rejects the JSON-encoded form.
  // outFields restricted to fields that exist on layer 0 (CD119FP / NAMELSAD
  // do not, and including them returns a 400).
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

// ── Firestore officials read ────────────────────────────────────────────

interface OfficialDoc {
  bioguideId: string;
  name: string;
  party: 'R' | 'D' | 'I' | 'Other' | null;
  chamber: 'house' | 'senate';
  stateUsps: string;
  district?: string;
  phone: string | null;
  url: string | null;
  congress: number;
}

async function readOfficialsForState(stateUsps: string): Promise<OfficialDoc[]> {
  const q = query(collection(db, OFFICIALS_COLLECTION), where('stateUsps', '==', stateUsps));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as OfficialDoc);
}

// ── Public entry point ──────────────────────────────────────────────────

export interface CongressionalRepsResult {
  resolvedDistrict: string | null;
  reps: CongressionalRep[];
  error: string | null;
}

export async function fetchCongressionalReps(
  lat: number,
  lng: number,
): Promise<CongressionalRepsResult> {
  // Step 1 — resolve district from coordinates.
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

  // Step 2 — verify the officials pipeline has run at least once.
  try {
    const metaSnap = await getDoc(doc(db, ...META_DOC_PATH));
    if (!metaSnap.exists()) {
      return {
        resolvedDistrict: resolved.label,
        reps: [],
        error:
          'Federal-officials ingest pipeline has not run yet. Deploy the refreshFederalOfficials Cloud Function and trigger a first run.',
      };
    }
  } catch (err) {
    return {
      resolvedDistrict: resolved.label,
      reps: [],
      error:
        err instanceof Error
          ? `Officials meta read failed: ${err.message}`
          : 'Officials meta read failed.',
    };
  }

  // Step 3 — read officials for that state.
  let officials: OfficialDoc[];
  try {
    officials = await readOfficialsForState(resolved.state);
  } catch (err) {
    return {
      resolvedDistrict: resolved.label,
      reps: [],
      error: err instanceof Error ? err.message : 'Officials read failed.',
    };
  }

  if (officials.length === 0) {
    return {
      resolvedDistrict: resolved.label,
      reps: [],
      error: `No officials cached for ${resolved.state}. Last weekly refresh may not have completed.`,
    };
  }

  const senators = officials.filter((o) => o.chamber === 'senate').slice(0, 2);
  const houseMatch = officials.find(
    (o) => o.chamber === 'house' && o.district === resolved.district,
  );
  const picked = [...senators, ...(houseMatch ? [houseMatch] : [])];

  const reps: CongressionalRep[] = picked.map((o) => ({
    bioguideId: o.bioguideId,
    name: o.name,
    party: o.party,
    chamber: o.chamber,
    state: o.stateUsps,
    district: o.chamber === 'house' ? o.district : undefined,
    phone: o.phone ?? undefined,
    url: o.url ?? undefined,
    energyCommittees: [],
  }));

  return {
    resolvedDistrict: resolved.label,
    reps,
    error: null,
  };
}
