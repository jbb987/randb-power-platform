"use strict";
/**
 * Keyword classifier + light regex tagger for the market-intelligence listener.
 *
 * The classifier delegates to the shared two-stage (topic+event) engine in
 * `../shared/twoStageClassify` — the same one Political Radar's bill filter uses.
 * A headline is kept only if it contains BOTH a TOPIC term (it's about data
 * centers) AND an EVENT term (a deal happened — announced / approved / invested
 * / broke ground / …).
 *
 * `extractLightTags` is pure regex — NO LLM. It pulls a first-pass US state, MW
 * figure, and dollar amount from the text. These are cheap, best-effort seeds
 * for the later structured-extraction phase, not authoritative fields.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENT_KEYWORDS = exports.TOPIC_KEYWORDS = void 0;
exports.isDataCenterDeal = isDataCenterDeal;
exports.extractLightTags = extractLightTags;
const twoStageClassify_1 = require("../shared/twoStageClassify");
const usStates_1 = require("../shared/usStates");
exports.TOPIC_KEYWORDS = [
    'data center',
    'data centre',
    'data centers',
    'data centres',
    'hyperscale',
    'colocation',
    'co-location',
    'server farm',
    'ai campus',
    'ai data',
    'compute campus',
];
exports.EVENT_KEYWORDS = [
    'announc',
    'approv',
    'invest',
    'break ground',
    'groundbreaking',
    'acquir',
    'propos',
    'rezon',
    'incentive',
    'tax abatement',
    'megawatt',
    'gigawatt',
    ' mw',
    'billion',
    'campus',
    'lease',
    'expansion',
    'expand',
];
/** Two-stage topic+event keyword filter over a headline (+ optional summary). */
function isDataCenterDeal(text) {
    return (0, twoStageClassify_1.twoStageClassify)(text, { topics: exports.TOPIC_KEYWORDS, events: exports.EVENT_KEYWORDS });
}
// A number, optional space, then a power unit at a word boundary. The optional
// trailing `s` catches the common plural ("100 megawatts"); the closing `\b`
// keeps "mw"/"gw" from matching inside longer words.
const MW_RE = /(\d[\d,]*(?:\.\d+)?)\s*(gigawatts?|gw|megawatts?|mw)\b/;
// A dollar amount with an optional magnitude unit. The trailing `\b` is what
// stops a bare `m`/`b` from binding to the next word — e.g. "$5 modular" must
// read as $5, not $5,000,000, while "$5M" / "$5 million" still scale correctly.
const USD_RE = /\$\s?(\d[\d,]*(?:\.\d+)?)\s*(trillion|billion|bn|million|b|m)?\b/;
/** Pure-regex first-pass tagging (no LLM). All fields are best-effort. */
function extractLightTags(text) {
    const lower = (text || '').toLowerCase();
    const tags = {};
    const state = (0, usStates_1.firstStateMentioned)(lower);
    if (state)
        tags.usState = state;
    const mw = lower.match(MW_RE);
    if (mw) {
        const n = parseFloat(mw[1].replace(/,/g, ''));
        if (!isNaN(n))
            tags.mwMentioned = /^g/.test(mw[2]) ? n * 1000 : n;
    }
    const usd = lower.match(USD_RE);
    if (usd) {
        let n = parseFloat(usd[1].replace(/,/g, ''));
        switch (usd[2]) {
            case 'trillion':
                n *= 1e12;
                break;
            case 'billion':
            case 'bn':
            case 'b':
                n *= 1e9;
                break;
            case 'million':
            case 'm':
                n *= 1e6;
                break;
        }
        if (!isNaN(n))
            tags.dollarsMentioned = n;
    }
    return tags;
}
//# sourceMappingURL=keywords.js.map