/**
 * Orphan Wells parser — Texas RRC's monthly Orphan Wells (P-5 delinquent
 * >12 months) list. Distributed as a ZIP containing a single .xlsx.
 */
import { parse as parseHtml } from 'node-html-parser';
import AdmZip from 'adm-zip';
import ExcelJS from 'exceljs';

const LANDING_URL =
  'https://www.rrc.texas.gov/oil-and-gas/research-and-statistics/well-information/orphan-wells-12-months/';

async function findLatestOrphanZipUrl() {
  const res = await fetch(LANDING_URL);
  if (!res.ok) throw new Error(`Orphan landing page HTTP ${res.status}`);
  const html = await res.text();

  const match = html.match(/href="(\/media\/[^"]+\/orphanwells-[^"]+\.zip)"/i);
  if (match) return `https://www.rrc.texas.gov${match[1]}`;

  // Fallback parse
  const root = parseHtml(html);
  const link = root
    .querySelectorAll('a')
    .find((a) => /orphanwells-[^"]+\.zip$/i.test(a.getAttribute('href') || ''));
  if (!link) throw new Error('No Orphan Wells .zip link found');
  const href = link.getAttribute('href');
  return href.startsWith('http') ? href : `https://www.rrc.texas.gov${href}`;
}

function trimOrUndef(s) {
  const t = String(s ?? '').trim();
  return t.length ? t : undefined;
}
function toInt(s) {
  const n = parseInt(String(s ?? '').trim(), 10);
  return Number.isFinite(n) ? n : undefined;
}
/** Normalize a raw API value (might be number or string, varying widths) to 8-char string. */
function normalizeApi(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Strip any non-digits, then left-pad to 8 chars
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(8, '0').slice(-8);
}

export async function ingestOrphan() {
  console.log('[orphan] discovering latest ZIP URL…');
  const url = await findLatestOrphanZipUrl();
  console.log(`[orphan] fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Orphan ZIP fetch HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const zip = new AdmZip(buf);
  const xlsxEntry = zip.getEntries().find((e) => /\.xlsx$/i.test(e.entryName));
  if (!xlsxEntry) throw new Error('No .xlsx inside Orphan Wells ZIP');
  console.log(`[orphan] extracting ${xlsxEntry.entryName}`);
  const xlsxBuf = xlsxEntry.getData();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsxBuf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Orphan Wells xlsx has no worksheet');

  // Read header row.
  const headerRow = ws.getRow(1);
  const headerNames = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headerNames[col] = String(cell.value ?? '').trim();
  });

  // Verified live (April 2026): DISTRICT_NAME | API | OPERATOR_NAME |
  // LEASE_NAME | OPERATOR_NO | LEASE_ID | WELL_NO | FIELD_NAME |
  // COUNTY_NAME | CALC_MONTHS_P5_INACT | latitude | longitude
  const findCol = (...candidates) => {
    for (const cand of candidates) {
      const idx = headerNames.findIndex(
        (h) => h && h.toLowerCase().replace(/[\s_-]/g, '') === cand.toLowerCase().replace(/[\s_-]/g, ''),
      );
      if (idx >= 0) return idx;
    }
    return null;
  };

  const cols = {
    api:           findCol('API'),
    operatorName:  findCol('OPERATOR_NAME', 'OPERATOR NAME', 'OPERATOR'),
    operatorNum:   findCol('OPERATOR_NO', 'OPERATOR NO', 'P-5', 'P5'),
    leaseName:     findCol('LEASE_NAME', 'LEASE NAME'),
    leaseId:       findCol('LEASE_ID', 'LEASE ID'),
    wellNo:        findCol('WELL_NO', 'WELL NO', 'WELL NUMBER'),
    fieldName:     findCol('FIELD_NAME', 'FIELD NAME'),
    county:        findCol('COUNTY_NAME', 'COUNTY NAME', 'COUNTY'),
    district:      findCol('DISTRICT_NAME', 'DISTRICT NAME', 'DISTRICT'),
    monthsInact:   findCol('CALC_MONTHS_P5_INACT', 'MONTHS_P5_INACT'),
  };

  if (cols.api == null) {
    console.warn('[orphan] could not locate API column — headers were:', headerNames.filter(Boolean).join(' | '));
    return new Map();
  }

  const records = new Map();
  let skipped = 0;

  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return; // header
    const rawApi = row.getCell(cols.api).value;
    const api = normalizeApi(rawApi);
    if (!api) { skipped++; return; }

    const enrichment = {
      orphanListed:           true,
      orphanOperator:         cols.operatorName != null ? trimOrUndef(row.getCell(cols.operatorName).value) : undefined,
      orphanOperatorP5:       cols.operatorNum  != null ? trimOrUndef(row.getCell(cols.operatorNum).value)  : undefined,
      orphanLeaseName:        cols.leaseName    != null ? trimOrUndef(row.getCell(cols.leaseName).value)    : undefined,
      orphanLeaseId:          cols.leaseId      != null ? trimOrUndef(row.getCell(cols.leaseId).value)      : undefined,
      orphanWellNumber:       cols.wellNo       != null ? trimOrUndef(row.getCell(cols.wellNo).value)       : undefined,
      orphanFieldName:        cols.fieldName    != null ? trimOrUndef(row.getCell(cols.fieldName).value)    : undefined,
      orphanCounty:           cols.county       != null ? trimOrUndef(row.getCell(cols.county).value)       : undefined,
      orphanDistrictName:     cols.district     != null ? trimOrUndef(row.getCell(cols.district).value)     : undefined,
      orphanMonthsP5Inactive: cols.monthsInact  != null ? toInt(row.getCell(cols.monthsInact).value)        : undefined,
    };
    for (const k of Object.keys(enrichment)) {
      if (enrichment[k] === undefined) delete enrichment[k];
    }
    records.set(api, enrichment);
  });

  console.log(`[orphan] parsed ${records.size.toLocaleString()} records (${skipped} skipped)`);
  return records;
}
