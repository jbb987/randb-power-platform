/**
 * Mints + caches a Google OAuth2 access token for Firestore REST.
 *
 * Signs a short-lived RS256 JWT with the service-account private key via Web
 * Crypto (works in Cloudflare Workers — firebase-admin's Node-only crypto
 * stack does not). The minted access token is cached in module scope and
 * reused across requests until ~60s before expiry.
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

interface AuthEnv {
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  FIREBASE_PROJECT_ID?: string;
}

let cachedSA: ServiceAccount | null = null;
let cachedKey: CryptoKey | null = null;
let cachedToken: CachedToken | null = null;

function base64UrlFromArrayBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlFromString(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function getServiceAccount(env: AuthEnv): ServiceAccount {
  if (cachedSA) return cachedSA;
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON secret is not set');
  }
  cachedSA = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccount;
  return cachedSA;
}

async function getSigningKey(sa: ServiceAccount): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return cachedKey;
}

export async function getAccessToken(env: AuthEnv): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const sa = getServiceAccount(env);
  const key = await getSigningKey(sa);

  const iat = Math.floor(now / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  };

  const signingInput =
    base64UrlFromString(JSON.stringify(header)) +
    '.' +
    base64UrlFromString(JSON.stringify(payload));
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = signingInput + '.' + base64UrlFromArrayBuffer(sig);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return cachedToken.token;
}

export function getProjectId(env: AuthEnv): string {
  if (env.FIREBASE_PROJECT_ID) return env.FIREBASE_PROJECT_ID;
  return getServiceAccount(env).project_id;
}
