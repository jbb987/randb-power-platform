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
function classifyTitle(title) {
    const lower = (title || '').toLowerCase();
    if (!lower)
        return { matched: false, reason: 'empty title' };
    for (const phrase of exports.ALWAYS_INCLUDE) {
        if (lower.includes(phrase)) {
            return { matched: true, reason: `always-include: ${phrase}` };
        }
    }
    const topicHit = exports.TOPIC_KEYWORDS.find((k) => lower.includes(k));
    if (!topicHit)
        return { matched: false, reason: 'no topic keyword' };
    const threatHit = exports.THREAT_KEYWORDS.find((k) => lower.includes(k));
    if (!threatHit)
        return { matched: false, reason: `topic-only (${topicHit})` };
    return { matched: true, reason: `${topicHit} + ${threatHit}` };
}
//# sourceMappingURL=keywords.js.map