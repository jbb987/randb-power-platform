"use strict";
/**
 * Canonical US state name → USPS-code table, shared across Cloud Functions.
 * Single source of truth — previously duplicated in
 * `politicalRadar/refreshFederalOfficials.ts` and `marketIntel/keywords.ts`.
 *
 * Keys are Title-case (the Congress.gov API's full-name form). For free-text
 * scanning over lowercased text, use `firstStateMentioned`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATE_NAME_TO_USPS = void 0;
exports.firstStateMentioned = firstStateMentioned;
exports.STATE_NAME_TO_USPS = {
    Alabama: 'AL',
    Alaska: 'AK',
    Arizona: 'AZ',
    Arkansas: 'AR',
    California: 'CA',
    Colorado: 'CO',
    Connecticut: 'CT',
    Delaware: 'DE',
    'District of Columbia': 'DC',
    Florida: 'FL',
    Georgia: 'GA',
    Hawaii: 'HI',
    Idaho: 'ID',
    Illinois: 'IL',
    Indiana: 'IN',
    Iowa: 'IA',
    Kansas: 'KS',
    Kentucky: 'KY',
    Louisiana: 'LA',
    Maine: 'ME',
    Maryland: 'MD',
    Massachusetts: 'MA',
    Michigan: 'MI',
    Minnesota: 'MN',
    Mississippi: 'MS',
    Missouri: 'MO',
    Montana: 'MT',
    Nebraska: 'NE',
    Nevada: 'NV',
    'New Hampshire': 'NH',
    'New Jersey': 'NJ',
    'New Mexico': 'NM',
    'New York': 'NY',
    'North Carolina': 'NC',
    'North Dakota': 'ND',
    Ohio: 'OH',
    Oklahoma: 'OK',
    Oregon: 'OR',
    Pennsylvania: 'PA',
    'Rhode Island': 'RI',
    'South Carolina': 'SC',
    'South Dakota': 'SD',
    Tennessee: 'TN',
    Texas: 'TX',
    Utah: 'UT',
    Vermont: 'VT',
    Virginia: 'VA',
    Washington: 'WA',
    'West Virginia': 'WV',
    Wisconsin: 'WI',
    Wyoming: 'WY',
};
/** Lowercased-name → USPS, derived once for free-text scanning. */
const STATE_NAME_LOWER_TO_USPS = Object.fromEntries(Object.entries(exports.STATE_NAME_TO_USPS).map(([name, abbr]) => [name.toLowerCase(), abbr]));
/**
 * USPS code of the first US state mentioned in already-lowercased text (earliest
 * index wins), or undefined. Multi-word names ("new york") are matched whole.
 */
function firstStateMentioned(lowerText) {
    let bestIdx = Infinity;
    let best;
    for (const [name, abbr] of Object.entries(STATE_NAME_LOWER_TO_USPS)) {
        const idx = lowerText.indexOf(name);
        if (idx >= 0 && idx < bestIdx) {
            bestIdx = idx;
            best = abbr;
        }
    }
    return best;
}
//# sourceMappingURL=usStates.js.map