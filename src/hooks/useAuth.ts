import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { UserRole, ToolId } from '../types';
import { normalizeToolId } from '../types';
import { logLogin } from '../lib/userHistory';
import { clearSessionFingerprint } from '../lib/sessionFingerprint';

const LOGIN_LOGGED_KEY = 'rbpp.session.loginLogged';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [allowedTools, setAllowedTools] = useState<ToolId[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const ref = doc(db, 'users', u.uid);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            const data = snap.data();
            setRole(data.role as UserRole);
            const stored = (data.allowedTools as string[] | undefined) ?? [];
            const normalized = Array.from(
              new Set(stored.map(normalizeToolId).filter((t): t is ToolId => t !== undefined)),
            );
            setAllowedTools(normalized);

            // Audit: log a `login` event once per browser tab. Page refreshes
            // re-fire onAuthStateChanged with a persisted user; the session
            // flag prevents duplicate entries.
            try {
              const flagKey = `${LOGIN_LOGGED_KEY}.${u.uid}`;
              if (window.sessionStorage.getItem(flagKey) !== '1') {
                window.sessionStorage.setItem(flagKey, '1');
                void logLogin(u.uid);
              }
            } catch {
              // sessionStorage unavailable — skip, don't double-log on retry.
            }
          } else {
            // No Firestore user doc — deny access.
            // Users must be provisioned via User Management.
            await signOut(auth);
            setUser(null);
            setRole(null);
            setAllowedTools([]);
          }
        } catch {
          setRole(null);
          setAllowedTools([]);
        }
      } else {
        setRole(null);
        setAllowedTools([]);
        // Clear cached session bits so a subsequent sign-in re-fetches IP and re-logs the login.
        try {
          Object.keys(window.sessionStorage)
            .filter((k) => k.startsWith(LOGIN_LOGGED_KEY))
            .forEach((k) => window.sessionStorage.removeItem(k));
        } catch {
          // ignore
        }
        clearSessionFingerprint();
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const logout = () => signOut(auth);

  return { user, role, allowedTools, loading, logout };
}
