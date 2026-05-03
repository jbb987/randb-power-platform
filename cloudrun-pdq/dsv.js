/**
 * DSV parser for RRC PDQ Dump files. Quirks per the official manual:
 *   - Delimiter is `}` (right curly brace) — NOT pipe
 *   - No quoting / no escaping
 *   - First line is the header row
 *   - Line endings are CRLF or LF (sniff)
 */

/**
 * Streaming line splitter — yields { headerCols, rowCols } for every line
 * in the input ReadableStream (Node Readable / web ReadableStream both
 * accepted via Symbol.asyncIterator). The first row is treated as the
 * header and emitted with isHeader=true.
 */
export async function* parseDsvStream(byteStream) {
  const decoder = new TextDecoder('latin1'); // PDQ is ASCII; latin1 is safe & cheap
  let buffer = '';
  let headerCols = null;
  let lineNo = 0;

  for await (const chunk of byteStream) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      lineNo++;
      const cols = line.split('}');
      if (lineNo === 1) {
        headerCols = cols;
        yield { headerCols, rowCols: cols, isHeader: true, lineNo };
      } else {
        yield { headerCols, rowCols: cols, isHeader: false, lineNo };
      }
    }
  }

  // Trailing partial line (no terminator)
  if (buffer.length > 0) {
    let line = buffer;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line.length > 0) {
      lineNo++;
      const cols = line.split('}');
      yield { headerCols, rowCols: cols, isHeader: false, lineNo };
    }
  }
}

/**
 * Build a column-name → index lookup from a header row, normalizing names
 * (uppercase, strip whitespace).
 */
export function buildColumnIndex(headerCols) {
  const idx = new Map();
  headerCols.forEach((name, i) => {
    idx.set(name.trim().toUpperCase(), i);
  });
  return idx;
}

export function getCol(rowCols, idx, name) {
  const i = idx.get(name.toUpperCase());
  if (i == null) return undefined;
  const v = rowCols[i];
  return v == null ? undefined : v;
}

export function getInt(rowCols, idx, name) {
  const v = getCol(rowCols, idx, name);
  if (v == null || v === '') return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

export function getNumber(rowCols, idx, name) {
  const v = getCol(rowCols, idx, name);
  if (v == null || v === '') return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

export function getStr(rowCols, idx, name) {
  const v = getCol(rowCols, idx, name);
  if (v == null) return undefined;
  const t = String(v).trim();
  return t.length === 0 ? undefined : t;
}
