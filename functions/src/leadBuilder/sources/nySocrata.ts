/**
 * NY source adapter (P5). The state publishes one open-data assessment-roll feed
 * (data.ny.gov dataset 7vem-aaz7), so this single adapter covers ALL 62 NY
 * counties. Pulls the latest final roll for a county within the given
 * property-class ranges (e.g. [['700','800']] = industrial). Other states get
 * their own adapter behind the same shape.
 */

const DATASET = 'https://data.ny.gov/resource/7vem-aaz7.json';

export interface RawParcel {
  primary_owner_last_name?: string;
  primary_owner_first_name?: string;
  parcel_address_number?: string;
  parcel_address_street?: string;
  parcel_address_suff?: string;
  mailing_address_number?: string;
  mailing_address_street?: string;
  mailing_address_city?: string;
  mailing_address_state?: string;
  property_class?: string;
  property_class_description?: string;
  full_market_value?: string;
  municipality_name?: string;
  swis_code?: string;
  print_key_code?: string;
  roll_year?: string;
}

export async function fetchNyCountyParcels(
  county: string,
  rollYear: string,
  classRanges: [string, string][],
): Promise<RawParcel[]> {
  // rollYear is interpolated unquoted into the SoQL $where — validate it is a
  // bare 4-digit year so it can't inject SoQL (AUDIT: SoQL injection, low).
  if (!/^\d{4}$/.test(String(rollYear))) {
    throw new Error(`Invalid rollYear (expected a 4-digit year): ${rollYear}`);
  }
  const clauses = classRanges
    .map(([lo, hi]) => `(property_class>='${lo}' AND property_class<'${hi}')`)
    .join(' OR ');
  const where = `roll_year=${rollYear} AND (${clauses})`;
  const qs = new URLSearchParams({ county_name: county, $where: where, $limit: '50000' });
  const res = await fetch(`${DATASET}?${qs.toString()}`);
  if (!res.ok) throw new Error(`NY Socrata ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return (await res.json()) as RawParcel[];
}
