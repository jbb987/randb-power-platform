"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAuthUserCreated = exports.onUserSignedIn = exports.onUserHistoryWrite = exports.onUserWrite = exports.onLeadWrite = exports.onUserTaskWrite = exports.onConstructionProjectsDocumentWrite = exports.onJobDocumentWrite = exports.onConstructionProjectsTaskWrite = exports.onConstructionProjectsJobWrite = exports.onTaskWrite = exports.onJobWrite = exports.onPreConSiteWrite = exports.onSiteWrite = exports.onDocumentWrite = exports.onContactWrite = exports.onCompanyWrite = exports.refreshMarketIntel = exports.refreshFederalOfficials = exports.refreshFederalBills = exports.detectStatusChanges = exports.triggerPdqIngest = exports.triggerRrcBulksIngest = exports.triggerPmtilesBuild = exports.fetchRrcWells = exports.processUserDeletion = exports.cleanupConstructionProjectsJob = exports.cleanupConstructionJob = void 0;
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
var cleanupConstructionJob_1 = require("./cleanupConstructionJob");
Object.defineProperty(exports, "cleanupConstructionJob", { enumerable: true, get: function () { return cleanupConstructionJob_1.cleanupConstructionJob; } });
Object.defineProperty(exports, "cleanupConstructionProjectsJob", { enumerable: true, get: function () { return cleanupConstructionJob_1.cleanupConstructionProjectsJob; } });
var deleteUserAccount_1 = require("./deleteUserAccount");
Object.defineProperty(exports, "processUserDeletion", { enumerable: true, get: function () { return deleteUserAccount_1.processUserDeletion; } });
var wellFinder_1 = require("./wellFinder");
Object.defineProperty(exports, "fetchRrcWells", { enumerable: true, get: function () { return wellFinder_1.fetchRrcWells; } });
Object.defineProperty(exports, "triggerPmtilesBuild", { enumerable: true, get: function () { return wellFinder_1.triggerPmtilesBuild; } });
Object.defineProperty(exports, "triggerRrcBulksIngest", { enumerable: true, get: function () { return wellFinder_1.triggerRrcBulksIngest; } });
Object.defineProperty(exports, "triggerPdqIngest", { enumerable: true, get: function () { return wellFinder_1.triggerPdqIngest; } });
Object.defineProperty(exports, "detectStatusChanges", { enumerable: true, get: function () { return wellFinder_1.detectStatusChanges; } });
var politicalRadar_1 = require("./politicalRadar");
Object.defineProperty(exports, "refreshFederalBills", { enumerable: true, get: function () { return politicalRadar_1.refreshFederalBills; } });
Object.defineProperty(exports, "refreshFederalOfficials", { enumerable: true, get: function () { return politicalRadar_1.refreshFederalOfficials; } });
var marketIntel_1 = require("./marketIntel");
Object.defineProperty(exports, "refreshMarketIntel", { enumerable: true, get: function () { return marketIntel_1.refreshMarketIntel; } });
var activity_1 = require("./activity");
Object.defineProperty(exports, "onCompanyWrite", { enumerable: true, get: function () { return activity_1.onCompanyWrite; } });
Object.defineProperty(exports, "onContactWrite", { enumerable: true, get: function () { return activity_1.onContactWrite; } });
Object.defineProperty(exports, "onDocumentWrite", { enumerable: true, get: function () { return activity_1.onDocumentWrite; } });
Object.defineProperty(exports, "onSiteWrite", { enumerable: true, get: function () { return activity_1.onSiteWrite; } });
Object.defineProperty(exports, "onPreConSiteWrite", { enumerable: true, get: function () { return activity_1.onPreConSiteWrite; } });
Object.defineProperty(exports, "onJobWrite", { enumerable: true, get: function () { return activity_1.onJobWrite; } });
Object.defineProperty(exports, "onTaskWrite", { enumerable: true, get: function () { return activity_1.onTaskWrite; } });
Object.defineProperty(exports, "onConstructionProjectsJobWrite", { enumerable: true, get: function () { return activity_1.onConstructionProjectsJobWrite; } });
Object.defineProperty(exports, "onConstructionProjectsTaskWrite", { enumerable: true, get: function () { return activity_1.onConstructionProjectsTaskWrite; } });
Object.defineProperty(exports, "onJobDocumentWrite", { enumerable: true, get: function () { return activity_1.onJobDocumentWrite; } });
Object.defineProperty(exports, "onConstructionProjectsDocumentWrite", { enumerable: true, get: function () { return activity_1.onConstructionProjectsDocumentWrite; } });
Object.defineProperty(exports, "onUserTaskWrite", { enumerable: true, get: function () { return activity_1.onUserTaskWrite; } });
Object.defineProperty(exports, "onLeadWrite", { enumerable: true, get: function () { return activity_1.onLeadWrite; } });
Object.defineProperty(exports, "onUserWrite", { enumerable: true, get: function () { return activity_1.onUserWrite; } });
Object.defineProperty(exports, "onUserHistoryWrite", { enumerable: true, get: function () { return activity_1.onUserHistoryWrite; } });
Object.defineProperty(exports, "onUserSignedIn", { enumerable: true, get: function () { return activity_1.onUserSignedIn; } });
Object.defineProperty(exports, "onAuthUserCreated", { enumerable: true, get: function () { return activity_1.onAuthUserCreated; } });
//# sourceMappingURL=index.js.map