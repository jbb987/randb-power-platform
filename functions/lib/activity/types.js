"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESOURCE_IGNORED_FIELDS = exports.COMMON_IGNORED_FIELDS = exports.SYSTEM_ACTOR = void 0;
exports.SYSTEM_ACTOR = {
    uid: 'system',
    email: 'system@randb',
};
/** Fields that should never appear in a diff — bookkeeping/timestamp/derived. */
exports.COMMON_IGNORED_FIELDS = new Set([
    'updatedAt',
    'createdAt',
    'lastModifiedAt',
]);
/** Per-resource ignore lists, merged with COMMON_IGNORED_FIELDS. */
exports.RESOURCE_IGNORED_FIELDS = {
    site: new Set([
        // Heavy analysis blobs — captured as separate `tool-run` entries via user-history mirror
        'appraisalResult',
        'infraResult',
        'broadbandResult',
        'transportResult',
        'waterResult',
        'gasResult',
        'laborResult',
        'piddrGeneratedAt',
        'lastAnalyzedAt',
    ]),
    user: new Set([
        'activityLastSeenAt',
        'lastLoginAt',
        'lastSeenAt',
    ]),
};
//# sourceMappingURL=types.js.map