"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAuthUserCreated = exports.onUserSignedIn = exports.onUserHistoryWrite = exports.onUserWrite = exports.onLeadWrite = exports.onTaskWrite = exports.onJobWrite = exports.onSiteWrite = exports.onDocumentWrite = exports.onContactWrite = exports.onCompanyWrite = void 0;
var triggers_1 = require("./triggers");
Object.defineProperty(exports, "onCompanyWrite", { enumerable: true, get: function () { return triggers_1.onCompanyWrite; } });
Object.defineProperty(exports, "onContactWrite", { enumerable: true, get: function () { return triggers_1.onContactWrite; } });
Object.defineProperty(exports, "onDocumentWrite", { enumerable: true, get: function () { return triggers_1.onDocumentWrite; } });
Object.defineProperty(exports, "onSiteWrite", { enumerable: true, get: function () { return triggers_1.onSiteWrite; } });
Object.defineProperty(exports, "onJobWrite", { enumerable: true, get: function () { return triggers_1.onJobWrite; } });
Object.defineProperty(exports, "onTaskWrite", { enumerable: true, get: function () { return triggers_1.onTaskWrite; } });
Object.defineProperty(exports, "onLeadWrite", { enumerable: true, get: function () { return triggers_1.onLeadWrite; } });
Object.defineProperty(exports, "onUserWrite", { enumerable: true, get: function () { return triggers_1.onUserWrite; } });
Object.defineProperty(exports, "onUserHistoryWrite", { enumerable: true, get: function () { return triggers_1.onUserHistoryWrite; } });
var authTriggers_1 = require("./authTriggers");
Object.defineProperty(exports, "onUserSignedIn", { enumerable: true, get: function () { return authTriggers_1.onUserSignedIn; } });
Object.defineProperty(exports, "onAuthUserCreated", { enumerable: true, get: function () { return authTriggers_1.onAuthUserCreated; } });
//# sourceMappingURL=index.js.map