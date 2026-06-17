import * as admin from 'firebase-admin';
admin.initializeApp();

export { cleanupConstructionJob, cleanupConstructionProjectsJob } from './cleanupConstructionJob';
export { processUserDeletion } from './deleteUserAccount';
export {
  fetchRrcWells,
  triggerPmtilesBuild,
  triggerRrcBulksIngest,
  triggerPdqIngest,
  detectStatusChanges,
} from './wellFinder';
export { refreshFederalBills, refreshFederalOfficials } from './politicalRadar';
export { refreshMarketIntel } from './marketIntel';
export { revealLeadPhone, apolloPhoneWebhook, processLeadPipeline } from './leadBuilder';
export {
  onCompanyWrite,
  onContactWrite,
  onDocumentWrite,
  onSiteWrite,
  onPreConSiteWrite,
  onJobWrite,
  onTaskWrite,
  onConstructionProjectsJobWrite,
  onConstructionProjectsTaskWrite,
  onJobDocumentWrite,
  onConstructionProjectsDocumentWrite,
  onUserTaskWrite,
  onLeadWrite,
  onUserWrite,
  onUserHistoryWrite,
  onUserSignedIn,
  onAuthUserCreated,
} from './activity';
