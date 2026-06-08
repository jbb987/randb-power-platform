/**
 * Thin typed wrappers over the Firestore REST API.
 * - getDoc — single document by id (returns null on 404)
 * - runQuery — structured query with where/orderBy/limit
 *
 * No writes — this is the MCP server's read-only surface to Firestore.
 */

import { getAccessToken, getProjectId } from './auth';
import { decodeDoc, encodeValue, type FirestoreDocument } from './decode';

interface ClientEnv {
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  FIREBASE_PROJECT_ID?: string;
}

function baseUrl(env: ClientEnv): string {
  return `https://firestore.googleapis.com/v1/projects/${getProjectId(env)}/databases/(default)/documents`;
}

async function firestoreFetch(env: ClientEnv, path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken(env);
  return fetch(`${baseUrl(env)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

export async function getDoc(
  env: ClientEnv,
  collection: string,
  id: string,
): Promise<{ id: string; data: Record<string, unknown> } | null> {
  const res = await firestoreFetch(env, `/${collection}/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Firestore getDoc ${collection}/${id} failed: ${res.status} ${text.slice(0, 300)}`,
    );
  }
  const doc = (await res.json()) as FirestoreDocument;
  return decodeDoc(doc);
}

export type FilterOp =
  | 'EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'NOT_EQUAL'
  | 'ARRAY_CONTAINS'
  | 'IN'
  | 'ARRAY_CONTAINS_ANY'
  | 'NOT_IN';

export interface FieldFilter {
  field: string;
  op: FilterOp;
  value: unknown;
}

export interface Order {
  field: string;
  direction: 'ASCENDING' | 'DESCENDING';
}

export interface RunQueryOpts {
  collection: string;
  where?: FieldFilter[];
  orderBy?: Order[];
  limit?: number;
}

export async function runQuery(
  env: ClientEnv,
  opts: RunQueryOpts,
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const filters = (opts.where ?? []).map((f) => ({
    fieldFilter: {
      field: { fieldPath: f.field },
      op: f.op,
      value: encodeValue(f.value),
    },
  }));

  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId: opts.collection }],
  };

  if (filters.length === 1) {
    structuredQuery.where = filters[0];
  } else if (filters.length > 1) {
    structuredQuery.where = { compositeFilter: { op: 'AND', filters } };
  }

  if (opts.orderBy && opts.orderBy.length) {
    structuredQuery.orderBy = opts.orderBy.map((o) => ({
      field: { fieldPath: o.field },
      direction: o.direction,
    }));
  }

  if (opts.limit) structuredQuery.limit = opts.limit;

  const res = await firestoreFetch(env, `:runQuery`, {
    method: 'POST',
    body: JSON.stringify({ structuredQuery }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Firestore runQuery ${opts.collection} failed: ${res.status} ${text.slice(0, 500)}`,
    );
  }

  const raw = (await res.json()) as Array<{ document?: FirestoreDocument; readTime?: string }>;
  const docs: Array<{ id: string; data: Record<string, unknown> }> = [];
  for (const entry of raw) {
    if (entry.document) docs.push(decodeDoc(entry.document));
  }
  return docs;
}
