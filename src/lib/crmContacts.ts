import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Contact, ContactAffiliation } from '../types';

const CONTACTS_COLLECTION = 'crm-contacts';

function contactsRef() {
  return collection(db, CONTACTS_COLLECTION);
}

/** Pre-1.34 contacts had a single `companyId` + `title`. From 1.34 the same
 *  person can live at multiple customers via `affiliations[]`. This adapter
 *  reads either shape and always returns the new schema, so callers don't
 *  have to know about the legacy fields. */
function normalizeContact(raw: Record<string, unknown>): Contact {
  const c = raw as Partial<Contact> & {
    companyId?: string; // legacy
    title?: string; // legacy
  };

  let affiliations: ContactAffiliation[];
  if (Array.isArray(c.affiliations) && c.affiliations.length > 0) {
    affiliations = c.affiliations;
  } else if (c.companyId) {
    // Legacy: fold the single (companyId, title) into one primary affiliation.
    affiliations = [{ companyId: c.companyId, title: c.title, isPrimary: true }];
  } else {
    affiliations = [];
  }

  // Ensure at most one primary; if none, mark the first one primary.
  let sawPrimary = false;
  affiliations = affiliations.map((a) => {
    if (a.isPrimary && !sawPrimary) {
      sawPrimary = true;
      return a;
    }
    return { ...a, isPrimary: false };
  });
  if (!sawPrimary && affiliations.length > 0) {
    affiliations = affiliations.map((a, i) => (i === 0 ? { ...a, isPrimary: true } : a));
  }

  const companyIds = Array.from(new Set(affiliations.map((a) => a.companyId)));

  // Strip the legacy fields from the spread so consumers never see both shapes.
  const { companyId: _legacyCompanyId, title: _legacyTitle, ...rest } = c;

  return {
    ...(rest as Contact),
    affiliations,
    companyIds,
  };
}

/** Picks the contact's primary affiliation, or the first one if none is
 *  flagged primary. Returns `undefined` only for contacts with zero
 *  affiliations (shouldn't happen after normalize, but the API is honest). */
export function primaryAffiliation(c: Contact): ContactAffiliation | undefined {
  return c.affiliations.find((a) => a.isPrimary) ?? c.affiliations[0];
}

/** Derives the persisted shape: affiliations + companyIds mirror + a legacy
 *  `companyId`/`title` mirror from the primary affiliation so any older code
 *  paths still reading the legacy single-id field keep working. */
function buildPersistedFields(affiliations: ContactAffiliation[]): Record<string, unknown> {
  const primary = affiliations.find((a) => a.isPrimary) ?? affiliations[0];
  return {
    affiliations,
    companyIds: Array.from(new Set(affiliations.map((a) => a.companyId))),
    companyId: primary?.companyId ?? '',
    title: primary?.title ?? '',
  };
}

export async function saveContact(contact: Contact): Promise<void> {
  try {
    const persisted = {
      ...contact,
      ...buildPersistedFields(contact.affiliations),
    };
    await setDoc(doc(db, CONTACTS_COLLECTION, contact.id), persisted);
  } catch (err) {
    console.error('[Firebase] Failed to save contact:', err);
    throw err;
  }
}

export async function updateContactFields(id: string, fields: Partial<Contact>): Promise<void> {
  try {
    const patch: Record<string, unknown> = {
      ...fields,
      updatedAt: Date.now(),
    };
    if (Array.isArray(fields.affiliations)) {
      Object.assign(patch, buildPersistedFields(fields.affiliations));
    }
    await updateDoc(doc(db, CONTACTS_COLLECTION, id), patch);
  } catch (err) {
    console.error('[Firebase] Failed to update contact:', err);
    throw err;
  }
}

export async function deleteContact(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, CONTACTS_COLLECTION, id));
  } catch (err) {
    console.error('[Firebase] Failed to delete contact:', err);
    throw err;
  }
}

/** When a customer is deleted, sever its affiliations from all contacts.
 *  Contacts whose only affiliation was the deleted customer are removed.
 *  Contacts with other affiliations are updated to drop just this one.
 *
 *  Pre-1.34 this function blanket-deleted every contact whose `companyId`
 *  matched — now it scans the full collection (small) and decides per row. */
export async function deleteContactsByCompany(companyId: string): Promise<void> {
  try {
    const snapshot = await getDocs(contactsRef());
    if (snapshot.empty) return;
    const batch = writeBatch(db);
    let pending = 0;
    for (const docSnap of snapshot.docs) {
      const c = normalizeContact(docSnap.data());
      const has = c.affiliations.some((a) => a.companyId === companyId);
      if (!has) continue;
      const remaining = c.affiliations.filter((a) => a.companyId !== companyId);
      if (remaining.length === 0) {
        batch.delete(docSnap.ref);
      } else {
        // If we dropped the primary, promote the next one.
        if (!remaining.some((a) => a.isPrimary) && remaining[0]) {
          remaining[0] = { ...remaining[0], isPrimary: true };
        }
        batch.update(docSnap.ref, {
          ...buildPersistedFields(remaining),
          updatedAt: Date.now(),
        });
      }
      pending += 1;
    }
    if (pending > 0) await batch.commit();
  } catch (err) {
    console.error('[Firebase] Failed to detach contacts from company:', err);
    throw err;
  }
}

export function subscribeContacts(
  callback: (contacts: Contact[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    contactsRef(),
    (snapshot) => {
      const contacts = snapshot.docs.map((d) => normalizeContact(d.data()));
      contacts.sort((a, b) => {
        const an = `${a.lastName} ${a.firstName}`.toLowerCase();
        const bn = `${b.lastName} ${b.firstName}`.toLowerCase();
        return an.localeCompare(bn);
      });
      callback(contacts);
    },
    (err) => {
      console.error('[Firebase] Contacts subscription error:', err);
      onError?.(err);
    },
  );
}

export function subscribeContact(
  id: string,
  callback: (contact: Contact | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, CONTACTS_COLLECTION, id),
    (snapshot) => {
      callback(snapshot.exists() ? normalizeContact(snapshot.data()) : null);
    },
    (err) => {
      console.error('[Firebase] Contact subscription error:', err);
      onError?.(err);
    },
  );
}
