/**
 * Compact display helpers for the session fingerprint on activity entries.
 * Raw user-agent strings are 100+ chars; we boil them down to "Chrome on Mac".
 */

/** Returns a 1-3-word browser/OS summary, or null if we can't parse. */
export function summarizeUserAgent(ua: string): string | null {
  if (!ua) return null;

  const browser = detectBrowser(ua);
  const os = detectOS(ua);

  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? null;
}

function detectBrowser(ua: string): string | null {
  // Order matters — Edge contains "Chrome", Chrome contains "Safari", etc.
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari';
  return null;
}

function detectOS(ua: string): string | null {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return null;
}
