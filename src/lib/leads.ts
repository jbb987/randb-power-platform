import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Lead, LeadStatus, LeadNote } from '../types';

const LEADS_COLLECTION = 'leads';

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
