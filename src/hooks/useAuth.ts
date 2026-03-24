import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { UserRole } from '../types';

const ADMIN_SEEDS: { uid: string; email: string }[] = [
  { uid: 'GtB70kUIF3VkCMj4UjJWcI7c7Hs2', email: 'BWest@randbpowersolutions.com' },
  { uid: 'XcDLtD7FKKS4L0sKo1K0vv0VFnM2', email: 'jb@randbpowersolutions.com' },
];

const ADMIN_UIDS = new Set(ADMIN_SEEDS.map((a) => a.uid));

async function seedAdmins() {
  for (const admin of ADMIN_SEEDS) {
    const ref = doc(db, 'users', admin.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { email: admin.email, role: 'admin' });
    } else if (snap.data().email !== admin.email) {
      await setDoc(ref, { ...snap.data(), email: admin.email }, { merge: true });
    }
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          // Seed admin docs if this is an admin logging in
          if (ADMIN_UIDS.has(u.uid)) {
            await seedAdmins();
          }

          const ref = doc(db, 'users', u.uid);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            setRole(snap.data().role as UserRole);
          } else {
            const defaultRole: UserRole = 'agent';
            await setDoc(ref, { email: u.email, role: defaultRole });
            setRole(defaultRole);
          }
        } catch {
          setRole(null);
        }
      } else {
        setRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const logout = () => signOut(auth);

  return { user, role, loading, logout };
}
