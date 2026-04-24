import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { useContact, useContacts } from '../hooks/useContacts';
import { useCompanies } from '../hooks/useCompanies';
import type { Contact } from '../types';

type FormState = {
  firstName: string;
  lastName: string;
  companyId: string;
  title: string;
  email: string;
  phone: string;
  note: string;
};

const EMPTY_FORM: FormState = {
  firstName: '',
  lastName: '',
  companyId: '',
  title: '',
  email: '',
  phone: '',
  note: '',
};

function contactToForm(c: Contact): FormState {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    companyId: c.companyId,
    title: c.title ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    note: c.note ?? '',
  };
}

export default function ContactDetailTool() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const { contact, loading } = useContact(isNew ? undefined : id);
  const { companies } = useCompanies();
  const { createContact, updateContact, removeContact } = useContacts();

  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<FormState>(() =>
    isNew ? { ...EMPTY_FORM, companyId: searchParams.get('companyId') ?? '' } : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (contact) setForm(contactToForm(contact));
  }, [contact]);

  const companyById = useMemo(() => {
    const m = new Map<string, string>();
    companies.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [companies]);

  const canSave = useMemo(
    () =>
      form.firstName.trim().length > 0 &&
      form.lastName.trim().length > 0 &&
      form.companyId.length > 0,
    [form.firstName, form.lastName, form.companyId],
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
      setError('First name, last name, and company are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        companyId: form.companyId,
        title: form.title.trim(),
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

  async function handleDelete() {
    if (!id || isNew) return;
    const ok = window.confirm(
      `Delete "${contact?.firstName} ${contact?.lastName}"? This is permanent.`,
    );
    if (!ok) return;
    setSaving(true);
    try {
      await removeContact(id);
      navigate(contact ? `/crm/companies/${contact.companyId}` : '/crm', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete person');
      setSaving(false);
    }
  }

  const fullName = contact ? `${contact.firstName} ${contact.lastName}` : '';
  const companyName = contact ? companyById.get(contact.companyId) ?? 'Unknown company' : '';

  return (
    <Layout>
      <main className="py-2">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h2 className="font-heading text-2xl font-semibold text-[#201F1E] truncate">
              {isNew ? 'New Person' : fullName}
            </h2>
            {!editing && !isNew && (
              <p className="text-sm text-[#7A756E] mt-0.5">
                <button
                  onClick={() => navigate(`/crm/companies/${contact?.companyId}`)}
                  className="hover:text-[#ED202B] transition"
                >
                  {companyName}
                </button>
                {contact?.title && <span> · {contact.title}</span>}
              </p>
            )}
          </div>
          {!editing && !isNew && (
            <button
              onClick={() => setEditing(true)}
              className="shrink-0 text-sm font-medium text-[#ED202B] border border-[#ED202B] px-3 py-1.5 rounded-lg hover:bg-[#ED202B]/5 transition"
            >
              Edit
            </button>
          )}
        </div>

        <section className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
          <h3 className="font-heading font-semibold text-[#201F1E] mb-4">Info</h3>

          {editing ? (
            <EditForm form={form} setForm={setForm} companies={companies} />
          ) : (
            <InfoView contact={contact!} companyName={companyName} />
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
      </main>
    </Layout>
  );
}

function InfoView({ contact, companyName }: { contact: Contact; companyName: string }) {
  const rows: Array<[string, React.ReactNode]> = [
    ['Name', `${contact.firstName} ${contact.lastName}`],
    [
      'Company',
      contact.companyId ? (
        <Link to={`/crm/companies/${contact.companyId}`} className="text-[#ED202B] hover:underline">
          {companyName}
        </Link>
      ) : (
        companyName
      ),
    ],
    ['Title', contact.title || <span className="text-[#7A756E]">—</span>],
    ['Email', contact.email ? <a href={`mailto:${contact.email}`} className="text-[#ED202B] hover:underline">{contact.email}</a> : <span className="text-[#7A756E]">—</span>],
    ['Phone', contact.phone ? <a href={`tel:${contact.phone}`} className="text-[#ED202B] hover:underline">{contact.phone}</a> : <span className="text-[#7A756E]">—</span>],
    ['Note', contact.note || <span className="text-[#7A756E]">—</span>],
  ];
  return (
    <dl className="divide-y divide-[#D8D5D0]">
      {rows.map(([label, value]) => (
        <div key={label} className="py-2.5 flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-4">
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
  companies,
}: {
  form: FormState;
  setForm: (updater: (prev: FormState) => FormState) => void;
  companies: { id: string; name: string }[];
}) {
  const input = 'w-full px-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 transition';
  const label = 'block text-xs font-medium text-[#7A756E] mb-1';

  return (
    <div className="space-y-3">
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
      <div>
        <label className={label}>Company *</label>
        <select
          className={input}
          value={form.companyId}
          onChange={(e) => setForm((p) => ({ ...p, companyId: e.target.value }))}
        >
          <option value="">Select a company…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label}>Title</label>
        <input
          className={input}
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          placeholder="Head of Energy"
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
