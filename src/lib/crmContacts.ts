import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  getDocs,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Contact } from '../types';

const CONTACTS_COLLECTION = 'crm-contacts';

function contactsRef() {
  return collection(db, CONTACTS_COLLECTION);
}

export async function saveContact(contact: Contact): Promise<void> {
  try {
    await setDoc(doc(db, CONTACTS_COLLECTION, contact.id), contact);
  } catch (err) {
    console.error('[Firebase] Failed to save contact:', err);
    throw err;
  }
}

export async function updateContactFields(id: string, fields: Partial<Contact>): Promise<void> {
  try {
    await updateDoc(doc(db, CONTACTS_COLLECTION, id), {
      ...fields,
      updatedAt: Date.now(),
    });
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

/** Delete every contact belonging to the given company. Used when deleting a company. */
export async function deleteContactsByCompany(companyId: string): Promise<void> {
  try {
    const q = query(contactsRef(), where('companyId', '==', companyId));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;
    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    console.error('[Firebase] Failed to delete contacts by company:', err);
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
      const contacts = snapshot.docs.map((d) => d.data() as Contact);
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

export function subscribeContactsByCompany(
  companyId: string,
  callback: (contacts: Contact[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(contactsRef(), where('companyId', '==', companyId));
  return onSnapshot(
    q,
    (snapshot) => {
      const contacts = snapshot.docs.map((d) => d.data() as Contact);
      contacts.sort((a, b) => {
        const an = `${a.lastName} ${a.firstName}`.toLowerCase();
        const bn = `${b.lastName} ${b.firstName}`.toLowerCase();
        return an.localeCompare(bn);
      });
      callback(contacts);
    },
    (err) => {
      console.error('[Firebase] Contacts-by-company subscription error:', err);
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
      callback(snapshot.exists() ? (snapshot.data() as Contact) : null);
    },
    (err) => {
      console.error('[Firebase] Contact subscription error:', err);
      onError?.(err);
    },
  );
}
