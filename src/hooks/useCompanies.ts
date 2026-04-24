import { useState, useCallback, useEffect } from 'react';
import type { Company } from '../types';
import { useAuth } from './useAuth';
import {
  saveCompany,
  updateCompanyFields,
  deleteCompany as deleteCompanyFromDB,
  subscribeCompanies,
  subscribeCompany,
  findCompanyByName,
} from '../lib/crmCompanies';
import { deleteContactsByCompany } from '../lib/crmContacts';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function useCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const unsub = subscribeCompanies(
      (remote) => {
        setCompanies(remote);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  const createCompany = useCallback(
    async (data: Omit<Company, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => {
      if (!user) throw new Error('Must be logged in to create a company');
      const existingId = await findCompanyByName(data.name);
      if (existingId) {
        throw new Error(`A company named "${data.name}" already exists`);
      }
      const id = generateId();
      const company: Company = {
        ...data,
        id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: user.uid,
      };
      await saveCompany(company);
      return id;
    },
    [user],
  );

  const updateCompany = useCallback(
    async (id: string, fields: Partial<Company>) => {
      if (fields.name) {
        const existingId = await findCompanyByName(fields.name);
        if (existingId && existingId !== id) {
          throw new Error(`A company named "${fields.name}" already exists`);
        }
      }
      await updateCompanyFields(id, fields);
    },
    [],
  );

  const removeCompany = useCallback(
    async (id: string) => {
      await deleteContactsByCompany(id);
      await deleteCompanyFromDB(id);
    },
    [],
  );

  return {
    companies,
    loading,
    createCompany,
    updateCompany,
    removeCompany,
  };
}

export function useCompany(id: string | undefined) {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState<boolean>(id != null);
  const [lastId, setLastId] = useState<string | undefined>(id);

  if (lastId !== id) {
    setLastId(id);
    setCompany(null);
    setLoading(id != null);
  }

  useEffect(() => {
    if (!id) return;
    const unsub = subscribeCompany(
      id,
      (remote) => {
        setCompany(remote);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [id]);

  return { company, loading };
}
