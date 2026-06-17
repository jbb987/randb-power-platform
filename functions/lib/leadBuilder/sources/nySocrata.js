"use strict";
/**
 * NY source adapter (P5). The state publishes one open-data assessment-roll feed
 * (data.ny.gov dataset 7vem-aaz7), so this single adapter covers ALL 62 NY
 * counties. Pulls the latest final roll for a county within the given
 * property-class ranges (e.g. [['700','800']] = industrial). Other states get
 * their own adapter behind the same shape.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchNyCountyParcels = fetchNyCountyParcels;
const DATASET = 'https://data.ny.gov/resource/7vem-aaz7.json';
async function fetchNyCountyParcels(county, rollYear, classRanges) {
    const clauses = classRanges
        .map(([lo, hi]) => `(property_class>='${lo}' AND property_class<'${hi}')`)
        .join(' OR ');
    const where = `roll_year=${rollYear} AND (${clauses})`;
    const qs = new URLSearchParams({ county_name: county, $where: where, $limit: '50000' });
    const res = await fetch(`${DATASET}?${qs.toString()}`);
    if (!res.ok)
        throw new Error(`NY Socrata ${res.status}: ${(await res.text()).slice(0, 150)}`);
    return (await res.json());
}
//# sourceMappingURL=nySocrata.js.map