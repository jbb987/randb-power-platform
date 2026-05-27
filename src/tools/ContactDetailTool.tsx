import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import CompanyPicker from '../components/crm-directory/CompanyPicker';
import { useContact, useContacts } from '../hooks/useContacts';
import { useCompanies } from '../hooks/useCompanies';
import { useAuth } from '../hooks/useAuth';
import { logView } from '../lib/userHistory';
import { shouldLogView } from '../lib/routeToolMap';
import { primaryAffiliation } from '../lib/crmContacts';
import ContactPicker from '../components/crm-directory/ContactPicker';
import type { Contact, ContactAffiliation } from '../types';

type FormState = {
  firstName: string;
  lastName: string;
  affiliations: ContactAffiliation[];
  email: string;
  phone: string;
  note: string;
};

const EMPTY_FORM: FormState = {
  firstName: '',
  lastName: '',
  affiliations: [],
  email: '',
  phone: '',
  note: '',
};

function contactToForm(c: Contact): FormState {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    affiliations: c.affiliations,
    email: c.email ?? '',
    phone: c.phone ?? '',
    note: c.note ?? '',
  };
}

/** Ensure exactly one primary in the list. If none, mark the first. If more
 *  than one, keep the first flagged and clear the others. */
function reconcilePrimary(list: ContactAffiliation[]): ContactAffiliation[] {
  let sawPrimary = false;
  const out = list.map((a) => {
    if (a.isPrimary && !sawPrimary) {
      sawPrimary = true;
      return a;
    }
    return { ...a, isPrimary: false };
  });
  if (!sawPrimary && out.length > 0) {
    out[0] = { ...out[0], isPrimary: true };
  }
  return out;
}

export default function ContactDetailTool() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const { contact, loading } = useContact(isNew ? undefined : id);
  const { companies } = useCompanies();
  const { contacts: allContacts, createContact, updateContact, removeContact } = useContacts();
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const initialCompanyId = searchParams.get('companyId') ?? '';
  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<FormState>(() =>
    isNew
      ? {
          ...EMPTY_FORM,
          affiliations: initialCompanyId
            ? [{ companyId: initialCompanyId, isPrimary: true }]
            : [],
        }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (contact) setForm(contactToForm(contact));
  }, [contact]);

  const { user } = useAuth();
  useEffect(() => {
    if (!user || isNew || !contact || !id) return;
    const path = `/crm/people/${id}`;
    if (!shouldLogView(user.uid, path)) return;
    void logView({
      userId: user.uid,
      toolId: 'crm',
      routePath: path,
      routeLabel: 'CRM Person detail',
      resourceType: 'contact',
      resourceId: id,
      resourceLabel: `${contact.firstName} ${contact.lastName}`.trim() || '(unnamed)',
    });
  }, [user, isNew, contact, id]);

  const companyById = useMemo(() => {
    const m = new Map<string, string>();
    companies.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [companies]);

  const canSave = useMemo(
    () =>
      form.firstName.trim().length > 0 &&
      form.lastName.trim().length > 0 &&
      form.affiliations.length > 0,
    [form.firstName, form.lastName, form.affiliations],
  );

  if (!isNew && loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
        </div>
      </Layout>
    );
  }

  if (!isNew && !contact) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-[#7A756E]">Person not found.</p>
          <button
            onClick={() => navigate('/crm')}
            className="mt-4 text-sm font-medium text-[#ED202B] hover:underline"
          >
            Back to CRM
          </button>
        </div>
      </Layout>
    );
  }

  async function handleSave() {
    setError(null);
    if (!canSave) {
      setError('First name, last name, and at least one customer are required.');
      return;
    }
    setSaving(true);
    try {
      const affiliations = reconcilePrimary(
        form.affiliations.map((a) => ({
          companyId: a.companyId,
          title: a.title?.trim() || undefined,
          isPrimary: a.isPrimary,
        })),
      );
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        affiliations,
        email: form.email.trim(),
        phone: form.phone.trim(),
        note: form.note.trim(),
      };
      if (isNew) {
        const newId = await createContact(payload);
        setEditing(false);
        navigate(`/crm/people/${newId}`, { replace: true });
      } else if (id) {
        await updateContact(id, payload);
        setEditing(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save person');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (isNew) {
      const back = searchParams.get('companyId');
      navigate(back ? `/crm/companies/${back}` : '/crm');
      return;
    }
    if (contact) setForm(contactToForm(contact));
    setError(null);
    setEditing(false);
  }

  /** Merge THIS contact into the picked target: append our affiliations to
   *  the target (dedupe by companyId, target wins on conflict), save target,
   *  delete self, navigate to target. Irreversible — confirm first. */
  async function handleMergeInto(targetId: string | null) {
    if (!targetId || !id || !contact) return;
    const target = allContacts.find((c) => c.id === targetId);
    if (!target) {
      setMergeError('Target person not found.');
      return;
    }
    const targetName = `${target.firstName} ${target.lastName}`.trim();
    const ok = window.confirm(
      `Merge "${contact.firstName} ${contact.lastName}" into "${targetName}"? ` +
        `All ${contact.affiliations.length} customer link(s) will be moved to ${targetName}, ` +
        `and this person record will be deleted. This cannot be undone.`,
    );
    if (!ok) return;
    setMergeError(null);
    setSaving(true);
    try {
      const existingCompanyIds = new Set(target.affiliations.map((a) => a.companyId));
      const additions = contact.affiliations.filter((a) => !existingCompanyIds.has(a.companyId));
      // Strip any `isPrimary` on the additions — target keeps its own primary.
      const merged = [
        ...target.affiliations,
        ...additions.map((a) => ({ companyId: a.companyId, title: a.title, isPrimary: false })),
      ];
      await updateContact(targetId, { affiliations: merged });
      await removeContact(id);
      navigate(`/crm/people/${targetId}`, { replace: true });
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Failed to merge.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id || isNew) return;
    const ok = window.confirm(
      `Delete "${contact?.firstName} ${contact?.lastName}"? This is permanent.`,
    );
    if (!ok) return;
    setSaving(true);
    try {
      await removeContact(id);
      const primary = contact ? primaryAffiliation(contact) : undefined;
      navigate(primary ? `/crm/companies/${primary.companyId}` : '/crm', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete person');
      setSaving(false);
    }
  }

  const fullName = contact ? `${contact.firstName} ${contact.lastName}` : '';
  const primary = contact ? primaryAffiliation(contact) : undefined;
  const primaryCompanyName = primary ? (companyById.get(primary.companyId) ?? 'Unknown customer') : '';

  return (
    <Layout>
      <main className="py-2">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h2 className="font-heading text-2xl font-semibold text-[#201F1E] truncate">
              {isNew ? 'New Person' : fullName}
            </h2>
            {!editing && !isNew && primary && (
              <p className="text-sm text-[#7A756E] mt-0.5">
                <button
                  onClick={() => navigate(`/crm/companies/${primary.companyId}`)}
                  className="hover:text-[#ED202B] transition"
                >
                  {primaryCompanyName}
                </button>
                {primary.title && <span> · {primary.title}</span>}
                {contact && contact.affiliations.length > 1 && (
                  <span> · +{contact.affiliations.length - 1} more</span>
                )}
              </p>
            )}
          </div>
          {!editing && !isNew && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setMergeError(null);
                  setMerging(true);
                }}
                className="text-sm font-medium text-[#7A756E] hover:text-[#ED202B] hover:underline transition"
                title="Combine this person with a duplicate record"
              >
                Merge…
              </button>
              <button
                onClick={() => setEditing(true)}
                className="text-sm font-medium bg-[#ED202B] text-white px-3 py-1.5 rounded-lg hover:bg-[#9B0E18] transition"
              >
                Edit
              </button>
            </div>
          )}
        </div>

        <section className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
          <h3 className="font-heading font-semibold text-[#201F1E] mb-4">Info</h3>

          {editing ? (
            <EditForm form={form} setForm={setForm} companyById={companyById} />
          ) : (
            <InfoView contact={contact!} companyById={companyById} />
          )}

          {error && (
            <div className="mt-4 text-sm text-[#ED202B] bg-[#ED202B]/5 border border-[#ED202B]/30 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {editing && (
            <div className="mt-5 flex flex-wrap items-center gap-2 justify-end">
              {!isNew && (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="mr-auto text-sm font-medium text-[#ED202B] hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              )}
              <button
                onClick={handleCancel}
                disabled={saving}
                className="text-sm font-medium text-[#7A756E] hover:text-[#201F1E] px-3 py-2 rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                className="text-sm font-medium bg-[#ED202B] text-white px-4 py-2 rounded-lg hover:bg-[#9B0E18] transition disabled:opacity-50"
              >
                {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
              </button>
            </div>
          )}
        </section>

        {merging && id && contact && (
          <MergeModal
            selfName={`${contact.firstName} ${contact.lastName}`.trim()}
            selfId={id}
            error={mergeError}
            onPick={handleMergeInto}
            onClose={() => setMerging(false)}
          />
        )}
      </main>
    </Layout>
  );
}

function MergeModal({
  selfName,
  selfId,
  error,
  onPick,
  onClose,
}: {
  selfName: string;
  selfId: string;
  error: string | null;
  onPick: (targetId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-[#D8D5D0] max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-heading font-semibold text-[#201F1E]">Merge this person</h3>
            <p className="text-xs text-[#7A756E] mt-0.5">
              Move all of {selfName || 'this person'}'s customer links into another person record,
              then delete this one.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#7A756E] hover:text-[#ED202B]"
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <label className="block text-xs font-medium text-[#7A756E] mb-1">Merge into…</label>
        <ContactPicker
          value={null}
          onChange={onPick}
          placeholder="Pick the record to keep"
          excludeIds={[selfId]}
        />

        {error && (
          <p className="text-xs text-[#ED202B] mt-2" role="alert">
            {error}
          </p>
        )}

        <p className="text-[11px] text-[#7A756E]/80 mt-3">
          You'll be asked to confirm before the merge runs.
        </p>
      </div>
    </div>
  );
}

function InfoView({
  contact,
  companyById,
}: {
  contact: Contact;
  companyById: Map<string, string>;
}) {
  const rows: Array<[string, React.ReactNode]> = [
    ['Name', `${contact.firstName} ${contact.lastName}`],
    [
      'Customers',
      contact.affiliations.length === 0 ? (
        <span className="text-[#7A756E]">—</span>
      ) : (
        <ul className="space-y-1">
          {contact.affiliations.map((a) => (
            <li key={a.companyId} className="flex flex-wrap items-baseline gap-2">
              <Link
                to={`/crm/companies/${a.companyId}`}
                className="font-medium text-[#ED202B] hover:underline"
              >
                {companyById.get(a.companyId) ?? 'Unknown customer'}
              </Link>
              {a.title && <span className="text-xs text-[#7A756E]">{a.title}</span>}
              {a.isPrimary && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-[#ED202B]/10 text-[10px] font-semibold uppercase tracking-wide text-[#ED202B]">
                  Primary
                </span>
              )}
            </li>
          ))}
        </ul>
      ),
    ],
    [
      'Email',
      contact.email ? (
        <a href={`mailto:${contact.email}`} className="text-[#ED202B] hover:underline">
          {contact.email}
        </a>
      ) : (
        <span className="text-[#7A756E]">—</span>
      ),
    ],
    [
      'Phone',
      contact.phone ? (
        <a href={`tel:${contact.phone}`} className="text-[#ED202B] hover:underline">
          {contact.phone}
        </a>
      ) : (
        <span className="text-[#7A756E]">—</span>
      ),
    ],
    ['Note', contact.note || <span className="text-[#7A756E]">—</span>],
  ];
  return (
    <dl className="divide-y divide-[#D8D5D0]">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="py-2.5 flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-4"
        >
          <dt className="text-xs sm:text-sm text-[#7A756E] sm:w-28 shrink-0 sm:pt-0.5">{label}</dt>
          <dd className="text-sm text-[#201F1E] break-words min-w-0 flex-1">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EditForm({
  form,
  setForm,
  companyById,
}: {
  form: FormState;
  setForm: (updater: (prev: FormState) => FormState) => void;
  companyById: Map<string, string>;
}) {
  const input =
    'w-full px-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 transition';
  const label = 'block text-xs font-medium text-[#7A756E] mb-1';

  function addAffiliation(companyId: string | null) {
    if (!companyId) return;
    setForm((p) => {
      if (p.affiliations.some((a) => a.companyId === companyId)) return p;
      const next = [...p.affiliations, { companyId, title: '' }];
      return { ...p, affiliations: reconcilePrimary(next) };
    });
  }

  function removeAffiliation(companyId: string) {
    setForm((p) => {
      const next = p.affiliations.filter((a) => a.companyId !== companyId);
      return { ...p, affiliations: reconcilePrimary(next) };
    });
  }

  function setAffiliationTitle(companyId: string, title: string) {
    setForm((p) => ({
      ...p,
      affiliations: p.affiliations.map((a) =>
        a.companyId === companyId ? { ...a, title } : a,
      ),
    }));
  }

  function markPrimary(companyId: string) {
    setForm((p) => ({
      ...p,
      affiliations: p.affiliations.map((a) => ({ ...a, isPrimary: a.companyId === companyId })),
    }));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label}>First name *</label>
          <input
            className={input}
            value={form.firstName}
            onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
            autoFocus
          />
        </div>
        <div>
          <label className={label}>Last name *</label>
          <input
            className={input}
            value={form.lastName}
            onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
          />
        </div>
      </div>

      {/* Affiliations — one row per customer, with per-row title + primary toggle */}
      <div>
        <label className={label}>Customers *</label>
        <ul className="space-y-2 mb-2">
          {form.affiliations.map((a) => (
            <li
              key={a.companyId}
              className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 rounded-lg border border-[#D8D5D0] bg-stone-50/60"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => markPrimary(a.companyId)}
                  className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide transition ${
                    a.isPrimary
                      ? 'bg-[#ED202B] text-white'
                      : 'bg-white border border-[#D8D5D0] text-[#7A756E] hover:border-[#ED202B] hover:text-[#ED202B]'
                  }`}
                  title={a.isPrimary ? 'Primary customer' : 'Mark as primary'}
                >
                  {a.isPrimary ? 'Primary' : 'Make primary'}
                </button>
                <span className="text-sm font-medium text-[#201F1E] truncate">
                  {companyById.get(a.companyId) ?? '(missing customer)'}
                </span>
              </div>
              <input
                type="text"
                placeholder="Title at this customer"
                value={a.title ?? ''}
                onChange={(e) => setAffiliationTitle(a.companyId, e.target.value)}
                className="flex-1 sm:flex-none sm:w-56 px-2 py-1 text-xs bg-white border border-[#D8D5D0] rounded-md focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
              />
              <button
                type="button"
                onClick={() => removeAffiliation(a.companyId)}
                className="shrink-0 text-xs text-[#7A756E] hover:text-[#ED202B] px-1"
                aria-label="Remove customer"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
        <CompanyPicker
          value={null}
          onChange={addAffiliation}
          placeholder={
            form.affiliations.length === 0 ? 'Add a customer' : '+ Add another customer'
          }
        />
      </div>

      <div>
        <label className={label}>Email</label>
        <input
          className={input}
          value={form.email}
          onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          placeholder="jimmy@acmecorp.com"
          type="email"
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>
      <div>
        <label className={label}>Phone</label>
        <input
          className={input}
          value={form.phone}
          onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          placeholder="(555) 555-1234"
          type="tel"
          inputMode="tel"
        />
      </div>
      <div>
        <label className={label}>Note</label>
        <textarea
          className={`${input} resize-y min-h-[80px]`}
          value={form.note}
          onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
          rows={3}
        />
      </div>
    </div>
  );
}
