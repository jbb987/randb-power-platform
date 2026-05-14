import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import TagChip from '../components/crm-directory/TagChip';
import DocumentsSection from '../components/crm-directory/DocumentsSection';
import ContactPicker from '../components/crm-directory/ContactPicker';
import JobStatusBadge from '../components/construction/JobStatusBadge';
import { useCompany, useCompanies } from '../hooks/useCompanies';
import { useContactsByCompany, useContacts } from '../hooks/useContacts';
import { useSiteRegistry } from '../hooks/useSiteRegistry';
import { useConstructionJobsByCompany, type JobWithOrigin } from '../hooks/useConstructionJobs';
import { CONSTRUCTION_PROJECTS_CONFIG } from '../lib/jobToolConfig';
import { useAuth } from '../hooks/useAuth';
import { logView } from '../lib/userHistory';
import { shouldLogView } from '../lib/routeToolMap';
import {
  ALL_COMPANY_TAGS,
  LICENSE_STATES,
  LICENSE_STATE_LABELS,
  type Company,
  type CompanyTag,
  type ConstructionJob,
  type LicenseState,
  type SiteRegistryEntry,
} from '../types';

type LicenseForm = Record<LicenseState, string>;

type FormState = {
  name: string;
  location: string;
  website: string;
  ein: string;
  tags: CompanyTag[];
  note: string;
  licenses: LicenseForm;
};

function emptyLicenses(): LicenseForm {
  return LICENSE_STATES.reduce((acc, s) => {
    acc[s] = '';
    return acc;
  }, {} as LicenseForm);
}

const EMPTY_FORM: FormState = {
  name: '',
  location: '',
  website: '',
  ein: '',
  tags: [],
  note: '',
  licenses: emptyLicenses(),
};

function companyToForm(c: Company): FormState {
  const licenses = emptyLicenses();
  if (c.licenses) {
    for (const s of LICENSE_STATES) {
      licenses[s] = c.licenses[s] ?? '';
    }
  }
  return {
    name: c.name,
    location: c.location,
    website: c.website ?? '',
    ein: c.ein ?? '',
    tags: c.tags,
    note: c.note ?? '',
    licenses,
  };
}

export default function CompanyDetailTool() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const { company, loading } = useCompany(isNew ? undefined : id);
  const { createCompany, updateCompany, removeCompany } = useCompanies();
  const { contacts } = useContactsByCompany(isNew ? undefined : id);
  const { contacts: allContacts, updateContact } = useContacts();
  const [addingPerson, setAddingPerson] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function handleAttachExistingPerson(personId: string | null) {
    if (!personId || !id) return;
    const person = allContacts.find((c) => c.id === personId);
    if (!person) return;
    if (person.affiliations.some((a) => a.companyId === id)) {
      setAddError('That person is already linked to this customer.');
      return;
    }
    try {
      await updateContact(personId, {
        affiliations: [...person.affiliations, { companyId: id, isPrimary: false }],
      });
      setAddingPerson(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to attach person.');
    }
  }
  const { sites: allSites } = useSiteRegistry();
  const linkedSites = useMemo(
    () => (isNew || !id ? [] : allSites.filter((s) => s.companyId === id)),
    [allSites, id, isNew],
  );
  const { jobs: linkedJobs } = useConstructionJobsByCompany(isNew ? undefined : id);

  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (company) setForm(companyToForm(company));
  }, [company]);

  const { user } = useAuth();
  useEffect(() => {
    if (!user || isNew || !company || !id) return;
    const path = `/crm/companies/${id}`;
    if (!shouldLogView(user.uid, path)) return;
    void logView({
      userId: user.uid,
      toolId: 'crm',
      routePath: path,
      routeLabel: 'CRM Customer detail',
      resourceType: 'company',
      resourceId: id,
      resourceLabel: company.name,
    });
  }, [user, isNew, company, id]);

  const canSave = useMemo(
    () => form.name.trim().length > 0 && form.location.trim().length > 0,
    [form.name, form.location],
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

  if (!isNew && !company) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-[#7A756E]">Customer not found.</p>
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
      setError('Name and location are required.');
      return;
    }
    setSaving(true);
    try {
      const trimmedLicenses: Partial<Record<LicenseState, string>> = {};
      for (const s of LICENSE_STATES) {
        const v = form.licenses[s].trim();
        if (v) trimmedLicenses[s] = v;
      }
      const payload = {
        name: form.name.trim(),
        location: form.location.trim(),
        website: form.website.trim(),
        ein: form.ein.trim(),
        tags: form.tags,
        note: form.note.trim(),
        licenses: trimmedLicenses,
      };
      if (isNew) {
        const newId = await createCompany(payload);
        setEditing(false);
        navigate(`/crm/companies/${newId}`, { replace: true });
      } else if (id) {
        await updateCompany(id, payload);
        setEditing(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (isNew) {
      navigate('/crm');
      return;
    }
    if (company) setForm(companyToForm(company));
    setError(null);
    setEditing(false);
  }

  async function handleDelete() {
    if (!id || isNew) return;
    const ok = window.confirm(
      `Delete "${company?.name}"? This permanently removes the customer and all its contacts.`,
    );
    if (!ok) return;
    setSaving(true);
    try {
      await removeCompany(id);
      navigate('/crm', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete customer');
      setSaving(false);
    }
  }

  function toggleTag(tag: CompanyTag) {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }));
  }

  return (
    <Layout>
      <main className="py-2">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h2 className="font-heading text-2xl font-semibold text-[#201F1E] truncate">
              {isNew ? 'New Customer' : company?.name}
            </h2>
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

        {!editing && company?.tags && company.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {company.tags.map((t) => (
              <TagChip key={t} tag={t} />
            ))}
          </div>
        )}

        <section className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5 mb-5">
          <h3 className="font-heading font-semibold text-[#201F1E] mb-4">Info</h3>

          {editing ? (
            <EditForm form={form} setForm={setForm} toggleTag={toggleTag} />
          ) : (
            <>
              <InfoView company={company!} />
              <LicensesPanel licenses={company?.licenses} />
            </>
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

        {!isNew && !editing && (
          <section className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-semibold text-[#201F1E]">
                People{' '}
                {contacts.length > 0 && (
                  <span className="text-[#7A756E] font-normal">· {contacts.length}</span>
                )}
              </h3>
              <button
                onClick={() => {
                  setAddError(null);
                  setAddingPerson(true);
                }}
                className="text-sm font-medium text-[#ED202B] hover:underline"
              >
                + Add person
              </button>
            </div>
            {contacts.length === 0 ? (
              <p className="text-sm text-[#7A756E]">No people yet for this customer.</p>
            ) : (
              <ul className="divide-y divide-[#D8D5D0]">
                {contacts.map((c) => {
                  // Title for this specific customer (a person may hold a
                  // different title at each customer they're affiliated with).
                  const titleHere = c.affiliations.find((a) => a.companyId === id)?.title;
                  return (
                  <li key={c.id}>
                    <button
                      onClick={() => navigate(`/crm/people/${c.id}`)}
                      className="group w-full text-left py-3 px-2 -mx-2 rounded-lg flex items-center justify-between gap-3 hover:bg-stone-50 hover:text-[#ED202B] transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-[#201F1E] truncate group-hover:text-[#ED202B] transition-colors">
                          {c.firstName} {c.lastName}
                        </div>
                        {(c.email || c.phone) && (
                          <div className="text-xs text-[#7A756E] mt-0.5 truncate">
                            {c.email}
                            {c.email && c.phone ? ' · ' : ''}
                            {c.phone}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {titleHere && <div className="text-xs text-[#7A756E]">{titleHere}</div>}
                        <svg
                          className="h-4 w-4 text-[#7A756E] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-[#ED202B] transition-all"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {addingPerson && id && (
          <AddPersonModal
            companyId={id}
            companyName={company?.name ?? 'this customer'}
            existingPersonIds={contacts.map((c) => c.id)}
            error={addError}
            onPick={handleAttachExistingPerson}
            onCreateNew={() => {
              setAddingPerson(false);
              navigate(`/crm/people/new?companyId=${id}`);
            }}
            onClose={() => setAddingPerson(false)}
          />
        )}

        {!isNew && !editing && id && (
          <div className="mt-5">
            <SitesSection sites={linkedSites} companyId={id} />
          </div>
        )}

        {!isNew && !editing && id && (
          <div className="mt-5">
            <ConstructionJobsSection jobs={linkedJobs} companyId={id} />
          </div>
        )}

        {!isNew && !editing && id && (
          <div className="mt-5">
            <DocumentsSection companyId={id} defaultCategory="legal" />
          </div>
        )}
      </main>
    </Layout>
  );
}

function SitesSection({ sites, companyId }: { sites: SiteRegistryEntry[]; companyId: string }) {
  const navigate = useNavigate();

  function formatCoords(site: SiteRegistryEntry): string {
    return site.coordinates
      ? `${site.coordinates.lat.toFixed(5)}, ${site.coordinates.lng.toFixed(5)}`
      : '';
  }

  function formatLastAnalyzed(ts?: number | null): string | null {
    if (!ts) return null;
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <section className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-heading font-semibold text-[#201F1E]">
          Sites{' '}
          {sites.length > 0 && <span className="text-[#7A756E] font-normal">· {sites.length}</span>}
        </h3>
        <button
          onClick={() => navigate(`/site-analyzer/new?companyId=${companyId}`)}
          className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-[#ED202B] border border-[#ED202B] px-3 py-1.5 rounded-lg hover:bg-[#ED202B]/5 transition"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">New site analysis</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>
      {sites.length === 0 ? (
        <p className="text-sm text-[#7A756E]">
          No sites linked yet. Click <span className="font-medium">New site analysis</span> to add
          one.
        </p>
      ) : (
        <ul className="divide-y divide-[#D8D5D0]">
          {sites.map((s) => {
            const last = formatLastAnalyzed(s.piddrGeneratedAt);
            return (
              <li key={s.id}>
                <button
                  onClick={() => navigate(`/site-analyzer/${s.id}`)}
                  className="group w-full text-left py-3 px-2 -mx-2 rounded-lg flex items-center justify-between gap-3 hover:bg-stone-50 hover:text-[#ED202B] transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[#201F1E] truncate group-hover:text-[#ED202B] transition-colors">
                      {s.name || formatCoords(s)}
                    </div>
                    <div className="text-xs text-[#7A756E] mt-0.5 truncate">
                      {s.name ? formatCoords(s) : null}
                      {s.acreage > 0
                        ? `${s.name ? ' · ' : ''}${s.acreage.toLocaleString()} ac`
                        : ''}
                      {s.mwCapacity > 0 ? ` · ${s.mwCapacity} MW` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {last && <div className="text-xs text-[#7A756E]">Analyzed · {last}</div>}
                    <svg
                      className="h-4 w-4 text-[#7A756E] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-[#ED202B] transition-all"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function InfoView({ company }: { company: Company }) {
  const rows: Array<[string, React.ReactNode]> = [
    ['Name', company.name],
    ['Location', company.location],
    [
      'Website',
      company.website ? (
        <a
          href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
          target="_blank"
          rel="noreferrer"
          className="text-[#ED202B] hover:underline"
        >
          {company.website}
        </a>
      ) : (
        <span className="text-[#7A756E]">—</span>
      ),
    ],
    ['EIN', company.ein || <span className="text-[#7A756E]">—</span>],
    ['Note', company.note || <span className="text-[#7A756E]">—</span>],
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

function LicensesPanel({ licenses }: { licenses?: Partial<Record<LicenseState, string>> }) {
  const [open, setOpen] = useState(false);
  const filledCount = LICENSE_STATES.filter((s) => (licenses?.[s] ?? '').trim().length > 0).length;

  return (
    <div className="mt-3 pt-3 border-t border-[#D8D5D0]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left py-1"
      >
        <span className="text-sm font-medium text-[#201F1E]">
          License Numbers{' '}
          <span className="text-[#7A756E] font-normal">
            · {filledCount} of {LICENSE_STATES.length}
          </span>
        </span>
        <svg
          className={`h-4 w-4 text-[#7A756E] transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <dl className="mt-2 divide-y divide-[#D8D5D0]">
          {LICENSE_STATES.map((s) => {
            const value = (licenses?.[s] ?? '').trim();
            return (
              <div
                key={s}
                className="py-2.5 flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-4"
              >
                <dt className="text-xs sm:text-sm text-[#7A756E] sm:w-28 shrink-0 sm:pt-0.5">
                  {LICENSE_STATE_LABELS[s]} ({s})
                </dt>
                <dd className="text-sm text-[#201F1E] break-words min-w-0 flex-1 font-mono">
                  {value || <span className="text-[#7A756E] font-sans">—</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

function EditForm({
  form,
  setForm,
  toggleTag,
}: {
  form: FormState;
  setForm: (updater: (prev: FormState) => FormState) => void;
  toggleTag: (t: CompanyTag) => void;
}) {
  const input =
    'w-full px-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 transition';
  const label = 'block text-xs font-medium text-[#7A756E] mb-1';

  return (
    <div className="space-y-3">
      <div>
        <label className={label}>Name *</label>
        <input
          className={input}
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="Acme Corp"
          autoFocus
        />
      </div>
      <div>
        <label className={label}>Location *</label>
        <input
          className={input}
          value={form.location}
          onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
          placeholder="Houston, TX"
        />
      </div>
      <div>
        <label className={label}>Website</label>
        <input
          className={input}
          value={form.website}
          onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
          placeholder="acmecorp.com"
          type="url"
          inputMode="url"
        />
      </div>
      <div>
        <label className={label}>EIN</label>
        <input
          className={input}
          value={form.ein}
          onChange={(e) => setForm((p) => ({ ...p, ein: e.target.value }))}
          placeholder="12-3456789"
        />
      </div>
      <div>
        <label className={label}>Tags</label>
        <div className="flex flex-wrap gap-2">
          {ALL_COMPANY_TAGS.map((t) => {
            const on = form.tags.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition ${
                  on
                    ? 'bg-[#ED202B] text-white border-[#ED202B]'
                    : 'bg-white text-[#7A756E] border-[#D8D5D0] hover:border-[#ED202B]/50'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className={label}>Note</label>
        <textarea
          className={`${input} resize-y min-h-[80px]`}
          value={form.note}
          onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
          placeholder="Anything worth remembering…"
          rows={3}
        />
      </div>
      <div className="pt-2">
        <label className={label}>License Numbers</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {LICENSE_STATES.map((s) => (
            <div key={s} className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#7A756E] w-20 shrink-0">
                {LICENSE_STATE_LABELS[s]} ({s})
              </span>
              <input
                className={input}
                value={form.licenses[s]}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    licenses: { ...p.licenses, [s]: e.target.value },
                  }))
                }
                placeholder="License #"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConstructionJobsSection({
  jobs,
  companyId,
}: {
  jobs: JobWithOrigin[];
  companyId: string;
}) {
  const navigate = useNavigate();

  function roleForCompany(job: ConstructionJob): string {
    if (job.companyIds.includes(companyId)) return 'Owner / GC';
    if (job.subcontractorIds.includes(companyId)) return 'Subcontractor';
    return '';
  }

  function formatDate(ts?: number): string | null {
    if (!ts) return null;
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <section className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-heading font-semibold text-[#201F1E]">
          Construction Projects{' '}
          {jobs.length > 0 && <span className="text-[#7A756E] font-normal">· {jobs.length}</span>}
        </h3>
        <button
          onClick={() =>
            navigate(`${CONSTRUCTION_PROJECTS_CONFIG.routeBase}/new?companyId=${companyId}`)
          }
          className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-[#ED202B] border border-[#ED202B] px-3 py-1.5 rounded-lg hover:bg-[#ED202B]/5 transition"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">New project</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>
      {jobs.length === 0 ? (
        <p className="text-sm text-[#7A756E]">
          No construction projects linked yet. Click <span className="font-medium">New project</span>{' '}
          to add one.
        </p>
      ) : (
        <ul className="divide-y divide-[#D8D5D0]">
          {jobs.map(({ job: j, routeBase, toolLabel }) => {
            const start = formatDate(j.startDate);
            const end = formatDate(j.expectedEndDate);
            return (
              <li key={`${routeBase}-${j.id}`}>
                <button
                  onClick={() => navigate(`${routeBase}/${j.id}`)}
                  className="group w-full text-left py-3 px-2 -mx-2 rounded-lg flex items-center justify-between gap-3 hover:bg-stone-50 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[#201F1E] truncate group-hover:text-[#ED202B] transition-colors">
                        {j.name}
                      </span>
                      <JobStatusBadge status={j.status} />
                    </div>
                    <div className="text-xs text-[#7A756E] mt-0.5 truncate">
                      <span className="font-medium text-[#7A756E]">{toolLabel}</span>
                      {roleForCompany(j) && (
                        <>
                          {' · '}
                          {roleForCompany(j)}
                        </>
                      )}
                      {(start || end) && (
                        <>
                          {' · '}
                          {start}
                          {start && end && ' → '}
                          {end}
                        </>
                      )}
                    </div>
                  </div>
                  <svg
                    className="h-4 w-4 text-[#7A756E] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-[#ED202B] transition-all shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AddPersonModal({
  companyName,
  existingPersonIds,
  error,
  onPick,
  onCreateNew,
  onClose,
}: {
  companyId: string;
  companyName: string;
  existingPersonIds: string[];
  error: string | null;
  onPick: (personId: string | null) => void;
  onCreateNew: () => void;
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
            <h3 className="font-heading font-semibold text-[#201F1E]">Add person</h3>
            <p className="text-xs text-[#7A756E] mt-0.5">to {companyName}</p>
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

        <label className="block text-xs font-medium text-[#7A756E] mb-1">
          Link an existing person
        </label>
        <ContactPicker
          value={null}
          onChange={onPick}
          placeholder="Search people…"
          excludeIds={existingPersonIds}
        />

        {error && (
          <p className="text-xs text-[#ED202B] mt-2" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 my-4">
          <div className="flex-1 h-px bg-[#D8D5D0]" />
          <span className="text-xs text-[#7A756E] uppercase tracking-wide">or</span>
          <div className="flex-1 h-px bg-[#D8D5D0]" />
        </div>

        <button
          type="button"
          onClick={onCreateNew}
          className="w-full text-sm font-medium bg-white text-[#ED202B] border border-[#ED202B] px-3 py-2 rounded-lg hover:bg-[#ED202B]/5 transition"
        >
          Create new person
        </button>
      </div>
    </div>
  );
}
