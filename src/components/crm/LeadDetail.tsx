import { useState, type ReactNode } from 'react';
import type {
  Lead,
  LeadStatus,
  LeadContact,
  LeadDocument,
  LeadDocumentCategory,
} from '../../types';
import { LEAD_STATUS_CONFIG, ACTIVE_LEAD_STATUSES } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import type { UserRecord } from '../../hooks/useUsers';
import { revealLeadPhone as callRevealPhone } from '../../lib/leadPhone';
import { addLeadArrayItem, removeLeadArrayItem } from '../../lib/leads';
import {
  uploadLeadDocument,
  removeLeadDocument,
  getLeadDocumentBlob,
} from '../../lib/leadDocuments';
import { TIER_CONFIG, TARGETABLE_REGIONS } from '../../lib/leadPipeline';

const DOCUMENT_SLOTS: { category: LeadDocumentCategory; label: string }[] = [
  { category: 'bill', label: 'Utility Bill' },
  { category: 'contract', label: 'Signed Contract' },
  { category: 'other', label: 'Other' },
];

const MAIL_GLYPH = (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
);

const PHONE_GLYPH = (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.2l-2.26 1.13a11 11 0 005.05 5.05l1.13-2.26a1 1 0 011.2-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.7 21 3 14.3 3 6V5z"
    />
  </svg>
);

function ContactRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm text-[#201F1E]">
      <span className="text-[#A9A39B] flex-shrink-0">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countyStateLabel(lead: Lead): string {
  const county = lead.county?.trim();
  const state = lead.state?.trim();
  if (county) {
    const withSuffix = /county$/i.test(county) ? county : `${county} County`;
    return state ? `${withSuffix}, ${state}` : withSuffix;
  }
  return [lead.city, lead.state].filter((p) => p && p.trim()).join(', ');
}

interface Props {
  lead: Lead;
  onUpdateStatus: (id: string, status: LeadStatus) => void;
  onUpdateLead: (id: string, fields: Partial<Lead>) => void;
  onAddNote: (leadId: string, text: string, authorId: string, authorName: string) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onGrab?: (id: string) => void;
  onDrop?: (id: string) => void;
  users: UserRecord[];
  isAdmin: boolean;
}

const STATUS_FLOW: LeadStatus[] = ['new', 'call_1', 'call_2', 'call_3'];

// The lead fields the Edit form owns.
interface Draft {
  businessName: string;
  decisionMakerName: string;
  decisionMakerRole: string;
  county: string;
  state: string;
  email: string;
  phone: string;
  description: string;
  assignedTo: string;
}

function makeDraft(l: Lead): Draft {
  return {
    businessName: l.businessName ?? '',
    decisionMakerName: l.decisionMakerName ?? '',
    decisionMakerRole: l.decisionMakerRole ?? '',
    county: l.county ?? '',
    state: l.state ?? '',
    email: l.email ?? '',
    phone: l.phone ?? '',
    description: l.description ?? '',
    assignedTo: l.assignedTo ?? '',
  };
}

export default function LeadDetail({
  lead,
  onUpdateStatus,
  onUpdateLead,
  onAddNote,
  onClose,
  onDelete,
  onGrab,
  onDrop,
  users,
  isAdmin,
}: Props) {
  const { user } = useAuth();
  const [noteText, setNoteText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  // Edit mode (explicit toggle so edits are deliberate, never accidental).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => makeDraft(lead));

  // Rep-added supplementary contact form.
  const [contactForm, setContactForm] = useState<{ open: boolean } & Omit<LeadContact, 'id'>>({
    open: false,
    name: '',
    role: '',
    phone: '',
    email: '',
  });

  // Documents.
  const [uploadingCat, setUploadingCat] = useState<LeadDocumentCategory | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  const currentIdx = STATUS_FLOW.indexOf(lead.status);
  const canClose = ACTIVE_LEAD_STATUSES.includes(lead.status);
  const isClosed = !ACTIVE_LEAD_STATUSES.includes(lead.status);
  // Only the owner or an admin may edit. A prospects lead (unassigned) is editable
  // by admins; a rep must Grab it first (mirrors the Firestore rule).
  const canEdit = isAdmin || (!!lead.assignedTo && lead.assignedTo === user?.uid);

  // Secondary actions live in the header ⋯ menu, not the body.
  const canDrop = !!onDrop && lead.assignedTo === user?.uid;
  const canDelete = isAdmin || lead.assignedTo === user?.uid;
  const hasMenuActions = isClosed || canDrop || canDelete;

  const authorName = user?.email?.split('@')[0] || 'Unknown';

  const handleAddNote = () => {
    if (!noteText.trim() || !user) return;
    onAddNote(lead.id, noteText.trim(), user.uid, user.email || 'Unknown');
    setNoteText('');
  };

  const handleDelete = () => {
    onDelete(lead.id);
    onClose();
  };

  const startEdit = () => {
    setDraft(makeDraft(lead));
    setEditing(true);
  };

  const saveEdit = () => {
    const changed: Partial<Lead> = {};
    if (draft.businessName.trim() !== (lead.businessName ?? ''))
      changed.businessName = draft.businessName.trim();
    if (draft.decisionMakerName.trim() !== (lead.decisionMakerName ?? ''))
      changed.decisionMakerName = draft.decisionMakerName.trim();
    if (draft.decisionMakerRole.trim() !== (lead.decisionMakerRole ?? ''))
      changed.decisionMakerRole = draft.decisionMakerRole.trim();
    if (draft.county.trim() !== (lead.county ?? '')) changed.county = draft.county.trim();
    if (draft.state.trim() !== (lead.state ?? '')) changed.state = draft.state.trim();
    if (draft.email.trim() !== (lead.email ?? '')) changed.email = draft.email.trim();
    if (draft.phone.trim() !== (lead.phone ?? '')) changed.phone = draft.phone.trim();
    if (draft.description.trim() !== (lead.description ?? ''))
      changed.description = draft.description.trim();
    // Reassignment is admin-only (Firestore rule enforces it too).
    if (isAdmin && draft.assignedTo !== (lead.assignedTo ?? '')) {
      changed.assignedTo = draft.assignedTo;
      const u = users.find((x) => x.id === draft.assignedTo);
      changed.assignedToName = u ? u.email.split('@')[0] : '';
    }
    if (Object.keys(changed).length > 0) onUpdateLead(lead.id, changed);
    setEditing(false);
  };

  const handleReveal = async () => {
    setRevealing(true);
    setRevealError(null);
    try {
      await callRevealPhone(lead.id);
      // The function sets mobileStatus='pending'; the apolloPhoneWebhook then writes
      // mobilePhone + mobileStatus='revealed', and the real-time leads subscription
      // re-renders this modal with the number.
    } catch (err) {
      setRevealError(err instanceof Error ? err.message : 'Could not start the reveal.');
    } finally {
      setRevealing(false);
    }
  };

  // Additive contact writes optimistically close the form; if the Firestore write
  // rejects, surface it rather than reporting a false success.
  const surfaceArrayError = (err: unknown) => {
    console.error('[LeadDetail] array write failed:', err);
    window.alert('Could not save that change — please check your connection and try again.');
  };

  const handleAddContact = () => {
    if (!contactForm.name.trim()) return;
    const contact: LeadContact = {
      id: genId(),
      name: contactForm.name.trim(),
      role: contactForm.role.trim(),
      phone: contactForm.phone.trim(),
      email: contactForm.email.trim(),
    };
    addLeadArrayItem(lead.id, 'additionalContacts', contact).catch(surfaceArrayError);
    setContactForm({ open: false, name: '', role: '', phone: '', email: '' });
  };

  const handleRemoveContact = (contact: LeadContact) => {
    removeLeadArrayItem(lead.id, 'additionalContacts', contact).catch(surfaceArrayError);
  };

  const handleRemoveDoc = async (docId: string) => {
    setDocError(null);
    try {
      await removeLeadDocument(lead, docId);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Could not remove the document.');
    }
  };

  const handleUpload = async (category: LeadDocumentCategory, file: File) => {
    if (!user) return;
    setUploadingCat(category);
    setDocError(null);
    try {
      await uploadLeadDocument(lead, category, file, user.uid, authorName);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadingCat(null);
    }
  };

  const handleDownload = async (d: LeadDocument) => {
    try {
      const blob = await getLeadDocumentBlob(d);
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = d.name;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Download failed.');
    }
  };

  const statusCfg = LEAD_STATUS_CONFIG[lead.status];

  // Location — county/state primary, plus the full street + a maps link.
  const countyState = countyStateLabel(lead);
  const hasLocation = Boolean(lead.parcelAddress?.trim() || countyState);
  const showMailing =
    lead.mailingAddress?.trim() && lead.mailingAddress.trim() !== lead.parcelAddress?.trim();

  // Edit-form location dropdowns, driven by TARGETABLE_REGIONS (NY today). Any
  // already-set off-list value is kept so editing never blanks a lead.
  const stateOptions = Object.entries(TARGETABLE_REGIONS).map(([code, r]) => ({
    code,
    label: r.label,
  }));
  if (draft.state && !TARGETABLE_REGIONS[draft.state])
    stateOptions.unshift({ code: draft.state, label: draft.state });
  const baseCounties = TARGETABLE_REGIONS[draft.state]?.counties ?? [];
  const countyOptions =
    draft.county && !baseCounties.includes(draft.county)
      ? [draft.county, ...baseCounties]
      : baseCounties;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl border border-[#D8D5D0] w-full max-w-2xl max-h-[84vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-[#D8D5D0] px-6 py-4 flex items-start justify-between gap-3 rounded-t-xl">
          <div className="min-w-0">
            <h2 className="font-heading text-xl font-semibold text-[#201F1E] truncate">
              {editing ? draft.businessName || 'Untitled lead' : lead.businessName}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: statusCfg.color + '18', color: statusCfg.color }}
              >
                {statusCfg.label}
              </span>
              {lead.tier && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{
                    backgroundColor: TIER_CONFIG[lead.tier].color + '18',
                    color: TIER_CONFIG[lead.tier].color,
                  }}
                >
                  {TIER_CONFIG[lead.tier].label}
                </span>
              )}
              <span className="text-xs text-[#7A756E]">
                {lead.assignedToName ? (
                  <>
                    Owned by{' '}
                    <span className="font-medium text-[#201F1E]">{lead.assignedToName}</span>
                  </>
                ) : (
                  <span className="font-medium text-[#201F1E]">In prospects</span>
                )}
              </span>
            </div>
            <p className="text-[11px] text-[#A9A39B] mt-1.5">
              Created{' '}
              {new Date(lead.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
              {' · '}Updated{' '}
              {new Date(lead.updatedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {canEdit &&
              (editing ? (
                <>
                  <button
                    onClick={() => setEditing(false)}
                    className="text-sm font-medium text-[#7A756E] hover:text-[#201F1E] transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEdit}
                    className="text-sm font-medium bg-[#ED202B] text-white px-3 py-1.5 rounded-lg hover:bg-[#9B0E18] transition"
                  >
                    Save
                  </button>
                </>
              ) : (
                <button
                  onClick={startEdit}
                  className="inline-flex items-center gap-1.5 text-sm font-medium bg-[#ED202B] text-white px-3 py-1.5 rounded-lg hover:bg-[#9B0E18] transition"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  Edit
                </button>
              ))}

            {!editing && hasMenuActions && (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="text-[#7A756E] hover:text-[#201F1E] transition p-1 rounded-lg hover:bg-stone-100"
                  title="More actions"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="12" cy="19" r="1.6" />
                  </svg>
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 mt-1 w-48 bg-white border border-[#D8D5D0] rounded-lg shadow-lg z-30 py-1">
                      {isClosed && (
                        <button
                          onClick={() => {
                            onUpdateStatus(lead.id, 'new');
                            setMenuOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-[#201F1E] hover:bg-stone-50 transition"
                        >
                          Reopen lead → New
                        </button>
                      )}
                      {canDrop && (
                        <button
                          onClick={() => {
                            onDrop?.(lead.id);
                            setMenuOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-[#201F1E] hover:bg-stone-50 transition"
                        >
                          Return to prospects
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => {
                            setShowDeleteConfirm(true);
                            setMenuOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-[#EF4444] hover:bg-[#EF4444]/5 transition"
                        >
                          Delete lead
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              onClick={onClose}
              className="text-[#7A756E] hover:text-[#201F1E] transition p-1"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Delete confirm bar */}
        {showDeleteConfirm && (
          <div className="px-6 py-3 bg-[#EF4444]/5 border-b border-[#EF4444]/20 flex items-center justify-between gap-3">
            <span className="text-sm text-[#201F1E]">Delete this lead permanently?</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="text-sm font-medium text-[#7A756E] hover:text-[#201F1E] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="text-sm font-medium bg-[#EF4444] text-white px-3 py-1.5 rounded-lg hover:bg-red-600 transition"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        <div className="px-6 py-5 space-y-7">
          {/* Prospects → grab CTA */}
          {onGrab && !lead.assignedTo && (
            <button
              onClick={() => onGrab(lead.id)}
              className="w-full bg-[#ED202B] text-white text-sm font-medium py-2.5 rounded-lg hover:bg-[#9B0E18] transition"
            >
              Grab this lead → My Pipeline
            </button>
          )}

          {/* ── Company info ────────────────────────────────────────────── */}
          <section>
            <SectionTitle>Company info</SectionTitle>
            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <EditField label="Company name" className="sm:col-span-2">
                  <input
                    type="text"
                    value={draft.businessName}
                    onChange={(e) => setDraft((d) => ({ ...d, businessName: e.target.value }))}
                    className={INPUT}
                  />
                </EditField>
                <EditField label="State">
                  <select
                    value={draft.state}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, state: e.target.value, county: '' }))
                    }
                    className={INPUT}
                  >
                    <option value="">Select state…</option>
                    {stateOptions.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </EditField>
                <EditField label="County">
                  <select
                    value={draft.county}
                    onChange={(e) => setDraft((d) => ({ ...d, county: e.target.value }))}
                    disabled={countyOptions.length === 0}
                    className={`${INPUT} disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <option value="">
                      {draft.state ? 'Select county…' : 'Pick a state first'}
                    </option>
                    {countyOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </EditField>
                <EditField label="Business description" className="sm:col-span-2">
                  <textarea
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    rows={3}
                    className={`${INPUT} resize-y`}
                  />
                </EditField>
                {isAdmin && (
                  <EditField label="Assigned to" className="sm:col-span-2">
                    <select
                      value={draft.assignedTo}
                      onChange={(e) => setDraft((d) => ({ ...d, assignedTo: e.target.value }))}
                      className={INPUT}
                    >
                      <option value="">Unassigned (prospects)</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.email}
                        </option>
                      ))}
                    </select>
                  </EditField>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {hasLocation && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-[#7A756E] mb-1">Location</label>
                    <div className="text-sm text-[#201F1E] bg-stone-50 rounded-lg px-3 py-2">
                      {countyState && <div className="font-medium">{countyState}</div>}
                      {lead.parcelAddress?.trim() && (
                        <div className="text-[#7A756E]">{lead.parcelAddress}</div>
                      )}
                      {showMailing && (
                        <div className="text-xs text-[#7A756E] mt-1">
                          Mailing: {lead.mailingAddress}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#7A756E] mb-1">
                    Business description
                  </label>
                  <p className="text-sm text-[#201F1E] bg-stone-50 rounded-lg px-3 py-2">
                    {lead.description || <span className="text-[#A9A39B]">—</span>}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* ── People info ─────────────────────────────────────────────── */}
          <section>
            <SectionTitle>People info</SectionTitle>
            <p className="text-xs font-medium text-[#7A756E] mb-1.5">Decision maker 1</p>
            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <EditField label="Name">
                  <input
                    type="text"
                    value={draft.decisionMakerName}
                    onChange={(e) => setDraft((d) => ({ ...d, decisionMakerName: e.target.value }))}
                    className={INPUT}
                  />
                </EditField>
                <EditField label="Role">
                  <input
                    type="text"
                    value={draft.decisionMakerRole}
                    onChange={(e) => setDraft((d) => ({ ...d, decisionMakerRole: e.target.value }))}
                    className={INPUT}
                  />
                </EditField>
                <EditField label="Email" className="sm:col-span-2">
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                    className={INPUT}
                  />
                </EditField>
                <EditField label="Main line" className="sm:col-span-2">
                  <input
                    type="tel"
                    value={draft.phone}
                    onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                    className={INPUT}
                  />
                </EditField>
              </div>
            ) : (
              <div className="bg-stone-50 rounded-lg p-3">
                <p className="text-sm font-medium text-[#201F1E]">
                  {lead.decisionMakerName || <span className="text-[#A9A39B]">—</span>}
                </p>
                {lead.decisionMakerRole && (
                  <p className="text-xs text-[#7A756E]">{lead.decisionMakerRole}</p>
                )}
                <div className="mt-2.5 space-y-2">
                  <ContactRow icon={MAIL_GLYPH}>
                    {lead.email ? (
                      <a href={`mailto:${lead.email}`} className="hover:text-[#ED202B] transition">
                        {lead.email}
                      </a>
                    ) : (
                      <span className="text-[#A9A39B]">—</span>
                    )}
                  </ContactRow>
                  <ContactRow icon={PHONE_GLYPH}>
                    {lead.phone ? (
                      <a href={`tel:${lead.phone}`} className="hover:text-[#ED202B] transition">
                        {lead.phone}
                      </a>
                    ) : (
                      <span className="text-[#A9A39B]">—</span>
                    )}
                    <span className="text-xs text-[#A9A39B]"> · Main line</span>
                  </ContactRow>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[#A9A39B] flex-shrink-0">{PHONE_GLYPH}</span>
                    {lead.mobilePhone ? (
                      <span className="flex items-center gap-2 min-w-0">
                        <a
                          href={`tel:${lead.mobilePhone}`}
                          className="font-semibold text-[#201F1E] hover:text-[#ED202B] transition truncate"
                        >
                          {lead.mobilePhone}
                        </a>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          Direct line
                        </span>
                      </span>
                    ) : lead.mobileStatus === 'pending' || revealing ? (
                      <span className="inline-flex items-center gap-2 text-[#7A756E]">
                        <svg
                          className="h-4 w-4 animate-spin text-[#ED202B]"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"
                          />
                        </svg>
                        Revealing…
                      </span>
                    ) : (
                      <button
                        onClick={handleReveal}
                        className="bg-[#ED202B] text-white text-xs font-medium px-2.5 py-1 rounded-md hover:bg-[#9B0E18] transition"
                      >
                        Grab number
                      </button>
                    )}
                  </div>
                  {lead.mobileStatus === 'failed' && !lead.mobilePhone && (
                    <p className="text-xs text-[#7A756E]">No direct mobile found.</p>
                  )}
                  {revealError && <p className="text-xs text-[#EF4444]">{revealError}</p>}
                </div>
              </div>
            )}

            {/* Decision maker 2..N — additional contacts, same card format. */}
            <div className="space-y-3 mt-3">
              {(lead.additionalContacts ?? []).map((c, i) => (
                <div key={c.id}>
                  <p className="text-xs font-medium text-[#7A756E] mb-1.5">Decision maker {i + 2}</p>
                  <div className="bg-stone-50 rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#201F1E]">
                          {c.name || <span className="text-[#A9A39B]">—</span>}
                        </p>
                        {c.role && <p className="text-xs text-[#7A756E]">{c.role}</p>}
                      </div>
                      <button
                        onClick={() => handleRemoveContact(c)}
                        className="text-xs text-[#7A756E] hover:text-[#EF4444] transition ml-2 flex-shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                    {c.email || c.phone ? (
                      <div className="mt-2.5 space-y-2">
                        {c.email && (
                          <ContactRow icon={MAIL_GLYPH}>
                            <a
                              href={`mailto:${c.email}`}
                              className="hover:text-[#ED202B] transition"
                            >
                              {c.email}
                            </a>
                          </ContactRow>
                        )}
                        {c.phone && (
                          <ContactRow icon={PHONE_GLYPH}>
                            <a href={`tel:${c.phone}`} className="hover:text-[#ED202B] transition">
                              {c.phone}
                            </a>
                          </ContactRow>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-[#A9A39B] mt-2">No contact details</p>
                    )}
                  </div>
                </div>
              ))}

              {contactForm.open && (
                <div>
                  <p className="text-xs font-medium text-[#7A756E] mb-1.5">
                    Decision maker {(lead.additionalContacts ?? []).length + 2}
                  </p>
                  <div className="bg-stone-50 rounded-lg p-3 space-y-2 border border-[#D8D5D0]">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={contactForm.name}
                        onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Name *"
                        className={INPUT}
                      />
                      <input
                        type="text"
                        value={contactForm.role}
                        onChange={(e) => setContactForm((f) => ({ ...f, role: e.target.value }))}
                        placeholder="Role"
                        className={INPUT}
                      />
                      <input
                        type="tel"
                        value={contactForm.phone}
                        onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="Phone"
                        className={INPUT}
                      />
                      <input
                        type="email"
                        value={contactForm.email}
                        onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="Email"
                        className={INPUT}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() =>
                          setContactForm({ open: false, name: '', role: '', phone: '', email: '' })
                        }
                        className="text-xs font-medium text-[#7A756E] hover:text-[#201F1E] transition px-2"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddContact}
                        disabled={!contactForm.name.trim()}
                        className="text-xs font-medium bg-[#ED202B] text-white px-3 py-1.5 rounded-lg hover:bg-[#9B0E18] transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {!contactForm.open && (
              <button
                onClick={() => setContactForm((f) => ({ ...f, open: true }))}
                className="mt-3 w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-[#ED202B] border border-dashed border-[#ED202B]/40 rounded-lg py-2 hover:bg-[#ED202B]/5 transition"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add decision maker
              </button>
            )}
          </section>

          {/* ── Status ──────────────────────────────────────────────────── */}
          <section>
            <SectionTitle>Status</SectionTitle>
            {canClose ? (
              <>
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
                          <svg
                            className="h-3 w-3 text-[#D8D5D0] flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-[#A9A39B] mt-2">Click a stage to move the lead.</p>
                <div className="flex gap-2 mt-3">
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
                </div>
              </>
            ) : (
              <p className="text-sm text-[#7A756E]">
                This lead is{' '}
                <span className="font-medium" style={{ color: statusCfg.color }}>
                  {statusCfg.label}
                </span>
. Reopen it from the ⋮ menu to work it again.
              </p>
            )}
          </section>

          {/* ── Documents ───────────────────────────────────────────────── */}
          <section>
            <SectionTitle>Documents</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {DOCUMENT_SLOTS.map((slot) => {
                const docs = (lead.documents ?? []).filter((d) => d.category === slot.category);
                const busy = uploadingCat === slot.category;
                return (
                  <div
                    key={slot.category}
                    className="border border-[#D8D5D0] rounded-xl p-3 flex flex-col gap-2"
                  >
                    <span className="text-sm font-medium text-[#201F1E]">{slot.label}</span>
                    {docs.length > 0 && (
                      <div className="space-y-1">
                        {docs.map((d) => (
                          <div key={d.id} className="flex items-center justify-between gap-1">
                            <button
                              onClick={() => void handleDownload(d)}
                              className="flex items-center gap-1.5 text-xs text-[#201F1E] hover:text-[#ED202B] transition min-w-0"
                            >
                              <svg
                                className="h-3.5 w-3.5 flex-shrink-0 text-[#7A756E]"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                              <span className="truncate">{d.name}</span>
                              <span className="text-[#A9A39B] flex-shrink-0">
                                {formatSize(d.sizeBytes)}
                              </span>
                            </button>
                            <button
                              onClick={() => void handleRemoveDoc(d.id)}
                              className="text-[#7A756E] hover:text-[#EF4444] transition flex-shrink-0"
                              title="Remove"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <label
                      className={`mt-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg border border-dashed py-2 transition ${
                        uploadingCat !== null
                          ? 'border-[#D8D5D0] text-[#A9A39B] cursor-not-allowed'
                          : 'border-[#ED202B]/40 text-[#ED202B] hover:bg-[#ED202B]/5 cursor-pointer'
                      }`}
                    >
                      {busy ? (
                        'Uploading…'
                      ) : (
                        <>
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 9l5-5 5 5M12 4v12"
                            />
                          </svg>
                          {docs.length > 0 ? 'Add another' : 'Upload'}
                        </>
                      )}
                      <input
                        type="file"
                        className="hidden"
                        disabled={uploadingCat !== null}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleUpload(slot.category, f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
            {docError && <p className="text-xs text-[#EF4444] mt-1">{docError}</p>}
          </section>

          {/* ── Notes ───────────────────────────────────────────────────── */}
          <section>
            <SectionTitle>Notes ({lead.notes.length})</SectionTitle>
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
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
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
          </section>
        </div>
      </div>
    </div>
  );
}

const INPUT =
  'w-full text-sm border border-[#D8D5D0] rounded-lg px-3 py-2 bg-white focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 outline-none transition';

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A756E] mb-3">{children}</h3>
  );
}

function EditField({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-[#7A756E] mb-1">{label}</label>
      {children}
    </div>
  );
}

