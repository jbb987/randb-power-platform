import * as admin from 'firebase-admin';
admin.initializeApp();

export { scrapeMobileBroadband } from './scrapeMobileBroadband';
export { cleanupConstructionJob } from './cleanupConstructionJob';
export { processUserDeletion } from './deleteUserAccount';
export {
  fetchRrcWells,
  triggerPmtilesBuild,
  triggerRrcBulksIngest,
  triggerPdqIngest,
  detectStatusChanges,
} from './wellFinder';
