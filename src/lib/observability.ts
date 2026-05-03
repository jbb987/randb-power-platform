import * as Sentry from '@sentry/react';

/** Initialize Sentry once at app boot. No-ops if VITE_SENTRY_DSN is unset, so
 *  local dev doesn't ship events anywhere. Call from main.tsx before render. */
export function initObservability() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Browser SDK; perf tracing not needed for now — just exception capture.
    tracesSampleRate: 0,
    // Sentry's BrowserTracing/Replay integrations add real bundle weight; we
    // skip them and only enable error reporting until there's a need.
  });
}

/** Reset user context on logout so subsequent errors aren't attributed to
 *  the previous account. */
export function clearObservabilityUser() {
  Sentry.setUser(null);
}

export function setObservabilityUser(uid: string, email?: string) {
  Sentry.setUser({ id: uid, email });
}

/** Structured event helper. Use for failure paths we already log to console
 *  but want to also trace remotely (uploads, deletes, rules-denied). The
 *  `tags` map gives us a queryable axis in Sentry without baking event type
 *  into the message. */
export function reportFailure(
  err: unknown,
  context: { area: string; action: string; extra?: Record<string, unknown> },
) {
  // Always log to console too — Sentry might be off and dev workflows still
  // want the trace in DevTools.
  console.error(`[${context.area}] ${context.action} failed:`, err, context.extra);
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    scope.setTag('area', context.area);
    scope.setTag('action', context.action);
    if (context.extra) scope.setExtras(context.extra);
    if (err instanceof Error) Sentry.captureException(err);
    else Sentry.captureMessage(`${context.action}: ${String(err)}`);
  });
}
