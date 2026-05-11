/**
 * Heuristics that flag potentially suspicious activity patterns.
 * Read-only — these never mutate state, they just produce human messages.
 *
 * The signals are intentionally simple and explainable; the goal is to give
 * an admin a "look at this" pointer, not to make automated decisions.
 */

import type { ActivityEntry } from '../types/activity';

export interface Anomaly {
  kind: 'multi-ip' | 'stale-login';
  email: string;
  message: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const STALE_LOGIN_THRESHOLD_DAYS = 7;
const MULTI_IP_WINDOW_MS = HOUR_MS;

export function detectAnomalies(entries: ActivityEntry[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const now = Date.now();

  // Group by actor email
  const byEmail = new Map<string, ActivityEntry[]>();
  for (const e of entries) {
    const email = e.actor?.email;
    if (!email) continue;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email)!.push(e);
  }

  for (const [email, userEntries] of byEmail.entries()) {
    // Signal 1: multiple distinct IPs within MULTI_IP_WINDOW_MS
    const withIp = userEntries
      .filter((e) => !!e.session?.ip)
      .map((e) => ({
        ts: e.timestamp?.toMillis ? e.timestamp.toMillis() : 0,
        ip: e.session!.ip!,
      }))
      .sort((a, b) => a.ts - b.ts);

    for (let i = 0; i < withIp.length; i++) {
      const winStart = withIp[i].ts;
      const ipsInWindow = new Set<string>();
      for (let j = i; j < withIp.length && withIp[j].ts - winStart <= MULTI_IP_WINDOW_MS; j++) {
        ipsInWindow.add(withIp[j].ip);
      }
      if (ipsInWindow.size >= 2) {
        const ips = [...ipsInWindow].slice(0, 3).join(', ');
        anomalies.push({
          kind: 'multi-ip',
          email,
          message: `${email} active from ${ipsInWindow.size} distinct IPs in 1 hour (${ips})`,
        });
        break; // one alert per user per render
      }
    }

    // Signal 2: account active but no fresh login in 7+ days
    const lastLogin = userEntries.find((e) => e.action === 'login');
    const anyRecentAction = userEntries[0]; // sorted newest first by caller
    if (anyRecentAction && !lastLogin) {
      const lastActionTs = anyRecentAction.timestamp?.toMillis
        ? anyRecentAction.timestamp.toMillis()
        : 0;
      if (now - lastActionTs < DAY_MS) {
        anomalies.push({
          kind: 'stale-login',
          email,
          message: `${email} produced activity today but has no recorded sign-in — session may be days/weeks old`,
        });
      }
    } else if (lastLogin) {
      const lastLoginTs = lastLogin.timestamp?.toMillis ? lastLogin.timestamp.toMillis() : 0;
      const daysSince = (now - lastLoginTs) / DAY_MS;
      const lastActionTs = anyRecentAction.timestamp?.toMillis
        ? anyRecentAction.timestamp.toMillis()
        : 0;
      if (daysSince >= STALE_LOGIN_THRESHOLD_DAYS && now - lastActionTs < DAY_MS) {
        anomalies.push({
          kind: 'stale-login',
          email,
          message: `${email} active today but last fresh sign-in was ${Math.floor(daysSince)} days ago`,
        });
      }
    }
  }

  // Dedup messages
  const seen = new Set<string>();
  return anomalies.filter((a) => {
    const k = `${a.kind}:${a.email}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
