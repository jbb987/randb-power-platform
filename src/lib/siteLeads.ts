import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { saveLead } from './leads';
import { SITE_LEADS_COLLECTION, type SiteLead, type SiteLeadStatus, type Lead } from '../types';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Live subscription to inbound landowner submissions, newest first. Single-field
 *  orderBy needs no composite index. */
export function subscribeSiteLeads(
  callback: (leads: SiteLead[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, SITE_LEADS_COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((d) => ({ ...(d.data() as SiteLead), id: d.id })));
    },
    (err) => {
      console.error('[Firebase] Site leads subscription error:', err);
      onError?.(err);
    },
  );
}

/** Update a site lead's review status (and optional reviewer/notes). */
export async function setSiteLeadStatus(
  id: string,
  status: SiteLeadStatus,
  reviewedBy?: string,
  reviewNotes?: string,
): Promise<void> {
  const patch: Record<string, unknown> = { status, updatedAt: Date.now() };
  if (reviewedBy !== undefined) patch.reviewedBy = reviewedBy;
  if (reviewNotes !== undefined) patch.reviewNotes = reviewNotes;
  try {
    await updateDoc(doc(db, SITE_LEADS_COLLECTION, id), patch);
  } catch (err) {
    console.error('[Firebase] Failed to set site lead status:', err);
    throw err;
  }
}

function mwLabel(mwRange: SiteLead['mwRange']): string {
  if (!mwRange) return '';
  if (mwRange.low && mwRange.high) return `${mwRange.low}–${mwRange.high} MW`;
  return mwRange.mid ? `${mwRange.mid} MW` : '';
}

/**
 * Promote a site lead into the sales `leads` pipeline (the Scott → verify →
 * hand-to-Bailey flow). Creates a `leads` doc assigned to the promoting user, then
 * stamps the site lead `qualified` + links it to the new lead. Returns the lead id.
 */
export async function promoteSiteLeadToLead(
  siteLead: SiteLead,
  assignedTo: { uid: string; name: string },
): Promise<string> {
  const now = Date.now();
  const leadId = generateId();
  const mw = mwLabel(siteLead.mwRange);
  const where = siteLead.address || `${siteLead.lat}, ${siteLead.lng}`;

  const lead: Lead = {
    id: leadId,
    assignedTo: assignedTo.uid,
    assignedToName: assignedTo.name,
    businessName: siteLead.landownerName,
    phone: siteLead.phone,
    email: '',
    description:
      `Landowner site lead — ${siteLead.verdict}${mw ? ` · ${mw}` : ''} · ${siteLead.acreage} ac` +
      `${siteLead.nearestSubstation ? ` · ${siteLead.nearestSubstation}` : ''}.`,
    decisionMakerName: siteLead.landownerName,
    decisionMakerRole: 'Landowner',
    status: 'new',
    source: 'site-lead',
    parcelAddress: where,
    notes: [],
    createdAt: now,
    updatedAt: now,
  };

  await saveLead(lead);
  await updateDoc(doc(db, SITE_LEADS_COLLECTION, siteLead.id), {
    status: 'qualified' satisfies SiteLeadStatus,
    promotedToLeadId: leadId,
    reviewedBy: assignedTo.uid,
    updatedAt: now,
  });

  return leadId;
}
