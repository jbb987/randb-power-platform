import { doc, runTransaction } from 'firebase/firestore';
import { db } from './firebase';
import type { MonthlyUsage, UserRole } from '../types';

export const DEFAULT_MONTHLY_QUOTA = 5;

export function getCurrentMonthKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export interface QuotaSnapshot {
  isAdmin: boolean;
  limit: number;
  used: number;
  remaining: number;
}

export function computeQuota(
  role: UserRole | null,
  monthlyQuotaLimit: number | undefined,
  monthlyUsage: MonthlyUsage | undefined,
  now: Date = new Date(),
): QuotaSnapshot {
  if (role === 'admin') {
    return { isAdmin: true, limit: Infinity, used: 0, remaining: Infinity };
  }
  const limit = monthlyQuotaLimit ?? DEFAULT_MONTHLY_QUOTA;
  const used = monthlyUsage?.month === getCurrentMonthKey(now) ? monthlyUsage.count : 0;
  return { isAdmin: false, limit, used, remaining: Math.max(0, limit - used) };
}

/**
 * Atomically increment the user's monthly generation count, resetting to 1
 * when the stored month no longer matches the current month.
 */
export async function incrementGeneration(uid: string): Promise<void> {
  const ref = doc(db, 'users', uid);
  const month = getCurrentMonthKey();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const usage = snap.data().monthlyUsage as MonthlyUsage | undefined;
    const next: MonthlyUsage =
      usage?.month === month ? { month, count: usage.count + 1 } : { month, count: 1 };
    tx.update(ref, { monthlyUsage: next });
  });
}
