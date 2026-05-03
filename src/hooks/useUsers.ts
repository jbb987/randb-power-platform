import { useState, useEffect } from 'react';
import { addDoc, collection, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db, createAuthUser, sendResetEmail } from '../lib/firebase';
import type { UserRole, ToolId, MonthlyUsage } from '../types';

export interface UserRecord {
  id: string;
  email: string;
  /** Optional human-readable name, used everywhere the platform shows a
   *  user. Falls back to email when missing — keeps existing rows usable
   *  before they're filled in. */
  displayName?: string;
  role: UserRole;
  allowedTools: ToolId[];
  monthlyQuotaLimit?: number;
  monthlyUsage?: MonthlyUsage;
}

export function useUsers() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        email: d.data().email as string,
        displayName: d.data().displayName as string | undefined,
        role: d.data().role as UserRole,
        allowedTools: (d.data().allowedTools as ToolId[] | undefined) ?? [],
        monthlyQuotaLimit: d.data().monthlyQuotaLimit as number | undefined,
        monthlyUsage: d.data().monthlyUsage as MonthlyUsage | undefined,
      }));
      // Sort by displayName (when present) then email — keeps rosters with
      // mixed name+email entries readable.
      list.sort((a, b) => (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email));
      setUsers(list);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const updateRole = async (uid: string, newRole: UserRole) => {
    await updateDoc(doc(db, 'users', uid), { role: newRole });
  };

  const updateAllowedTools = async (uid: string, tools: ToolId[]) => {
    await updateDoc(doc(db, 'users', uid), { allowedTools: tools });
  };

  const updateDisplayName = async (uid: string, displayName: string) => {
    await updateDoc(doc(db, 'users', uid), {
      displayName: displayName.trim() || null,
    });
  };

  const removeUser = async (uid: string) => {
    // Indirect via Firestore-triggered function: write a request doc to
    // user-deletion-requests, the server-side trigger picks it up and wipes
    // both the auth record and the users/{uid} profile. We use this rather
    // than an httpsCallable because Firestore triggers don't need invoker
    // IAM (the platform invokes them from the Firebase service account),
    // so deploys work without roles/functions.admin.
    const requester = getAuth().currentUser;
    if (!requester) throw new Error('Not signed in.');
    await addDoc(collection(db, 'user-deletion-requests'), {
      targetUid: uid,
      requestedBy: requester.uid,
      requestedAt: Date.now(),
    });
  };

  const inviteUser = async (
    email: string,
    password: string,
    role: UserRole,
    allowedTools: ToolId[] = [],
    displayName?: string,
  ) => {
    const uid = await createAuthUser(email, password);
    await setDoc(doc(db, 'users', uid), {
      email,
      role,
      allowedTools,
      ...(displayName?.trim() && { displayName: displayName.trim() }),
    });
    return uid;
  };

  const resetPassword = async (email: string) => {
    await sendResetEmail(email);
  };

  return { users, loading, updateRole, updateAllowedTools, updateDisplayName, removeUser, inviteUser, resetPassword };
}

/** Display label used everywhere the platform surfaces a user.
 *  Returns "Display Name" when set, falls back to email. Pass undefined to
 *  get the literal string "Unknown" — useful for stale UID references. */
export function userLabel(user: UserRecord | undefined | null): string {
  if (!user) return 'Unknown';
  return user.displayName?.trim() ? user.displayName : user.email;
}
