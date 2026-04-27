import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { UserRole, ToolId } from '../types';
import { normalizeToolId } from '../types';

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
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const logout = () => signOut(auth);

  return { user, role, allowedTools, loading, logout };
}
