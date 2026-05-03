/**
 * IWAR parser — Texas RRC Inactive Well Aging Report.
 *
 * Two steps:
 *   1. Scrape the landing page HTML for the rotating monthly file URL
 *      (pattern: iwar-YYYYMMDD.txt).
 *   2. Fetch + parse the tab-delimited text (one header row + records).
 *
 * Schema (verified live, 2026-03 file):
 *   Operator Number, Operator Name, API County Number, API Unique Number,
 *   County Name, O/G Code, District Code, Lease Number, Well Number,
 *   Oil Unit Number, Lease Name, Field Number, Field Name, Water/Land Code,
 *   API Depth, Shut In Date (YYYYMM), P5 Renewal Month, P5 Renewal Year,
 *   P5 Originating Status, Current 5 Yr Inactive, Current 10 Yr Inactive,
 *   Aged 5 Year Inactive, Aged 10 Year Inactive, Current Inactive Years,
 *   Current Inactive Months, Aged Inactive Years, Aged Inactive Months,
 *   Extension Status, Extension Denial Data, ..., Cost Calculation,
 *   Well Plugged, Compliance Due Date, Original Completion Date, ...
 */
import { parse as parseHtml } from 'node-html-parser';

const LANDING_URL =
  'https://www.rrc.texas.gov/oil-and-gas/compliance-enforcement/hb-2259hb-3134-inactive-well-requirements/inactive-well-aging-report-iwar/';

/** Returns the absolute URL of the latest IWAR .txt file. */
async function findLatestIwarUrl() {
  const res = await fetch(LANDING_URL);
  if (!res.ok) throw new Error(`IWAR landing page HTTP ${res.status}`);
  const html = await res.text();

  // Regex pass first — works even if the markup is malformed.
  const match = html.match(/href="(\/media\/[^"]+\/iwar-\d{8}\.txt)"/i);
  if (match) return `https://www.rrc.texas.gov${match[1]}`;

  // Parser fallback.
  const root = parseHtml(html);
  const link = root.querySelectorAll('a').find((a) => /iwar-\d{8}\.txt$/i.test(a.getAttribute('href') || ''));
  if (!link) throw new Error('No IWAR .txt link found on landing page');
  const href = link.getAttribute('href');
  return href.startsWith('http') ? href : `https://www.rrc.texas.gov${href}`;
}

/** Build an 8-char API# from county + unique parts. */
function makeApi(county, unique) {
  const c = String(county).trim().padStart(3, '0');
  const u = String(unique).trim().padStart(5, '0');
  return `${c}${u}`;
}

function toInt(s) {
  const n = parseInt(String(s).trim(), 10);
  return Number.isFinite(n) ? n : undefined;
}
function toNumber(s) {
  const n = parseFloat(String(s).trim());
  return Number.isFinite(n) ? n : undefined;
}
function trimOrUndef(s) {
  const t = String(s ?? '').trim();
  return t.length ? t : undefined;
}

/** Parse a YYYYMM string to "YYYY-MM" or undefined. */
function parseYM(s) {
  const t = String(s ?? '').trim();
  if (!/^\d{6}$/.test(t)) return undefined;
  return `${t.slice(0, 4)}-${t.slice(4, 6)}`;
}

/** Parse a YYYYMMDD string to "YYYY-MM-DD" or undefined. */
function parseYMD(s) {
  const t = String(s ?? '').trim();
  if (!/^\d{8}$/.test(t)) return undefined;
  return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
}

export async function ingestIwar() {
  console.log('[iwar] discovering latest file URL…');
  const url = await findLatestIwarUrl();
  console.log(`[iwar] fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IWAR fetch HTTP ${res.status}`);
  const text = await res.text();

  const lines = text.split(/\r?\n/);
  if (lines.length < 2) throw new Error('IWAR file too short');

  const header = lines[0].split('\t').map((s) => s.trim());
  console.log(`[iwar] ${header.length} columns, ${lines.length - 1} data lines`);

  const colIdx = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const I = {
    operatorNum:    colIdx('Operator Number'),
    operatorName:   colIdx('Operator Name'),
    apiCounty:      colIdx('API County Number'),
    apiUnique:      colIdx('API Unique Number'),
    countyName:     colIdx('County Name'),
    ogCode:         colIdx('O/G Code'),
    district:       colIdx('District Code'),
    leaseNum:       colIdx('Lease Number'),
    wellNum:        colIdx('Well Number'),
    leaseName:      colIdx('Lease Name'),
    fieldName:      colIdx('Field Name'),
    apiDepth:       colIdx('API Depth'),
    shutInDate:     colIdx('Shut In Date'),
    p5OrigStatus:   colIdx('P5 Originating Status'),
    inactiveYears:  colIdx('Current Inactive Years'),
    inactiveMonths: colIdx('Current Inactive Months'),
    extensionStatus: colIdx('Extension Status'),
    costCalc:       colIdx('Cost Calculation'),
    wellPlugged:    colIdx('Well Plugged'),
    complianceDue:  colIdx('Compliance Due Date'),
    origCompletion: colIdx('Original Completion Date'),
  };

  const records = new Map();
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const c = line.split('\t');
    if (c.length < header.length / 2) { skipped++; continue; }

    const apiCounty = c[I.apiCounty];
    const apiUnique = c[I.apiUnique];
    if (!apiCounty || !apiUnique) { skipped++; continue; }
    const api = makeApi(apiCounty, apiUnique);

    const enrichment = {
      iwarOperator:                trimOrUndef(c[I.operatorName]),
      iwarOperatorP5:              trimOrUndef(c[I.operatorNum]),
      iwarCounty:                  trimOrUndef(c[I.countyName]),
      iwarDistrict:                trimOrUndef(c[I.district]),
      iwarFieldName:               trimOrUndef(c[I.fieldName]),
      iwarLeaseNumber:             trimOrUndef(c[I.leaseNum]),
      iwarLeaseName:               trimOrUndef(c[I.leaseName]),
      iwarWellNumber:              trimOrUndef(c[I.wellNum]),
      iwarOilGasCode:              trimOrUndef(c[I.ogCode]),
      iwarDepthFt:                 toInt(c[I.apiDepth]),
      iwarShutInDate:              parseYM(c[I.shutInDate]),
      iwarOriginalCompletionDate:  parseYMD(c[I.origCompletion]),
      iwarInactiveYears:           toInt(c[I.inactiveYears]),
      iwarInactiveMonths:          toInt(c[I.inactiveMonths]),
      iwarP5OriginatingStatus:     trimOrUndef(c[I.p5OrigStatus]),
      iwarExtensionStatus:         trimOrUndef(c[I.extensionStatus]),
      iwarComplianceDueDate:       parseYMD(c[I.complianceDue]),
      iwarWellPlugged:             c[I.wellPlugged]?.trim() === 'Y',
      iwarPluggingCostEstimate:    toNumber(c[I.costCalc]),
    };

    // Drop undefined keys to keep Firestore docs lean
    for (const k of Object.keys(enrichment)) {
      if (enrichment[k] === undefined) delete enrichment[k];
    }
    records.set(api, enrichment);
  }

  console.log(`[iwar] parsed ${records.size.toLocaleString()} records (${skipped} skipped)`);
  return records;
}
