/**
 * RRC MFT (GoAnywhere PrimeFaces JSF) download flow for PDQ_DSV.zip.
 *
 * Three-step session-bound HTTP flow (no Puppeteer needed):
 *   1. GET share-link URL → captures JSESSIONID + javax.faces.ViewState
 *   2. POST the file-click form action → 302 redirect (no body)
 *   3. GET /link/godrivedownload with the same session cookies → binary stream
 */

const SHARE_URL = 'https://mft.rrc.texas.gov/link/1f5ddb8d-329a-4459-b7f8-177b4f5ee60d';
const POST_URL = 'https://mft.rrc.texas.gov/webclient/godrive/PublicGoDrive.xhtml';
const DOWNLOAD_URL = 'https://mft.rrc.texas.gov/link/godrivedownload';

/** Extract the first javax.faces.ViewState value from PrimeFaces HTML. */
function extractViewState(html) {
  const match = html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/);
  if (!match) throw new Error('JSF ViewState not found on share page');
  return match[1];
}

/** Extract the first file-link click action ID from the file table. */
function extractFileClickId(html) {
  // Pattern: id="fileTable:0:j_id_2f"
  const match = html.match(/id="(fileTable:0:j_id_[0-9a-z]+)"/);
  if (!match) throw new Error('File click action ID not found in PrimeFaces table');
  return match[1];
}

/** Concatenate all Set-Cookie values into a Cookie header string. */
function collectCookies(setCookieHeaders) {
  if (!setCookieHeaders) return '';
  const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return arr.map((h) => h.split(';')[0].trim()).join('; ');
}

/**
 * Initiates the download. Returns { stream, contentLength } where stream is
 * a Node ReadableStream of the ZIP body bytes.
 *
 * The caller is expected to pipe the stream into a ZIP parser without
 * touching disk (file is ~3.5 GB).
 */
export async function startPdqDownload() {
  // Step 1
  console.log('[download] GET share page');
  const r1 = await fetch(SHARE_URL, { redirect: 'manual' });
  if (!r1.ok && r1.status !== 200) {
    throw new Error(`Share page HTTP ${r1.status}`);
  }
  const cookies1 = collectCookies(r1.headers.getSetCookie?.() ?? r1.headers.get('set-cookie'));
  const html = await r1.text();
  const viewState = extractViewState(html);
  const clickId = extractFileClickId(html);
  console.log(`[download] viewState extracted (${viewState.length} chars), click id ${clickId}`);

  // Step 2
  console.log('[download] POST click action');
  const form = new URLSearchParams();
  form.set('fileList_SUBMIT', '1');
  form.set('javax.faces.ViewState', viewState);
  form.set(clickId, clickId);
  form.set('fileList', 'fileList');

  const r2 = await fetch(POST_URL, {
    method: 'POST',
    headers: {
      'Cookie': cookies1,
      'Referer': SHARE_URL,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (well-finder-pdq)',
    },
    body: form.toString(),
    redirect: 'manual',
  });
  // Accept any 30x or 200 — we just need the session to flip into "ready to download" state
  if (r2.status !== 302 && r2.status !== 200) {
    const body = await r2.text().catch(() => '');
    throw new Error(`POST returned HTTP ${r2.status}; body=${body.slice(0, 500)}`);
  }
  // Capture any Set-Cookie that came back with the POST (the session may be refreshed)
  const cookies2 = collectCookies(r2.headers.getSetCookie?.() ?? r2.headers.get('set-cookie'));
  const finalCookies = [cookies1, cookies2].filter(Boolean).join('; ');

  // Step 3
  console.log('[download] GET /link/godrivedownload');
  const r3 = await fetch(DOWNLOAD_URL, {
    headers: {
      'Cookie': finalCookies,
      'Referer': SHARE_URL,
      'User-Agent': 'Mozilla/5.0 (well-finder-pdq)',
    },
  });
  if (!r3.ok) {
    throw new Error(`Download HTTP ${r3.status}`);
  }
  const contentLength = Number(r3.headers.get('content-length') || '0');
  console.log(`[download] streaming ${contentLength.toLocaleString()} bytes (~${(contentLength / 1024 / 1024 / 1024).toFixed(2)} GB)`);

  if (!r3.body) throw new Error('Download response has no body');
  return { stream: r3.body, contentLength };
}
