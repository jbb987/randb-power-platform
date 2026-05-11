import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Contact } from '../types';
import {
  saveContact,
  updateContactFields,
  deleteContact as deleteContactFromDB,
  subscribeContacts,
  subscribeContact,
} from '../lib/crmContacts';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeContacts(
      (remote) => {
        setContacts(remote);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  const createContact = useCallback(
    async (data: Omit<Contact, 'id' | 'createdAt' | 'updatedAt' | 'companyIds'>) => {
      const id = generateId();
      const contact: Contact = {
        ...data,
        companyIds: data.affiliations.map((a) => a.companyId),
        id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveContact(contact);
      return id;
    },
    [],
  );

  const updateContact = useCallback(async (id: string, fields: Partial<Contact>) => {
    await updateContactFields(id, fields);
  }, []);

  const removeContact = useCallback(async (id: string) => {
    await deleteContactFromDB(id);
  }, []);

  return {
    contacts,
    loading,
    createContact,
    updateContact,
    removeContact,
  };
}

/** In-memory filter on the full contacts list. Done client-side (rather than
 *  a server-side `array-contains` query) because pre-1.34 docs only have the
 *  legacy single `companyId` field, not the new `companyIds` mirror — the
 *  normalizer reconciles both shapes on read, and filtering here catches
 *  contacts regardless of which shape they were last written in. */
export function useContactsByCompany(companyId: string | undefined) {
  const { contacts: allContacts, loading } = useContacts();
  const contacts = useMemo(
    () => (companyId ? allContacts.filter((c) => c.companyIds.includes(companyId)) : []),
    [allContacts, companyId],
  );
  return { contacts, loading };
}

export function useContact(id: string | undefined) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState<boolean>(id != null);
  const [lastId, setLastId] = useState<string | undefined>(id);

  if (lastId !== id) {
    setLastId(id);
    setContact(null);
    setLoading(id != null);
  }

  useEffect(() => {
    if (!id) return;
    const unsub = subscribeContact(
      id,
      (remote) => {
        setContact(remote);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [id]);

  return { contact, loading };
}
