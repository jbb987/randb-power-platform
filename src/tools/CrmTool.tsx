import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import TagChip from '../components/crm-directory/TagChip';
import { useCompanies } from '../hooks/useCompanies';
import { useContacts } from '../hooks/useContacts';
import type { Company, Contact } from '../types';

type View = 'companies' | 'people';

export default function CrmTool() {
  const navigate = useNavigate();
  const { companies, loading: companiesLoading } = useCompanies();
  const { contacts, loading: contactsLoading } = useContacts();
  const [view, setView] = useState<View>('companies');
  const [search, setSearch] = useState('');

  const loading = companiesLoading || contactsLoading;

  const companyById = useMemo(() => {
    const m = new Map<string, Company>();
    companies.forEach((c) => m.set(c.id, c));
    return m;
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.location.toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [companies, search]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
      const company = companyById.get(c.companyId)?.name.toLowerCase() ?? '';
      return (
        fullName.includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.title ?? '').toLowerCase().includes(q) ||
        company.includes(q)
      );
    });
  }, [contacts, companyById, search]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <main className="py-2">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-heading text-2xl font-semibold text-[#201F1E]">Directory</h2>
            <p className="text-sm text-[#7A756E] mt-0.5">
              {view === 'companies' ? `${companies.length} companies` : `${contacts.length} people`}
            </p>
          </div>
          <button
            onClick={() => navigate(view === 'companies' ? '/crm/companies/new' : '/crm/people/new')}
            className="inline-flex items-center gap-1.5 bg-[#ED202B] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#9B0E18] transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Add {view === 'companies' ? 'Company' : 'Person'}</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>

        <SegmentedToggle view={view} onChange={setView} />

        <SearchInput value={search} onChange={setSearch} placeholder={view === 'companies' ? 'Search companies…' : 'Search people…'} />

        {view === 'companies' ? (
          <CompanyList companies={filteredCompanies} totalCount={companies.length} />
        ) : (
          <ContactList contacts={filteredContacts} companyById={companyById} totalCount={contacts.length} />
        )}
      </main>
    </Layout>
  );
}

function SegmentedToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="inline-flex bg-white border border-[#D8D5D0] rounded-lg p-1 mb-4 w-full sm:w-auto">
      <button
        onClick={() => onChange('companies')}
        className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition ${
          view === 'companies' ? 'bg-[#ED202B] text-white' : 'text-[#7A756E] hover:text-[#201F1E]'
        }`}
      >
        Companies
      </button>
      <button
        onClick={() => onChange('people')}
        className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition ${
          view === 'people' ? 'bg-[#ED202B] text-white' : 'text-[#7A756E] hover:text-[#201F1E]'
        }`}
      >
        People
      </button>
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative mb-4">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A756E] pointer-events-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 transition"
      />
    </div>
  );
}

function CompanyList({ companies, totalCount }: { companies: Company[]; totalCount: number }) {
  const navigate = useNavigate();

  if (totalCount === 0) {
    return (
      <EmptyState
        title="No companies yet"
        description="Add your first company to start building your CRM."
      />
    );
  }
  if (companies.length === 0) {
    return <NoMatchesState label="companies" />;
  }

  return (
    <ul className="space-y-2">
      {companies.map((c) => (
        <li key={c.id}>
          <button
            onClick={() => navigate(`/crm/companies/${c.id}`)}
            className="w-full text-left bg-white rounded-xl border border-[#D8D5D0] shadow-sm hover:shadow-md hover:border-[#ED202B]/30 transition p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
          >
            <div className="flex-1 min-w-0">
              <div className="font-heading font-semibold text-[#201F1E] truncate">{c.name}</div>
              {c.location && <div className="text-sm text-[#7A756E] mt-0.5">{c.location}</div>}
            </div>
            {c.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {c.tags.map((tag) => (
                  <TagChip key={tag} tag={tag} size="xs" />
                ))}
              </div>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ContactList({
  contacts,
  companyById,
  totalCount,
}: {
  contacts: Contact[];
  companyById: Map<string, Company>;
  totalCount: number;
}) {
  const navigate = useNavigate();

  if (totalCount === 0) {
    return (
      <EmptyState
        title="No people yet"
        description="Add a company first, then add people to it."
      />
    );
  }
  if (contacts.length === 0) {
    return <NoMatchesState label="people" />;
  }

  return (
    <ul className="space-y-2">
      {contacts.map((c) => {
        const company = companyById.get(c.companyId);
        return (
          <li key={c.id}>
            <button
              onClick={() => navigate(`/crm/people/${c.id}`)}
              className="w-full text-left bg-white rounded-xl border border-[#D8D5D0] shadow-sm hover:shadow-md hover:border-[#ED202B]/30 transition p-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-heading font-semibold text-[#201F1E] truncate">
                  {c.firstName} {c.lastName}
                </div>
                {c.title && <div className="text-xs text-[#7A756E] shrink-0">{c.title}</div>}
              </div>
              <div className="text-sm text-[#7A756E] mt-0.5 truncate">
                {company?.name ?? 'Unknown company'}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center py-16 bg-white rounded-xl border border-dashed border-[#D8D5D0]">
      <h3 className="font-heading font-semibold text-[#201F1E]">{title}</h3>
      <p className="text-sm text-[#7A756E] mt-1">{description}</p>
    </div>
  );
}

function NoMatchesState({ label }: { label: string }) {
  return (
    <div className="text-center py-12 text-sm text-[#7A756E]">
      No {label} match your search.
    </div>
  );
}
