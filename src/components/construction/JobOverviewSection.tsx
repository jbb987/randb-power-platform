import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCompanies } from '../../hooks/useCompanies';
import type { ConstructionJob } from '../../types';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-3 py-2">
      <span className="text-xs font-medium uppercase tracking-wide text-[#7A756E] sm:w-44 sm:shrink-0">
        {label}
      </span>
      <span className="text-sm text-[#201F1E] sm:text-right break-words">{children}</span>
    </div>
  );
}

function formatDate(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatBudget(b?: number): string {
  if (b == null || !Number.isFinite(b)) return '—';
  return `$${b.toLocaleString()}`;
}

function CompanyLink({ name, companyId }: { name?: string; companyId: string }) {
  return (
    <Link
      to={`/crm/companies/${companyId}`}
      className="font-medium text-[#201F1E] hover:text-[#ED202B] hover:underline"
    >
      {name ?? <span className="italic text-[#7A756E]">missing company</span>}
    </Link>
  );
}

export default function JobOverviewSection({ job }: { job: ConstructionJob }) {
  const { companies } = useCompanies();
  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  return (
    <section className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
      <h3 className="font-heading font-semibold text-[#201F1E] mb-3">Overview</h3>
      <div className="divide-y divide-[#F0EEEB]">
        <Row label={job.companyIds.length === 1 ? 'Company' : 'Companies'}>
          {job.companyIds.length === 0 ? (
            '—'
          ) : (
            <ul className="space-y-1">
              {job.companyIds.map((id) => (
                <li key={id} className="sm:text-right">
                  <CompanyLink name={companyById.get(id)?.name} companyId={id} />
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row label={job.generalContractorIds.length === 1 ? 'General Contractor' : 'General Contractors'}>
          {job.generalContractorIds.length === 0 ? (
            '—'
          ) : (
            <ul className="space-y-1">
              {job.generalContractorIds.map((id) => (
                <li key={id} className="sm:text-right">
                  <CompanyLink name={companyById.get(id)?.name} companyId={id} />
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row label={job.subcontractorIds.length === 1 ? 'Subcontractor' : 'Subcontractors'}>
          {job.subcontractorIds.length === 0 ? (
            '—'
          ) : (
            <ul className="space-y-1">
              {job.subcontractorIds.map((id) => (
                <li key={id} className="sm:text-right">
                  <CompanyLink name={companyById.get(id)?.name} companyId={id} />
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row label="Address">{job.address || '—'}</Row>
        <Row label="Start date">{formatDate(job.startDate)}</Row>
        <Row label="Expected end">{formatDate(job.expectedEndDate)}</Row>
        {job.actualEndDate && <Row label="Actual end">{formatDate(job.actualEndDate)}</Row>}
        <Row label="Budget">{formatBudget(job.budget)}</Row>
        {job.description && (
          <Row label="Description">
            <span className="whitespace-pre-wrap">{job.description}</span>
          </Row>
        )}
      </div>
    </section>
  );
}
