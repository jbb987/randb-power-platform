import * as admin from 'firebase-admin';
admin.initializeApp();

export { cleanupConstructionJob } from './cleanupConstructionJob';
export { processUserDeletion } from './deleteUserAccount';
export {
  fetchRrcWells,
  triggerPmtilesBuild,
  triggerRrcBulksIngest,
  triggerPdqIngest,
  detectStatusChanges,
} from './wellFinder';
export { refreshFederalBills, refreshFederalOfficials } from './politicalRadar';
export { onWorkItemWrite } from './taskIndex';
export {
  onCompanyWrite,
  onContactWrite,
  onDocumentWrite,
  onSiteWrite,
  onJobWrite,
  onTaskWrite,
  onLeadWrite,
  onUserWrite,
  onUserHistoryWrite,
  onUserSignedIn,
  onAuthUserCreated,
} from './activity';
