import { useState } from 'react';
import type { LeadStatus } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import type { UserRecord } from '../../hooks/useUsers';

interface Props {
  onSubmit: (data: {
    assignedTo: string;
    assignedToName: string;
    businessName: string;
    phone: string;
    email: string;
    description: string;
    decisionMakerName: string;
    decisionMakerRole: string;
    status: LeadStatus;
  }) => void;
  onClose: () => void;
  users: UserRecord[];
  isAdmin: boolean;
}

export default function LeadForm({ onSubmit, onClose, users, isAdmin }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    businessName: '',
    phone: '',
    email: '',
    description: '',
    decisionMakerName: '',
    decisionMakerRole: '',
  });
  const [assigneeId, setAssigneeId] = useState(user?.uid || '');

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.businessName.trim() || !user) return;
    const assignee = users.find((u) => u.id === assigneeId);
    const assignedToName = assignee ? assignee.email.split('@')[0] : user.email?.split('@')[0] || 'Unknown';
    onSubmit({
      ...form,
      assignedTo: assigneeId || user.uid,
      assignedToName,
      status: 'new',
    });
    onClose();
  };

  const fields: { key: string; label: string; type?: string; required?: boolean; placeholder: string }[] = [
    { key: 'businessName', label: 'Business Name', required: true, placeholder: 'Acme Solar Inc.' },
    { key: 'decisionMakerName', label: 'Decision Maker', placeholder: 'John Smith' },
    { key: 'decisionMakerRole', label: 'Role', placeholder: 'CEO, CFO, Owner...' },
    { key: 'phone', label: 'Phone', type: 'tel', placeholder: '(555) 123-4567' },
    { key: 'email', label: 'Email', type: 'email', placeholder: 'contact@acme.com' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl border border-[#D8D5D0] w-full max-w-lg">
        <div className="border-b border-[#D8D5D0] px-6 py-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-[#201F1E]">New Lead</h2>
          <button onClick={onClose} className="text-[#7A756E] hover:text-[#201F1E] transition p-1">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Admin: assignee picker */}
          {isAdmin && (
            <div>
              <label className="block text-xs font-medium text-[#7A756E] mb-1">Assign To</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full text-sm border border-[#D8D5D0] rounded-lg px-3 py-2 bg-white focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 outline-none transition"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.email}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {fields.map((f) => (
              <div key={f.key} className={f.key === 'businessName' ? 'col-span-2' : ''}>
                <label className="block text-xs font-medium text-[#7A756E] mb-1">
                  {f.label} {f.required && <span className="text-[#ED202B]">*</span>}
                </label>
                <input
                  type={f.type || 'text'}
                  value={form[f.key as keyof typeof form]}
                  onChange={(e) => update(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  required={f.required}
                  className="w-full text-sm border border-[#D8D5D0] rounded-lg px-3 py-2 focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 outline-none transition"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#7A756E] mb-1">Business Description</label>
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Brief description of the business and opportunity..."
              rows={3}
              className="w-full text-sm border border-[#D8D5D0] rounded-lg px-3 py-2 focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 outline-none transition resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#7A756E] hover:text-[#201F1E] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-[#ED202B] text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-[#9B0E18] transition"
            >
              Create Lead
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
