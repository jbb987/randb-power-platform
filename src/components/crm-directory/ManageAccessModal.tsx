import { useMemo, useState } from 'react';
import {
  accessModeToFieldValue,
  classifyAccessMode,
  type AccessMode,
} from '../../lib/folderAccess';
import { useUsers } from '../../hooks/useUsers';
import type { DocumentRecord, Folder } from '../../types';

interface Props {
  target: { kind: 'folder'; folder: Folder } | { kind: 'doc'; doc: DocumentRecord };
  onClose: () => void;
  onSave: (viewerUserIds: string[] | null, editorUserIds: string[] | null) => Promise<void>;
}

/** Manage Access modal — sets `viewerUserIds` / `editorUserIds` on a folder
 *  or document. Three modes per axis (view / edit):
 *   • Inherit from parent (null in Firestore)
 *   • Admin only (empty array)
 *   • Specific people (non-empty array of UIDs)
 *
 *  Admins always pass regardless of these lists — the modal hides this
 *  detail from the picker UI (admins don't appear in the checkbox list). */
export default function ManageAccessModal({ target, onClose, onSave }: Props) {
  const { users } = useUsers();
  const item = target.kind === 'folder' ? target.folder : target.doc;

  const [viewMode, setViewMode] = useState<AccessMode>(classifyAccessMode(item.viewerUserIds));
  const [editMode, setEditMode] = useState<AccessMode>(classifyAccessMode(item.editorUserIds));
  const [viewers, setViewers] = useState<Set<string>>(new Set(item.viewerUserIds ?? []));
  const [editors, setEditors] = useState<Set<string>>(new Set(item.editorUserIds ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admins always pass — hide them from the picker so the UI doesn't look
  // like they could be excluded.
  const pickableUsers = useMemo(() => users.filter((u) => u.role !== 'admin'), [users]);

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, uid: string) {
    const next = new Set(set);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setter(next);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const viewerValue = accessModeToFieldValue(viewMode, Array.from(viewers));
      const editorValue = accessModeToFieldValue(editMode, Array.from(editors));
      await onSave(viewerValue, editorValue);
      onClose();
    } catch (err) {
      console.error('[ManageAccessModal] save failed', err);
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const name = target.kind === 'folder' ? target.folder.name : target.doc.name;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="font-heading font-semibold text-[#201F1E] mb-1">Manage access</h4>
        <p className="text-xs text-[#7A756E] mb-4 truncate">
          {target.kind === 'folder' ? 'Folder' : 'Document'}: <span className="font-medium">{name}</span>
        </p>

        <ModeSection
          label="Who can SEE this?"
          mode={viewMode}
          setMode={setViewMode}
          users={pickableUsers}
          selected={viewers}
          onToggle={(uid) => toggle(viewers, setViewers, uid)}
        />

        <hr className="my-4 border-[#D8D5D0]" />

        <ModeSection
          label="Who can EDIT this? (upload, rename, archive)"
          mode={editMode}
          setMode={setEditMode}
          users={pickableUsers}
          selected={editors}
          onToggle={(uid) => toggle(editors, setEditors, uid)}
        />

        <p className="mt-4 text-xs text-[#7A756E]">
          Admins always have access — they don't appear in the lists above and can't be excluded.
        </p>

        {error && (
          <div className="mt-3 rounded-lg border border-[#ED202B]/30 bg-[#ED202B]/5 p-2 text-xs text-[#ED202B]">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-sm font-medium text-[#7A756E] hover:text-[#201F1E] px-3 py-1.5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-sm font-medium text-white bg-[#ED202B] hover:bg-[#9B0E18] px-3 py-1.5 rounded-lg transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save access'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeSection({
  label,
  mode,
  setMode,
  users,
  selected,
  onToggle,
}: {
  label: string;
  mode: AccessMode;
  setMode: (m: AccessMode) => void;
  users: ReturnType<typeof useUsers>['users'];
  selected: Set<string>;
  onToggle: (uid: string) => void;
}) {
  return (
    <div>
      <p className="font-medium text-sm text-[#201F1E] mb-2">{label}</p>
      <div className="space-y-1.5">
        <Radio
          checked={mode === 'inherit'}
          onChange={() => setMode('inherit')}
          label="Inherit from parent folder"
        />
        <Radio
          checked={mode === 'admin-only'}
          onChange={() => setMode('admin-only')}
          label="Admin only"
        />
        <Radio
          checked={mode === 'specific'}
          onChange={() => setMode('specific')}
          label="Specific people"
        />
      </div>
      {mode === 'specific' && (
        <div className="mt-2 ml-6 rounded-lg border border-[#D8D5D0] p-2 max-h-[160px] overflow-y-auto">
          {users.length === 0 ? (
            <p className="text-xs text-[#7A756E] py-1 px-1">
              No non-admin users to choose from yet.
            </p>
          ) : (
            users.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-2 py-1 px-1 text-sm text-[#201F1E] cursor-pointer hover:bg-stone-50 rounded"
              >
                <input
                  type="checkbox"
                  checked={selected.has(u.id)}
                  onChange={() => onToggle(u.id)}
                  className="accent-[#ED202B]"
                />
                <span className="min-w-0 flex-1 truncate">
                  {u.displayName ?? u.email}{' '}
                  <span className="text-xs text-[#7A756E]">({u.role})</span>
                </span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Radio({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-[#201F1E] cursor-pointer">
      <input type="radio" checked={checked} onChange={onChange} className="accent-[#ED202B]" />
      {label}
    </label>
  );
}
