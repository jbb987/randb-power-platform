/**
 * Firestore REST returns documents with `fields` typed-tagged
 *   { stringValue: "foo" } | { integerValue: "42" } | { booleanValue: true } | ...
 * These helpers convert that wire format to plain JS values, and the reverse
 * (for query filters).
 */

export type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }
  | { referenceValue: string }
  | { bytesValue: string }
  | { geoPointValue: { latitude: number; longitude: number } };

export function decodeValue(v: FirestoreValue): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields);
  if ('referenceValue' in v) return v.referenceValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  return null;
}

export function decodeFields(
  fields: Record<string, FirestoreValue> | undefined,
): Record<string, unknown> {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(fields)) {
    out[key] = decodeValue(val);
  }
  return out;
}

export interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

export function decodeDoc(doc: FirestoreDocument): { id: string; data: Record<string, unknown> } {
  const id = doc.name.split('/').pop() ?? '';
  return { id, data: decodeFields(doc.fields) };
}

export function encodeValue(v: unknown): FirestoreValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      fields[k] = encodeValue(val);
    }
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}
