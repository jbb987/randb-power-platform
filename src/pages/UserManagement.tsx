import { useState } from 'react';
import Layout from '../components/Layout';
import { useUsers } from '../hooks/useUsers';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../types';

export default function UserManagement() {
  const { users, loading, updateRole, removeUser } = useUsers();
  const { user: currentUser } = useAuth();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    await updateRole(uid, newRole);
  };

  const handleRemove = async (uid: string) => {
    await removeUser(uid);
    setConfirmRemove(null);
  };

  return (
    <Layout>
      <main className="py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading text-2xl font-semibold text-[#201F1E]">User Management</h2>
          <span className="text-sm text-[#7A756E]">{users.length} user{users.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#C1121F]" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-[#7A756E]">No users found</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#D8D5D0] bg-[#F5F4F2]">
                  <th className="text-left text-xs font-medium text-[#7A756E] uppercase tracking-wider px-6 py-3">Email</th>
                  <th className="text-left text-xs font-medium text-[#7A756E] uppercase tracking-wider px-6 py-3">Role</th>
                  <th className="text-right text-xs font-medium text-[#7A756E] uppercase tracking-wider px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.uid;
                  return (
                    <tr key={u.id} className="border-b border-[#D8D5D0] last:border-b-0 hover:bg-[#F5F4F2]/50 transition">
                      <td className="px-6 py-4">
                        <span className="text-sm text-[#201F1E]">{u.email}</span>
                        {isSelf && <span className="ml-2 text-xs text-[#7A756E] bg-[#E8E6E3] rounded-full px-2 py-0.5">You</span>}
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                          disabled={isSelf}
                          className="text-sm border border-[#D8D5D0] rounded-lg px-3 py-1.5 bg-white text-[#201F1E] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#C1121F]/20 focus:border-[#C1121F]"
                        >
                          <option value="admin">Admin</option>
                          <option value="agent">Agent</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isSelf ? (
                          <span className="text-xs text-[#7A756E]">—</span>
                        ) : confirmRemove === u.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleRemove(u.id)}
                              className="text-xs font-medium text-white bg-[#C1121F] rounded-lg px-3 py-1.5 hover:bg-[#A10E1A] transition"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmRemove(null)}
                              className="text-xs font-medium text-[#7A756E] hover:text-[#201F1E] transition"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmRemove(u.id)}
                            className="text-xs font-medium text-[#C1121F] hover:text-[#A10E1A] transition"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </Layout>
  );
}
