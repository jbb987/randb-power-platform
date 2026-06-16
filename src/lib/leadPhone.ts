import { httpsCallableFromURL } from 'firebase/functions';
import { functions } from './firebase';

export interface RevealLeadPhoneResult {
  ok: boolean;
  requestId?: string;
  alreadyRevealed?: boolean;
}

// 2nd-gen callable: invoke the Cloud Run URL directly. The cloudfunctions.net
// alias the SDK builds by default isn't reliably routed for gen2 functions and
// fails the CORS preflight. Same project/region hash as apolloPhoneWebhook.
// If the project/region changes, update this (see `firebase functions:list`).
const REVEAL_LEAD_PHONE_URL = 'https://revealleadphone-dhgl2qoh4a-uc.a.run.app';

/**
 * Kick off an on-demand Apollo mobile-number reveal for a lead ("Grab number").
 * Returns once the async job is queued: the `revealLeadPhone` Cloud Function sets
 * the lead's mobileStatus='pending', then `apolloPhoneWebhook` writes mobilePhone +
 * mobileStatus='revealed' — which the real-time leads listener renders. One Apollo
 * credit is spent per reveal; the function authorizes the assigned rep or an admin.
 */
export async function revealLeadPhone(leadId: string): Promise<RevealLeadPhoneResult> {
  const callable = httpsCallableFromURL<{ leadId: string }, RevealLeadPhoneResult>(
    functions,
    REVEAL_LEAD_PHONE_URL,
  );
  const res = await callable({ leadId });
  return res.data;
}
