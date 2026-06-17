"use strict";
/**
 * Tax-roll entity classifier (P5) — TypeScript port of the validated prototype
 * (classify_niagara.py / build_industrial.py). Decides whether a tax-roll owner
 * is a COMPANY worth pursuing vs a PERSON / EXEMPT row to drop, reading BOTH
 * name fields combined (the assessor splits long entity names across them, so
 * first-name alone is not a reliable person flag). Pure functions, no I/O.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeName = normalizeName;
exports.classifyEntity = classifyEntity;
exports.tierFor = tierFor;
exports.isLandlordName = isLandlordName;
// Government / institutional owners — not brokerage prospects.
const EXEMPT = /\b(CITY OF|COUNTY OF|TOWN OF|VILLAGE OF|STATE OF|SCHOOL|COLLEGE|UNIVERSIT|CHURCH|PARISH|DIOCESE|TEMPLE|LODGE|CLUB|AUTHORITY|HOUSING|HDFC|URBAN RENEWAL|FIRE (CO|DEPT|DIST)|CREDIT UNION|\bCU\b|FOUNDATION|MINISTR|NATION OF INDIANS|PASNY|NYPA|POWER AUTH)\b/;
// Entity suffix keywords. SUBSTR matches even when glued ("GalleryInc"); WORD needs a boundary.
const SUBSTR = /(LLC|INC|CORP|LLP|PLLC|MFG)/;
const WORD = /\b(CO|COMPANY|LTD|LIMITED|LP|PC|PA|ASSOC|ASSOCIATES|ENTERPRISES|HOLDINGS|PROPERTIES|REALTY|GROUP|PARTNERS|PARTNERSHIP|VENTURES|INDUSTRIES|MANUFACTURING|SERVICES|SYSTEMS|SUPPLY|EQUIPMENT|CONSTRUCTION|CONTRACTING|MOTORS|FOODS|MARKET|STORES|PLAZA|BANK|FUND|TRUST)\b/;
// A person name shape: trailing lone initial, generational suffix, or "& <name>".
const PERSON_PAT = /\b[A-Z]$|\b(JR|SR|II|III|IV)\b|&/;
// Landlord/real-estate cues used only for contact routing (never to drop).
const LANDLORD = /\b(PROPERTIES|PROPERTY|REALTY|REAL ESTATE|HOLDINGS|DEVELOPMENT|RENTALS?|LEASING|MANAGEMENT|MGMT|INVESTMENTS?|CAPITAL|EQUIT|ESTATES)\b/;
/** Combine + normalize the two owner name fields into one uppercase, punctuation-light string. */
function normalizeName(last, first) {
    let s = `${last} ${first}`.toUpperCase().replace(/\./g, ' ');
    s = s.replace(/\bL\s*L\s*C\b/g, 'LLC').replace(/CORPORATION/g, 'CORP').replace(/INCORPORATED/g, 'INC');
    s = s.replace(/\bCOMP\b/g, 'CO').replace(/ASSN/g, 'ASSOC');
    return s.replace(/[^\w&\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
/**
 * Classify on the COMBINED name. We only drop a row as PERSON when it is
 * confidently a short person shape; anything ambiguous falls to REVIEW (kept),
 * which protects suffix-less real companies (Lafarge, split-name Saint-Gobain).
 */
function classifyEntity(last, first) {
    const name = normalizeName(last, first);
    if (EXEMPT.test(name))
        return { cls: 'EXEMPT', name };
    if (SUBSTR.test(name) || WORD.test(name))
        return { cls: 'COMPANY', name };
    const toks = name.split(' ').filter(Boolean);
    const hasDigit = /\d/.test(name);
    if (first.trim() && !hasDigit && toks.length <= 3)
        return { cls: 'PERSON', name };
    if (!first.trim() && PERSON_PAT.test(name) && toks.length <= 3 && !hasDigit)
        return { cls: 'PERSON', name };
    return { cls: 'REVIEW', name };
}
function tierFor(marketValue) {
    if (marketValue >= 5_000_000)
        return 'GIANT';
    if (marketValue >= 1_500_000)
        return 'BIG';
    if (marketValue >= 500_000)
        return 'MID';
    return 'SMALL';
}
/** Landlord-ish name (incl. address-named SPE LLCs like "123 Main St LLC") — routing hint only. */
function isLandlordName(normalizedName) {
    return LANDLORD.test(normalizedName) || /^\d+\s/.test(normalizedName);
}
//# sourceMappingURL=classify.js.map