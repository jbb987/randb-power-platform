"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.diffKeys = diffKeys;
exports.pickFields = pickFields;
const types_1 = require("./types");
function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function deepEqual(a, b) {
    if (a === b)
        return true;
    if (a == null || b == null)
        return a === b;
    if (typeof a !== typeof b)
        return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length)
            return false;
        return a.every((v, i) => deepEqual(v, b[i]));
    }
    if (isObject(a) && isObject(b)) {
        const ak = Object.keys(a);
        const bk = Object.keys(b);
        if (ak.length !== bk.length)
            return false;
        return ak.every((k) => deepEqual(a[k], b[k]));
    }
    return false;
}
/** Top-level keys that differ between before and after, ignoring common + per-resource bookkeeping. */
function diffKeys(before, after, resourceType) {
    const ignored = types_1.RESOURCE_IGNORED_FIELDS[resourceType];
    const all = new Set();
    if (before)
        Object.keys(before).forEach((k) => all.add(k));
    if (after)
        Object.keys(after).forEach((k) => all.add(k));
    const changed = [];
    for (const key of all) {
        if (types_1.COMMON_IGNORED_FIELDS.has(key))
            continue;
        if (ignored?.has(key))
            continue;
        const a = before?.[key];
        const b = after?.[key];
        if (!deepEqual(a, b))
            changed.push(key);
    }
    return changed.sort();
}
/** Slice an object to only the listed keys — used to keep activity entries small. */
function pickFields(source, fields) {
    if (!source)
        return undefined;
    const out = {};
    let any = false;
    for (const k of fields) {
        if (k in source) {
            out[k] = source[k];
            any = true;
        }
    }
    return any ? out : undefined;
}
//# sourceMappingURL=diff.js.map