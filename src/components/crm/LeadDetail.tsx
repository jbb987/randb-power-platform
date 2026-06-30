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
import { TIER_CONFIG } from '../../lib/leadPipeline';

const DOCUMENT_SLOTS: { category: LeadDocumentCategory; label: string }[] = [
  { category: 'bill', label: 'Utility Bill' },
  { category: 'contract', label: 'Signed Contract' },
  { category: 'other', label: 'Other' },
];

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
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  // Edit mode (explicit toggle so edits are deliberate, never accidental).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => makeDraft(lead));

  // Rep-added supplementary contact / phone forms.
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
  // Only the owner or an admin may edit. A pool lead (unassigned) is editable by
  // admins; a rep must Grab it first (mirrors the Firestore rule).
  const canEdit = isAdmin || (!!lead.assignedTo && lead.assignedTo === user?.uid);

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

  // Additive contact/phone writes optimistically close their form; if the
  // Firestore write rejects, surface it rather than reporting a false success.
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
      // Firefox/Safari ignore clicks on un-attached anchors and need the blob
      // URL to outlive the click — append, click, remove, then revoke on a delay.
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
  const mapsQuery = [lead.parcelAddress, countyState].filter((p) => p && p.trim()).join(', ');
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`;
  const showMailing =
    lead.mailingAddress?.trim() && lead.mailingAddress.trim() !== lead.parcelAddress?.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl border border-[#D8D5D0] w-full max-w-2xl max-h-[84vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-[#D8D5D0] px-6 py-4 flex items-start justify-between rounded-t-xl">
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
                  <span className="font-medium text-[#201F1E]">In grab pool</span>
                )}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#7A756E] hover:text-[#201F1E] transition p-1 flex-shrink-0"
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

        <div className="px-6 py-5 space-y-6">
          {/* ── Lead info (read ↔ edit) ─────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A756E]">
                Lead info
              </h3>
              {canEdit &&
                (editing ? (
                  <div className="flex items-center gap-2">
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
                  </div>
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
            </div>

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
                <EditField label="Decision maker">
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
                <EditField label="County">
                  <input
                    type="text"
                    value={draft.county}
                    onChange={(e) => setDraft((d) => ({ ...d, county: e.target.value }))}
                    className={INPUT}
                  />
                </EditField>
                <EditField label="State">
                  <input
                    type="text"
                    value={draft.state}
                    onChange={(e) => setDraft((d) => ({ ...d, state: e.target.value }))}
                    className={INPUT}
                  />
                </EditField>
                <EditField label="Email">
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                    className={INPUT}
                  />
                </EditField>
                <EditField label="Phone">
                  <input
                    type="tel"
                    value={draft.phone}
                    onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                    className={INPUT}
                  />
                </EditField>
                <EditField label="Description" className="sm:col-span-2">
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
                      <option value="">Unassigned (grab pool)</option>
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
                <InfoField label="Decision Maker" value={lead.decisionMakerName} />
                <InfoField label="Role" value={lead.decisionMakerRole} />
                <InfoField label="Email" value={lead.email} />
                <InfoField label="Phone (main line)" value={lead.phone} />
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
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#ED202B] hover:text-[#9B0E18] transition mt-1.5"
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
                          d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      Open in Maps
                      </a>
                    </div>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#7A756E] mb-1">Description</label>
                  <p className="text-sm text-[#201F1E] bg-stone-50 rounded-lg px-3 py-2">
                    {lead.description || <span className="text-[#A9A39B]">—</span>}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* ── Direct mobile — on-demand Apollo reveal ("grab number") ──── */}
          <div>
            <label className="block text-xs font-medium text-[#7A756E] mb-1">Mobile (direct)</label>
            {lead.mobilePhone ? (
              <a
                href={`tel:${lead.mobilePhone}`}
                className="text-sm font-semibold text-[#201F1E] hover:text-[#ED202B] transition"
              >
                {lead.mobilePhone}
              </a>
            ) : lead.mobileStatus === 'pending' || revealing ? (
              <span className="inline-flex items-center gap-2 text-sm text-[#7A756E]">
                <svg className="h-4 w-4 animate-spin text-[#ED202B]" viewBox="0 0 24 24" fill="none">
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
                Revealing mobile…
              </span>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReveal}
                  className="inline-flex items-center gap-1.5 bg-[#ED202B] text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-[#9B0E18] transition"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.2l-2.26 1.13a11 11 0 005.05 5.05l1.13-2.26a1 1 0 011.2-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.7 21 3 14.3 3 6V5z"
                    />
                  </svg>
                  Grab number
                </button>
                {lead.mobileStatus === 'failed' && (
                  <span className="text-xs text-[#7A756E]">No mobile found — use the main line.</span>
                )}
              </div>
            )}
            {revealError && <p className="text-xs text-[#EF4444] mt-1">{revealError}</p>}
          </div>

          {/* ── Additional contacts / decision makers ───────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-[#7A756E]">More contacts</label>
              {!contactForm.open && (
                <button
                  onClick={() => setContactForm((f) => ({ ...f, open: true }))}
                  className="text-xs font-medium bg-[#ED202B] text-white px-2.5 py-1.5 rounded-lg hover:bg-[#9B0E18] transition"
                >
                  + Add contact
                </button>
              )}
            </div>
            {(lead.additionalContacts ?? []).length > 0 && (
              <div className="space-y-2 mb-2">
                {(lead.additionalContacts ?? []).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-start justify-between bg-stone-50 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#201F1E]">
                        {c.name}
                        {c.role && <span className="text-[#7A756E] font-normal"> · {c.role}</span>}
                      </p>
                      <p className="text-xs text-[#7A756E] truncate">
                        {[c.phone, c.email].filter(Boolean).join(' · ') || 'No contact details'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveContact(c)}
                      className="text-xs text-[#7A756E] hover:text-[#EF4444] transition ml-2 flex-shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            {contactForm.open && (
              <div className="bg-stone-50 rounded-lg p-3 space-y-2">
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
                    Save contact
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Documents (card slots) ──────────────────────────────────── */}
          <div>
            <label className="block text-xs font-medium text-[#7A756E] mb-2">Documents</label>
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
          </div>

          {/* ── Status ──────────────────────────────────────────────────── */}
          {ACTIVE_LEAD_STATUSES.includes(lead.status) && (
            <div>
              <label className="block text-xs font-medium text-[#7A756E] mb-2">Status</label>
              <div className="flex items-center gap-1">
                {STATUS_FLOW.map((s, i) => {
                  const cfg = LEAD_STATUS_CONFIG[s];
                  const isActive = i <= currentIdx;
                  return (
                    <div key={s} className="flex items-center gap-1 flex-1">
                      <button
                        onClick={() => onUpdateStatus(lead.id, s)}
                        className={`flex-1 text-xs py-1.5 rounded-md font-medium transition ${
                          isActive ? 'text-white' : 'bg-stone-100 text-[#7A756E] hover:bg-stone-200'
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
              <p className="text-xs text-[#A9A39B] mt-2">Click a stage above to move the lead.</p>
              {canClose && (
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
              )}
            </div>
          )}

          {!ACTIVE_LEAD_STATUSES.includes(lead.status) && (
            <div>
              <button
                onClick={() => onUpdateStatus(lead.id, 'new')}
                className="inline-flex text-sm font-medium bg-[#ED202B] text-white px-3 py-1.5 rounded-lg hover:bg-[#9B0E18] transition"
              >
                Reopen lead → New
              </button>
            </div>
          )}

          {/* ── Pool actions ────────────────────────────────────────────── */}
          {onGrab && !lead.assignedTo && (
            <button
              onClick={() => onGrab(lead.id)}
              className="w-full bg-[#ED202B] text-white text-sm font-medium py-2.5 rounded-lg hover:bg-[#9B0E18] transition"
            >
              Grab this lead → My Pipeline
            </button>
          )}

          {/* ── Notes ───────────────────────────────────────────────────── */}
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
          </div>

          {/* ── Footer: drop / meta / delete ────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#D8D5D0]">
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#7A756E]">
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
              </span>
            </div>
            <div className="flex items-center gap-3">
              {onDrop && lead.assignedTo === user?.uid && (
                <button
                  onClick={() => onDrop(lead.id)}
                  className="text-xs font-medium text-[#7A756E] hover:text-[#ED202B] transition"
                >
                  Drop to pool
                </button>
              )}
              {(isAdmin || lead.assignedTo === user?.uid) &&
                (showDeleteConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#EF4444]">Delete this lead?</span>
                    <button
                      onClick={handleDelete}
                      className="text-xs font-medium text-white bg-[#EF4444] px-2.5 py-1 rounded hover:bg-red-600 transition"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="text-xs font-medium text-[#7A756E] hover:text-[#201F1E] transition"
                    >
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
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const INPUT =
  'w-full text-sm border border-[#D8D5D0] rounded-lg px-3 py-2 bg-white focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 outline-none transition';

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

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#7A756E] mb-1">{label}</label>
      <p className="text-sm text-[#201F1E] bg-stone-50 rounded-lg px-3 py-2 min-h-[38px]">
        {value || <span className="text-[#A9A39B]">—</span>}
      </p>
    </div>
  );
}
