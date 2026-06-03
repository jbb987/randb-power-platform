"use strict";
/**
 * Threat-keyword filter for Political Radar bill ingest.
 *
 * Two-stage match: a bill becomes "tracked" if its title contains BOTH
 *   (a) at least one TOPIC keyword (data center / AI infrastructure / etc.) AND
 *   (b) at least one THREAT keyword (moratorium / restrict / pause / etc.)
 *
 * The two-stage filter dramatically cuts noise vs a single flat list. With
 * a flat list a bill like "To require a strategy for the defense of data
 * centers from external breaches" matches `data center` and surfaces as a
 * threat, even though it's protective in posture. With the topic+threat
 * filter, that same title would only match if it ALSO contained one of the
 * threat verbs — which it does not.
 *
 * We keep a small "always-include" passthrough for explicit DC-targeted
 * bills (e.g. AI moratorium) where the topic and threat are the same word.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALWAYS_INCLUDE = exports.THREAT_KEYWORDS = exports.TOPIC_KEYWORDS = void 0;
exports.classifyTitle = classifyTitle;
const twoStageClassify_1 = require("../shared/twoStageClassify");
exports.TOPIC_KEYWORDS = [
    'data center',
    'data centers',
    'artificial intelligence',
    ' ai infrastructure',
    ' ai data',
    'large load',
    'large-load',
    'co-location',
    'colocation',
    'hyperscale',
    'interconnection',
];
exports.THREAT_KEYWORDS = [
    'moratorium',
    'prohibit',
    'restrict',
    'limit on',
    'limitation on',
    'pause',
    'ban ',
    'banning',
    'cap on',
    'curtail',
    'tariff',
    'rate increase',
    'cost shift',
    'consumer protection',
    'siting',
];
/**
 * Phrases that are intrinsically threats — we surface the bill regardless
 * of whether it also contains a separate topic keyword.
 */
exports.ALWAYS_INCLUDE = [
    'ai moratorium',
    'artificial intelligence moratorium',
    'data center moratorium',
    'large-load tariff',
    'large load tariff',
];
/** Bill threat filter — delegates to the shared two-stage classifier. */
function classifyTitle(title) {
    return (0, twoStageClassify_1.twoStageClassify)(title, {
        topics: exports.TOPIC_KEYWORDS,
        events: exports.THREAT_KEYWORDS,
        alwaysInclude: exports.ALWAYS_INCLUDE,
    });
}
//# sourceMappingURL=keywords.js.map