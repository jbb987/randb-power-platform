import { useState } from 'react';
import type { Lead, LeadStatus } from '../../types';
import { LEAD_STATUS_CONFIG, ACTIVE_LEAD_STATUSES } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import type { UserRecord } from '../../hooks/useUsers';

interface Props {
  lead: Lead;
  onUpdateStatus: (id: string, status: LeadStatus) => void;
  onUpdateLead: (id: string, fields: Partial<Lead>) => void;
  onAddNote: (leadId: string, text: string, authorId: string, authorName: string) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  users: UserRecord[];
  isAdmin: boolean;
}

const STATUS_FLOW: LeadStatus[] = ['new', 'call_1', 'email_sent', 'call_2', 'call_3'];

export default function LeadDetail({ lead, onUpdateStatus, onUpdateLead, onAddNote, onClose, onDelete, users, isAdmin }: Props) {
  const { user } = useAuth();
  const [noteText, setNoteText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const currentIdx = STATUS_FLOW.indexOf(lead.status);
  const canAdvance = ACTIVE_LEAD_STATUSES.includes(lead.status) && currentIdx < STATUS_FLOW.length - 1;
  const canClose = ACTIVE_LEAD_STATUSES.includes(lead.status);

  const handleAddNote = () => {
    if (!noteText.trim() || !user) return;
    onAddNote(lead.id, noteText.trim(), user.uid, user.email || 'Unknown');
    setNoteText('');
  };

  const handleDelete = () => {
    onDelete(lead.id);
    onClose();
  };

  const handleReassign = (uid: string) => {
    const assignee = users.find((u) => u.id === uid);
    if (!assignee) return;
    onUpdateLead(lead.id, { assignedTo: uid, assignedToName: assignee.email.split('@')[0] });
  };

  const statusCfg = LEAD_STATUS_CONFIG[lead.status];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl border border-[#D8D5D0] w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#D8D5D0] px-6 py-4 flex items-start justify-between rounded-t-xl">
          <div>
            <h2 className="font-heading text-xl font-semibold text-[#201F1E]">{lead.businessName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: statusCfg.color + '18', color: statusCfg.color }}
              >
                {statusCfg.label}
              </span>
              <span className="text-xs text-[#7A756E]">
                Owned by <span className="font-medium text-[#201F1E]">{lead.assignedToName || 'Unassigned'}</span>
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-[#7A756E] hover:text-[#201F1E] transition p-1">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Contact info */}
          <div className="grid grid-cols-2 gap-4">
            <InfoField label="Decision Maker" value={lead.decisionMakerName} />
            <InfoField label="Role" value={lead.decisionMakerRole} />
            <InfoField label="Phone" value={lead.phone} />
            <InfoField label="Email" value={lead.email} />
          </div>

          {/* Admin reassignment */}
          {isAdmin && (
            <div>
              <label className="block text-xs font-medium text-[#7A756E] mb-1">Assign To</label>
              <select
                value={lead.assignedTo}
                onChange={(e) => handleReassign(e.target.value)}
                className="w-full text-sm border border-[#D8D5D0] rounded-lg px-3 py-2 bg-white focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 outline-none transition"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.email}</option>
                ))}
              </select>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-[#7A756E] mb-1">Business Description</label>
            <p className="text-sm text-[#201F1E] bg-stone-50 rounded-lg p-3">{lead.description || 'No description'}</p>
          </div>

          {/* Status progression */}
          {ACTIVE_LEAD_STATUSES.includes(lead.status) && (
            <div>
              <label className="block text-xs font-medium text-[#7A756E] mb-2">Status Progression</label>
              <div className="flex items-center gap-1">
                {STATUS_FLOW.map((s, i) => {
                  const cfg = LEAD_STATUS_CONFIG[s];
                  const isActive = i <= currentIdx;
                  return (
                    <div key={s} className="flex items-center gap-1 flex-1">
                      <button
                        onClick={() => onUpdateStatus(lead.id, s)}
                        className={`flex-1 text-xs py-1.5 rounded-md font-medium transition ${
                          isActive
                            ? 'text-white'
                            : 'bg-stone-100 text-[#7A756E] hover:bg-stone-200'
                        }`}
                        style={isActive ? { backgroundColor: cfg.color } : undefined}
                      >
                        {cfg.label}
                      </button>
                      {i < STATUS_FLOW.length - 1 && (
                        <svg className="h-3 w-3 text-[#D8D5D0] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {canAdvance && (
              <button
                onClick={() => onUpdateStatus(lead.id, STATUS_FLOW[currentIdx + 1])}
                className="flex-1 bg-[#ED202B] text-white text-sm font-medium py-2.5 rounded-lg hover:bg-[#9B0E18] transition"
              >
                Advance to {LEAD_STATUS_CONFIG[STATUS_FLOW[currentIdx + 1]].label}
              </button>
            )}
            {canClose && (
              <>
                <button
                  onClick={() => onUpdateStatus(lead.id, 'won')}
                  className="flex-1 bg-emerald-500 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-emerald-600 transition"
                >
                  Mark Won
                </button>
                <button
                  onClick={() => onUpdateStatus(lead.id, 'lost')}
                  className="flex-1 bg-stone-400 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-stone-500 transition"
                >
                  Mark Lost
                </button>
              </>
            )}
          </div>

          {/* Notes section */}
          <div>
            <label className="block text-xs font-medium text-[#7A756E] mb-2">
              Notes ({lead.notes.length})
            </label>
            <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
              {lead.notes.length === 0 ? (
                <p className="text-sm text-[#7A756E] italic">No notes yet.</p>
              ) : (
                lead.notes.map((note) => (
                  <div key={note.id} className="bg-stone-50 rounded-lg p-3">
                    <p className="text-sm text-[#201F1E]">{note.text}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-[#7A756E]">{note.authorName}</span>
                      <span className="text-xs text-[#D8D5D0]">&middot;</span>
                      <span className="text-xs text-[#7A756E]">
                        {new Date(note.createdAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                placeholder="Add a note..."
                className="flex-1 text-sm border border-[#D8D5D0] rounded-lg px-3 py-2 focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 outline-none transition"
              />
              <button
                onClick={handleAddNote}
                disabled={!noteText.trim()}
                className="bg-[#ED202B] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#9B0E18] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>

          {/* Meta + delete */}
          <div className="flex items-center justify-between pt-3 border-t border-[#D8D5D0]">
            <div className="text-xs text-[#7A756E]">
              Created {new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {' '}&middot;{' '}
              Updated {new Date(lead.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#EF4444]">Delete this lead?</span>
                <button onClick={handleDelete} className="text-xs font-medium text-white bg-[#EF4444] px-2.5 py-1 rounded hover:bg-red-600 transition">
                  Yes
                </button>
                <button onClick={() => setShowDeleteConfirm(false)} className="text-xs font-medium text-[#7A756E] hover:text-[#201F1E] transition">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="text-xs text-[#7A756E] hover:text-[#EF4444] transition"
              >
                Delete lead
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#7A756E] mb-0.5">{label}</label>
      <p className="text-sm text-[#201F1E] font-medium">{value || '—'}</p>
    </div>
  );
}
