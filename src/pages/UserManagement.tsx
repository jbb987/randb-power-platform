import { useState } from 'react';
import Layout from '../components/Layout';
import { useUsers } from '../hooks/useUsers';
import { useAuth } from '../hooks/useAuth';
import type { UserRole, ToolId } from '../types';
import { ALL_TOOL_IDS, TOOL_LABELS } from '../types';

export default function UserManagement() {
  const { users, loading, updateRole, updateAllowedTools, removeUser, inviteUser, resetPassword } = useUsers();
  const { user: currentUser } = useAuth();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // Invite form state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('employee');
  const [inviteTools, setInviteTools] = useState<ToolId[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    await updateRole(uid, newRole);
  };

  const handleRemove = async (uid: string) => {
    await removeUser(uid);
    setConfirmRemove(null);
  };

  const handleToolToggle = async (uid: string, toolId: ToolId, currentTools: ToolId[]) => {
    const next = currentTools.includes(toolId)
      ? currentTools.filter((t) => t !== toolId)
      : [...currentTools, toolId];
    await updateAllowedTools(uid, next);
  };

  const handleSelectAll = async (uid: string, currentTools: ToolId[]) => {
    const allSelected = ALL_TOOL_IDS.every((t) => currentTools.includes(t));
    await updateAllowedTools(uid, allSelected ? [] : [...ALL_TOOL_IDS]);
  };

  const toggleInviteTool = (toolId: ToolId) => {
    setInviteTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  };

  const toggleInviteSelectAll = () => {
    const allSelected = ALL_TOOL_IDS.every((t) => inviteTools.includes(t));
    setInviteTools(allSelected ? [] : [...ALL_TOOL_IDS]);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !invitePassword.trim()) return;

    setInviting(true);
    setInviteError('');
    try {
      await inviteUser(inviteEmail.trim(), invitePassword, inviteRole, inviteTools);
      showToast(`${inviteEmail.trim()} added successfully`);
      setInviteEmail('');
      setInvitePassword('');
      setInviteRole('employee');
      setInviteTools([]);
      setShowInvite(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create user';
      setInviteError(message);
    } finally {
      setInviting(false);
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      await resetPassword(email);
      showToast(`Password reset email sent to ${email}`);
    } catch {
      showToast('Failed to send reset email');
    }
  };

  const inviteAllSelected = ALL_TOOL_IDS.every((t) => inviteTools.includes(t));

  return (
    <Layout>
      <main className="py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading text-2xl font-semibold text-[#201F1E]">User Management</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#7A756E]">{users.length} user{users.length !== 1 ? 's' : ''}</span>
            <button
              onClick={() => setShowInvite(!showInvite)}
              className="rounded-lg bg-[#ED202B] text-white border border-[#ED202B] hover:bg-[#9B0E18] hover:border-[#9B0E18] px-4 py-2 text-sm font-medium transition"
            >
              {showInvite ? 'Cancel' : 'Add User'}
            </button>
          </div>
        </div>

        {/* Invite form */}
        {showInvite && (
          <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-5 mb-6">
            <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-4">Add New User</h3>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-[#7A756E] mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full rounded-lg border border-[#D8D5D0] px-3 py-2 text-sm text-[#201F1E] placeholder:text-[#7A756E] focus:outline-none focus:ring-2 focus:ring-[#ED202B]/20 focus:border-[#ED202B]"
                  />
                </div>
                <div className="sm:w-44">
                  <label className="block text-xs text-[#7A756E] mb-1">Temporary Password</label>
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full rounded-lg border border-[#D8D5D0] px-3 py-2 text-sm text-[#201F1E] placeholder:text-[#7A756E] focus:outline-none focus:ring-2 focus:ring-[#ED202B]/20 focus:border-[#ED202B]"
                  />
                </div>
                <div className="sm:w-32">
                  <label className="block text-xs text-[#7A756E] mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as UserRole)}
                    className="w-full rounded-lg border border-[#D8D5D0] px-3 py-2 text-sm text-[#201F1E] bg-white focus:outline-none focus:ring-2 focus:ring-[#ED202B]/20 focus:border-[#ED202B]"
                  >
                    <option value="employee">Employee</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              {/* Tool access checkboxes for invite */}
              {inviteRole !== 'admin' && (
                <div>
                  <label className="block text-xs text-[#7A756E] mb-2">Tool Access</label>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={inviteAllSelected}
                        onChange={toggleInviteSelectAll}
                        className="h-4 w-4 rounded border-[#D8D5D0] text-[#ED202B] focus:ring-[#ED202B]/20 accent-[#ED202B]"
                      />
                      <span className="text-sm font-medium text-[#201F1E]">Select All</span>
                    </label>
                    <span className="w-px h-5 bg-[#D8D5D0] self-center" />
                    {ALL_TOOL_IDS.map((toolId) => (
                      <label key={toolId} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={inviteTools.includes(toolId)}
                          onChange={() => toggleInviteTool(toolId)}
                          className="h-4 w-4 rounded border-[#D8D5D0] text-[#ED202B] focus:ring-[#ED202B]/20 accent-[#ED202B]"
                        />
                        <span className="text-sm text-[#201F1E]">{TOOL_LABELS[toolId]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center">
                <button
                  type="submit"
                  disabled={inviting}
                  className="rounded-lg bg-[#ED202B] text-white border border-[#ED202B] hover:bg-[#9B0E18] hover:border-[#9B0E18] px-5 py-2 text-sm font-medium transition disabled:opacity-50"
                >
                  {inviting ? 'Adding...' : 'Add'}
                </button>
              </div>
            </form>
            {inviteError && (
              <p className="mt-3 text-sm text-[#ED202B] bg-red-50 rounded-lg px-3 py-2">{inviteError}</p>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-[#7A756E]">No users found</div>
          ) : (
            <div className="divide-y divide-[#D8D5D0]">
              {users.map((u) => {
                const isSelf = u.id === currentUser?.uid;
                const isAdmin = u.role === 'admin';
                const isExpanded = expandedUser === u.id;
                const allSelected = ALL_TOOL_IDS.every((t) => u.allowedTools.includes(t));

                return (
                  <div key={u.id}>
                    {/* Main row */}
                    <div className="flex items-center px-6 py-4 hover:bg-[#D8D5D0]/30 transition">
                      {/* Expand toggle (only for non-admin, non-self) */}
                      <button
                        onClick={() => !isAdmin && !isSelf && setExpandedUser(isExpanded ? null : u.id)}
                        disabled={isAdmin || isSelf}
                        className="mr-3 p-0.5 text-[#7A756E] disabled:opacity-30 disabled:cursor-not-allowed hover:text-[#201F1E] transition"
                        title={isAdmin ? 'Admins have access to all tools' : isSelf ? 'Cannot edit own permissions' : 'Edit tool access'}
                      >
                        <svg
                          className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                      {/* Email */}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-[#201F1E]">{u.email}</span>
                        {isSelf && <span className="ml-2 text-xs text-[#7A756E] bg-[#FAFAF9] rounded-full px-2 py-0.5">You</span>}
                        {!isAdmin && !isSelf && (
                          <span className="ml-2 text-xs text-[#7A756E]">
                            {u.allowedTools.length}/{ALL_TOOL_IDS.length} tools
                          </span>
                        )}
                        {isAdmin && !isSelf && (
                          <span className="ml-2 text-xs text-[#7A756E]">All tools</span>
                        )}
                      </div>

                      {/* Role */}
                      <div className="mr-4">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                          disabled={isSelf}
                          className="text-sm border border-[#D8D5D0] rounded-lg px-3 py-1.5 bg-white text-[#201F1E] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#ED202B]/20 focus:border-[#ED202B]"
                        >
                          <option value="admin">Admin</option>
                          <option value="employee">Employee</option>
                        </select>
                      </div>

                      {/* Actions */}
                      <div>
                        {isSelf ? (
                          <span className="text-xs text-[#7A756E]">—</span>
                        ) : confirmRemove === u.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#201F1E] mr-1">Are you sure?</span>
                            <button
                              onClick={() => handleRemove(u.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-white bg-[#ED202B] rounded-lg px-3 py-1.5 hover:bg-[#9B0E18] transition"
                            >
                              Yes, Remove
                            </button>
                            <button
                              onClick={() => setConfirmRemove(null)}
                              className="text-xs font-medium text-[#7A756E] border border-[#D8D5D0] rounded-lg px-3 py-1.5 hover:bg-[#FAFAF9] transition"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleResetPassword(u.email)}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#201F1E] border border-[#D8D5D0] rounded-lg px-3 py-1.5 hover:bg-[#FAFAF9] transition"
                              title={`Send password reset to ${u.email}`}
                            >
                              <svg className="w-3.5 h-3.5 text-[#7A756E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Reset Password
                            </button>
                            <button
                              onClick={() => setConfirmRemove(u.id)}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#ED202B] border border-[#ED202B]/30 rounded-lg px-3 py-1.5 hover:bg-[#ED202B]/5 transition"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expandable tool access panel */}
                    {isExpanded && !isAdmin && !isSelf && (
                      <div className="px-6 pb-4 pt-1 bg-[#FAFAF9] border-t border-[#D8D5D0]">
                        <div className="flex flex-wrap gap-x-5 gap-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={() => handleSelectAll(u.id, u.allowedTools)}
                              className="h-4 w-4 rounded border-[#D8D5D0] text-[#ED202B] focus:ring-[#ED202B]/20 accent-[#ED202B]"
                            />
                            <span className="text-sm font-medium text-[#201F1E]">Select All</span>
                          </label>
                          <span className="w-px h-5 bg-[#D8D5D0] self-center" />
                          {ALL_TOOL_IDS.map((toolId) => (
                            <label key={toolId} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={u.allowedTools.includes(toolId)}
                                onChange={() => handleToolToggle(u.id, toolId, u.allowedTools)}
                                className="h-4 w-4 rounded border-[#D8D5D0] text-[#ED202B] focus:ring-[#ED202B]/20 accent-[#ED202B]"
                              />
                              <span className="text-sm text-[#201F1E]">{TOOL_LABELS[toolId]}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#201F1E] text-white text-sm px-5 py-3 rounded-xl shadow-lg z-50">
            {toast}
          </div>
        )}
      </main>
    </Layout>
  );
}
