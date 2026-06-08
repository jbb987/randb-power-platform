// Firestore CRUD for saved one-line diagrams. Mirrors the preConSites pattern
// (auto id, auto-stamped updatedAt, live subscriptions, soft archive).

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { ONE_LINE_DIAGRAMS_COLLECTION, type OneLineDocument } from '../types';
import type { OneLineSpec } from './oneLine';

function ref() {
  return collection(db, ONE_LINE_DIAGRAMS_COLLECTION);
}

/** Next drawing number `RB-XX-E-NNN`, one past the highest sequence already in
 *  use. Parses the trailing `-E-NNN` of every existing drawing number so new
 *  diagrams don't all collide at -001. */
export function nextDrawingNumber(docs: OneLineDocument[]): string {
  let maxSeq = 0;
  for (const d of docs) {
    const m = /-E-0*(\d+)\s*$/i.exec(d.spec.drawingNo ?? '');
    if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
  }
  return `RB-XX-E-${String(maxSeq + 1).padStart(3, '0')}`;
}

export interface CreateOneLineInput {
  name: string;
  spec: OneLineSpec;
  createdBy: string;
  companyId?: string;
  siteRegistryId?: string;
}

export async function createOneLineDocument(input: CreateOneLineInput): Promise<string> {
  const id = doc(ref()).id;
  const now = Date.now();
  const document: OneLineDocument = {
    id,
    name: input.name || 'Untitled one-line',
    spec: input.spec,
    createdAt: now,
    createdBy: input.createdBy,
    updatedAt: now,
    ...(input.companyId ? { companyId: input.companyId } : {}),
    ...(input.siteRegistryId ? { siteRegistryId: input.siteRegistryId } : {}),
  };
  await setDoc(doc(db, ONE_LINE_DIAGRAMS_COLLECTION, id), document);
  return id;
}

export async function updateOneLineDocument(
  id: string,
  updates: Partial<Omit<OneLineDocument, 'id' | 'createdAt' | 'createdBy'>>,
): Promise<void> {
  await updateDoc(doc(db, ONE_LINE_DIAGRAMS_COLLECTION, id), {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function archiveOneLineDocument(id: string): Promise<void> {
  await updateDoc(doc(db, ONE_LINE_DIAGRAMS_COLLECTION, id), {
    archivedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function restoreOneLineDocument(id: string): Promise<void> {
  await updateDoc(doc(db, ONE_LINE_DIAGRAMS_COLLECTION, id), {
    archivedAt: null,
    updatedAt: Date.now(),
  });
}

export async function getOneLineDocument(id: string): Promise<OneLineDocument | null> {
  const snap = await getDoc(doc(db, ONE_LINE_DIAGRAMS_COLLECTION, id));
  return snap.exists() ? (snap.data() as OneLineDocument) : null;
}

export function subscribeOneLineDocuments(
  callback: (docs: OneLineDocument[]) => void,
  options: { includeArchived?: boolean } = {},
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    ref(),
    (snap) => {
      const list = snap.docs.map((d) => d.data() as OneLineDocument);
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      callback(options.includeArchived ? list : list.filter((d) => !d.archivedAt));
    },
    (err) => {
      console.error('[oneLineDiagrams] subscribe error:', err);
      onError?.(err);
    },
  );
}

export function subscribeOneLineDocumentsByCompany(
  companyId: string,
  callback: (docs: OneLineDocument[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(ref(), where('companyId', '==', companyId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as OneLineDocument);
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      callback(list.filter((d) => !d.archivedAt));
    },
    (err) => {
      console.error('[oneLineDiagrams] subscribe by company error:', err);
      onError?.(err);
    },
  );
}

export function subscribeOneLineDocument(
  id: string,
  callback: (doc: OneLineDocument | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, ONE_LINE_DIAGRAMS_COLLECTION, id),
    (snap) => callback(snap.exists() ? (snap.data() as OneLineDocument) : null),
    (err) => {
      console.error('[oneLineDiagrams] subscribe single error:', err);
      onError?.(err);
    },
  );
}
