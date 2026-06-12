import type { User } from 'firebase/auth';

/**
 * The Whitepaper documents the entire platform in one place, so access is
 * deliberately tighter than any role: only the accounts listed here can see
 * it — including admins. Add an email to widen access.
 */
export const WHITEPAPER_ALLOWED_EMAILS = ['jb@randbpowerinc.us'];

export function canSeeWhitepaper(user: User | null): boolean {
  const email = user?.email?.toLowerCase();
  return !!email && WHITEPAPER_ALLOWED_EMAILS.includes(email);
}
