import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Company } from '../types';

const COMPANIES_COLLECTION = 'crm-companies';

function companiesRef() {
  return collection(db, COMPANIES_COLLECTION);
}

export async function saveCompany(company: Company): Promise<void> {
  try {
    await setDoc(doc(db, COMPANIES_COLLECTION, company.id), company);
  } catch (err) {
    console.error('[Firebase] Failed to save company:', err);
    throw err;
  }
}

export async function updateCompanyFields(id: string, fields: Partial<Company>): Promise<void> {
  try {
    await updateDoc(doc(db, COMPANIES_COLLECTION, id), {
      ...fields,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase] Failed to update company:', err);
    throw err;
  }
}

export async function deleteCompany(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COMPANIES_COLLECTION, id));
  } catch (err) {
    console.error('[Firebase] Failed to delete company:', err);
    throw err;
  }
}

/** Check if a company with the given name already exists (case-insensitive). Returns matching doc id if so. */
export async function findCompanyByName(name: string): Promise<string | null> {
  try {
    const snapshot = await getDocs(companiesRef());
    const needle = name.trim().toLowerCase();
    const match = snapshot.docs.find((d) => {
      const data = d.data() as Company;
      return data.name.trim().toLowerCase() === needle;
    });
    return match ? match.id : null;
  } catch (err) {
    console.error('[Firebase] Failed to find company by name:', err);
    throw err;
  }
}

export function subscribeCompanies(
  callback: (companies: Company[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    companiesRef(),
    (snapshot) => {
      const companies = snapshot.docs.map((d) => d.data() as Company);
      companies.sort((a, b) => a.name.localeCompare(b.name));
      callback(companies);
    },
    (err) => {
      console.error('[Firebase] Companies subscription error:', err);
      onError?.(err);
    },
  );
}

export function subscribeCompany(
  id: string,
  callback: (company: Company | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, COMPANIES_COLLECTION, id),
    (snapshot) => {
      callback(snapshot.exists() ? (snapshot.data() as Company) : null);
    },
    (err) => {
      console.error('[Firebase] Company subscription error:', err);
      onError?.(err);
    },
  );
}
