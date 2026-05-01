import { useEffect, useState } from 'react';
import { userLabel, type UserRecord } from '../../hooks/useUsers';
import type { JobTask } from '../../types';

interface Props {
  task: JobTask;
  eligibleAssignees: UserRecord[];
  canEdit: boolean;
  onSave: (updates: Partial<JobTask>) => Promise<void>;
  onClose: () => void;
}

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white px-3 py-2 text-sm transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none';

function dueDateInputValue(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toISOString().slice(0, 10);
}

export default function TaskEditModal({ task, eligibleAssignees, canEdit, onSave, onClose }: Props) {
  const [title, setTitle] = useState(task.title);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? '');
  const [dueDate, setDueDate] = useState(dueDateInputValue(task.dueDate));
  const [notes, setNotes] = useState(task.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  async function handleSave() {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const dueMs = dueDate ? Date.parse(dueDate) : NaN;
      const patch: Partial<JobTask> = {
        title: title.trim(),
        assigneeId: assigneeId || undefined,
        dueDate: Number.isFinite(dueMs) ? dueMs : undefined,
        notes: notes.trim() || undefined,
      };
      await onSave(patch);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-edit-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-[#D8D5D0] overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#D8D5D0]">
          <h3 id="task-edit-modal-title" className="font-heading font-semibold text-[#201F1E]">
            {canEdit ? 'Edit task' : 'Task details'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#7A756E] hover:text-[#ED202B] transition"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-[#7A756E] block mb-1">Title</span>
            <input
              type="text"
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              autoFocus={canEdit}
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-[#7A756E] block mb-1">Assignee</span>
              <select
                className={inputClass}
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                disabled={!canEdit}
              >
                <option value="">— Unassigned —</option>
                {eligibleAssignees.map((u) => (
                  <option key={u.id} value={u.id}>{userLabel(u)}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-[#7A756E] block mb-1">Due date</span>
              <input
                type="date"
                className={inputClass}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={!canEdit}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-[#7A756E] block mb-1">Notes</span>
            <textarea
              className={`${inputClass} min-h-[88px]`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEdit}
              placeholder="Context, links, follow-ups…"
            />
          </label>

          {error && <p className="text-sm text-[#ED202B]" role="alert">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#D8D5D0] bg-stone-50">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-sm font-medium text-[#201F1E] hover:text-[#ED202B] transition disabled:opacity-40"
          >
            {canEdit ? 'Cancel' : 'Close'}
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-[#ED202B] hover:bg-[#9B0E18] transition disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
