/**
 * Session fingerprint: { ip, userAgent, timezone }.
 *
 * IP is fetched from api.ipify.org once per browser tab and cached in
 * sessionStorage so the network call happens at most once per login.
 * If ipify is unreachable, we fall back to omitting the ip — the rest of
 * the fingerprint still works.
 *
 * userAgent and timezone come from the browser and are always available.
 */

export interface SessionFingerprint {
  ip?: string;
  userAgent?: string;
  timezone?: string;
}

const IP_STORAGE_KEY = 'rbpp.session.ip';
const IP_LOOKUP_URL = 'https://api.ipify.org?format=json';
const IP_LOOKUP_TIMEOUT_MS = 3000;

let inFlight: Promise<string | undefined> | null = null;

async function fetchIp(): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined;
  try {
    const cached = window.sessionStorage.getItem(IP_STORAGE_KEY);
    if (cached) return cached;
  } catch {
    // sessionStorage can throw in private-browsing edge cases — proceed without cache.
  }

  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), IP_LOOKUP_TIMEOUT_MS);
      const resp = await fetch(IP_LOOKUP_URL, { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) return undefined;
      const data = (await resp.json()) as { ip?: unknown };
      const ip = typeof data.ip === 'string' ? data.ip : undefined;
      if (ip) {
        try {
          window.sessionStorage.setItem(IP_STORAGE_KEY, ip);
        } catch {
          // ignore
        }
      }
      return ip;
    } catch {
      return undefined;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

function readUserAgent(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.userAgent || undefined;
}

function readTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Returns the current session fingerprint. IP may be undefined if ipify failed. */
export async function getSessionFingerprint(): Promise<SessionFingerprint> {
  const [ip] = await Promise.all([fetchIp()]);
  return {
    ip,
    userAgent: readUserAgent(),
    timezone: readTimezone(),
  };
}

/** Clears the cached IP — call on sign-out so a new sign-in re-fetches. */
export function clearSessionFingerprint(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(IP_STORAGE_KEY);
  } catch {
    // ignore
  }
}
