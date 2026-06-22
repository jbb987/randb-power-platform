import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Lead, LeadStatus, LeadNote, LeadContact, LeadAltPhone, LeadDocument } from '../types';

const LEADS_COLLECTION = 'leads';

// Inline-array fields mutated one item at a time. We use arrayUnion/arrayRemove
// rather than read-modify-write so concurrent edits (two tabs, an upload racing a
// remove) can't clobber each other — items carry unique ids, so deep-equality
// matching in arrayRemove is exact.
type LeadArrayField = 'additionalContacts' | 'altPhones' | 'documents';
type LeadArrayItem = LeadContact | LeadAltPhone | LeadDocument;

export async function addLeadArrayItem(
  id: string,
  field: LeadArrayField,
  item: LeadArrayItem,
): Promise<void> {
  await updateDoc(doc(db, LEADS_COLLECTION, id), {
    [field]: arrayUnion(item),
    updatedAt: Date.now(),
  });
}

export async function removeLeadArrayItem(
  id: string,
  field: LeadArrayField,
  item: LeadArrayItem,
): Promise<void> {
  await updateDoc(doc(db, LEADS_COLLECTION, id), {
    [field]: arrayRemove(item),
    updatedAt: Date.now(),
  });
}

function leadsRef() {
  return collection(db, LEADS_COLLECTION);
}

export async function saveLead(lead: Lead): Promise<void> {
  try {
    await setDoc(doc(db, LEADS_COLLECTION, lead.id), lead);
  } catch (err) {
    console.error('[Firebase] Failed to save lead:', err);
    throw err;
  }
}

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<void> {
  try {
    await updateDoc(doc(db, LEADS_COLLECTION, id), {
      status,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase] Failed to update lead status:', err);
    throw err;
  }
}

export async function updateLeadFields(id: string, fields: Partial<Lead>): Promise<void> {
  try {
    await updateDoc(doc(db, LEADS_COLLECTION, id), {
      ...fields,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase] Failed to update lead:', err);
    throw err;
  }
}

export async function addLeadNote(id: string, notes: LeadNote[]): Promise<void> {
  try {
    await updateDoc(doc(db, LEADS_COLLECTION, id), {
      notes,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase] Failed to add lead note:', err);
    throw err;
  }
}

export async function deleteLead(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, LEADS_COLLECTION, id));
  } catch (err) {
    console.error('[Firebase] Failed to delete lead:', err);
    throw err;
  }
}

export function subscribeLeads(
  callback: (leads: Lead[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    leadsRef(),
    (snapshot) => {
      const leads = snapshot.docs.map((d) => d.data() as Lead);
      leads.sort((a, b) => b.createdAt - a.createdAt);
      callback(leads);
    },
    (err) => {
      console.error('[Firebase] Leads subscription error:', err);
      onError?.(err);
    },
  );
}
