import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Company } from '../types';

const COMPANIES_COLLECTION = 'crm-companies';

function companiesRef() {
  return collection(db, COMPANIES_COLLECTION);
}

/** Canonical lowercased + trimmed form of a company name, used as an indexable
 *  field for dedup queries. Empty string when the input has no usable content. */
function nameLower(name: string | undefined | null): string {
  return (name ?? '').trim().toLowerCase();
}

export async function saveCompany(company: Company): Promise<void> {
  try {
    await setDoc(doc(db, COMPANIES_COLLECTION, company.id), {
      ...company,
      name_lower: nameLower(company.name),
    });
  } catch (err) {
    console.error('[Firebase] Failed to save company:', err);
    throw err;
  }
}

export async function updateCompanyFields(id: string, fields: Partial<Company>): Promise<void> {
  try {
    const payload: Partial<Company> & { updatedAt: number } = {
      ...fields,
      updatedAt: Date.now(),
    };
    // Keep name_lower in sync whenever the name is being updated.
    if (fields.name !== undefined) {
      payload.name_lower = nameLower(fields.name);
    }
    await updateDoc(doc(db, COMPANIES_COLLECTION, id), payload);
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

/** Check if a company with the given name already exists (case-insensitive).
 *  Returns the matching doc id, or null.
 *
 *  Uses a `where('name_lower', '==', needle)` query — costs 1 read regardless
 *  of collection size, indexed by Firestore automatically.
 *
 *  Falls back to a full scan only if a doc is missing the `name_lower` field
 *  (legacy data pre-migration). The scan path self-heals over time as legacy
 *  docs get re-saved with name_lower populated. Once all docs have been
 *  migrated, this fallback never runs. */
export async function findCompanyByName(name: string): Promise<string | null> {
  const needle = nameLower(name);
  if (!needle) return null;
  try {
    const fastQuery = query(companiesRef(), where('name_lower', '==', needle));
    const fastSnap = await getDocs(fastQuery);
    if (!fastSnap.empty) return fastSnap.docs[0].id;

    // Slow path: only legacy docs without name_lower would be missed by the
    // indexed query. Scan to catch them; self-healing migration runs in the
    // background.
    const allSnap = await getDocs(companiesRef());
    let match: string | null = null;
    const toMigrate: { id: string; name: string }[] = [];
    for (const d of allSnap.docs) {
      const data = d.data() as Company;
      if (data.name_lower) continue; // already migrated, would have been caught above
      const dl = nameLower(data.name);
      toMigrate.push({ id: d.id, name: data.name });
      if (!match && dl === needle) match = d.id;
    }
    // Lazy self-heal: backfill name_lower on the legacy docs we just read.
    // Best-effort — fire-and-forget, errors logged but don't block the lookup.
    void Promise.all(
      toMigrate.map((t) =>
        updateDoc(doc(db, COMPANIES_COLLECTION, t.id), {
          name_lower: nameLower(t.name),
        }).catch((err) => console.error('[Firebase] name_lower backfill failed:', t.id, err)),
      ),
    );
    return match;
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
