import { useMemo } from 'react';
import CompanyPicker from '../crm-directory/CompanyPicker';
import UserPicker from './UserPicker';
import { useCompanies } from '../../hooks/useCompanies';
import { useUsers, userLabel } from '../../hooks/useUsers';
import {
  ALL_CONSTRUCTION_JOB_STATUSES,
  CONSTRUCTION_JOB_STATUS_LABELS,
  type ConstructionJob,
  type ConstructionJobStatus,
} from '../../types';

export interface JobFormValues {
  name: string;
  companyIds: string[];
  generalContractorIds: string[];
  subcontractorIds: string[];
  projectManagerId: string;
  workerIds: string[];
  status: ConstructionJobStatus;
  startDate: string;          // YYYY-MM-DD or ''
  expectedEndDate: string;
  actualEndDate: string;
  address: string;
  budget: string;             // raw string for typing; parse on submit
  description: string;
}

export const EMPTY_JOB_FORM: JobFormValues = {
  name: '',
  companyIds: [],
  generalContractorIds: [],
  subcontractorIds: [],
  projectManagerId: '',
  workerIds: [],
  status: 'planning',
  startDate: '',
  expectedEndDate: '',
  actualEndDate: '',
  address: '',
  budget: '',
  description: '',
};

export function jobToForm(job: ConstructionJob): JobFormValues {
  return {
    name: job.name,
    companyIds: job.companyIds ?? [],
    generalContractorIds: job.generalContractorIds ?? [],
    subcontractorIds: job.subcontractorIds ?? [],
    projectManagerId: job.projectManagerId,
    workerIds: job.workerIds,
    status: job.status,
    startDate: job.startDate ? new Date(job.startDate).toISOString().slice(0, 10) : '',
    expectedEndDate: job.expectedEndDate ? new Date(job.expectedEndDate).toISOString().slice(0, 10) : '',
    actualEndDate: job.actualEndDate ? new Date(job.actualEndDate).toISOString().slice(0, 10) : '',
    address: job.address ?? '',
    budget: job.budget != null ? String(job.budget) : '',
    description: job.description ?? '',
  };
}

interface Props {
  values: JobFormValues;
  onChange: (next: JobFormValues) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  saving?: boolean;
  submitLabel?: string;
}

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white px-3 py-2 text-sm transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none';

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-[#7A756E] block mb-1">
        {label}{required && <span className="text-[#ED202B] ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-[#7A756E] mt-1 block">{hint}</span>}
    </label>
  );
}

export default function JobForm({ values, onChange, onSubmit, onCancel, saving, submitLabel = 'Save' }: Props) {
  const { companies } = useCompanies();
  const { users, loading: usersLoading } = useUsers();

  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  // Validation: needs a name, ≥1 company, and a PM. GC + subs are optional.
  const valid = useMemo(() => {
    if (values.name.trim().length === 0) return false;
    if (values.companyIds.length === 0) return false;
    if (!values.projectManagerId) return false;
    return true;
  }, [values]);

  function patch(p: Partial<JobFormValues>) {
    onChange({ ...values, ...p });
  }

  // Companies (clients) — multi
  function addCompany(companyId: string | null) {
    if (!companyId) return;
    if (values.companyIds.includes(companyId)) return;
    patch({ companyIds: [...values.companyIds, companyId] });
  }
  function removeCompany(companyId: string) {
    patch({ companyIds: values.companyIds.filter((id) => id !== companyId) });
  }

  // General Contractors — multi
  function addGeneralContractor(companyId: string | null) {
    if (!companyId) return;
    if (values.generalContractorIds.includes(companyId)) return;
    patch({ generalContractorIds: [...values.generalContractorIds, companyId] });
  }
  function removeGeneralContractor(companyId: string) {
    patch({ generalContractorIds: values.generalContractorIds.filter((id) => id !== companyId) });
  }

  // Subcontractors — multi
  function addSubcontractor(companyId: string | null) {
    if (!companyId) return;
    if (values.subcontractorIds.includes(companyId)) return;
    patch({ subcontractorIds: [...values.subcontractorIds, companyId] });
  }
  function removeSubcontractor(companyId: string) {
    patch({ subcontractorIds: values.subcontractorIds.filter((id) => id !== companyId) });
  }

  function addWorker(uid: string | null) {
    if (!uid) return;
    if (values.workerIds.includes(uid)) return;
    patch({ workerIds: [...values.workerIds, uid] });
  }
  function removeWorker(uid: string) {
    patch({ workerIds: values.workerIds.filter((w) => w !== uid) });
  }

  function CompanyChip({ companyId, onRemove }: { companyId: string; onRemove: () => void }) {
    const c = companyById.get(companyId);
    return (
      <li className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#ED202B]/10 text-xs text-[#201F1E]">
        <span className="font-medium">{c?.name ?? '(missing company)'}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-[#7A756E] hover:text-[#ED202B]"
          aria-label="Remove"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </li>
    );
  }

  return (
    <div className="space-y-5">
      {/* Project name + status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Field label="Project name" required>
            <input
              type="text"
              className={inputClass}
              value={values.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="e.g. Eagle Pass Solar Farm"
            />
          </Field>
        </div>
        <Field label="Status" required>
          <select
            className={inputClass}
            value={values.status}
            onChange={(e) => patch({ status: e.target.value as ConstructionJobStatus })}
          >
            {ALL_CONSTRUCTION_JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CONSTRUCTION_JOB_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Companies (clients) — multi */}
      <Field label="Companies" required>
        {values.companyIds.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mb-2">
            {values.companyIds.map((id) => (
              <CompanyChip key={id} companyId={id} onRemove={() => removeCompany(id)} />
            ))}
          </ul>
        )}
        <CompanyPicker
          value={null}
          onChange={addCompany}
          placeholder={values.companyIds.length === 0 ? 'Select company' : '+ Add another company'}
        />
      </Field>

      {/* General Contractors — multi */}
      <Field label="General Contractors">
        {values.generalContractorIds.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mb-2">
            {values.generalContractorIds.map((id) => (
              <CompanyChip key={id} companyId={id} onRemove={() => removeGeneralContractor(id)} />
            ))}
          </ul>
        )}
        <CompanyPicker
          value={null}
          onChange={addGeneralContractor}
          placeholder={values.generalContractorIds.length === 0 ? 'Add general contractor' : '+ Add another GC'}
        />
      </Field>

      {/* Subcontractors — multi */}
      <Field label="Subcontractors">
        {values.subcontractorIds.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mb-2">
            {values.subcontractorIds.map((id) => (
              <CompanyChip key={id} companyId={id} onRemove={() => removeSubcontractor(id)} />
            ))}
          </ul>
        )}
        <CompanyPicker
          value={null}
          onChange={addSubcontractor}
          placeholder={values.subcontractorIds.length === 0 ? 'Add subcontractor' : '+ Add another sub'}
        />
      </Field>

      {/* Team */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Project manager" required>
          <UserPicker
            value={values.projectManagerId || null}
            onChange={(id) => patch({ projectManagerId: id ?? '' })}
            users={users}
            excludeIds={values.workerIds}
            placeholder="Select PM"
            loading={usersLoading}
            required
          />
        </Field>
        <Field label="Workers">
          <div className="space-y-1.5">
            {values.workerIds.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {values.workerIds.map((uid) => {
                  const u = users.find((x) => x.id === uid);
                  return (
                    <li
                      key={uid}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#ED202B]/10 text-xs text-[#201F1E]"
                    >
                      {userLabel(u)}
                      <button
                        type="button"
                        onClick={() => removeWorker(uid)}
                        className="text-[#7A756E] hover:text-[#ED202B]"
                        aria-label="Remove worker"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <UserPicker
              value={null}
              onChange={addWorker}
              users={users}
              excludeIds={[values.projectManagerId, ...values.workerIds]}
              placeholder={values.workerIds.length === 0 ? 'Add a worker' : '+ Add another worker'}
              loading={usersLoading}
            />
          </div>
        </Field>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Start date">
          <input
            type="date"
            className={inputClass}
            value={values.startDate}
            onChange={(e) => patch({ startDate: e.target.value })}
          />
        </Field>
        <Field label="Expected end">
          <input
            type="date"
            className={inputClass}
            value={values.expectedEndDate}
            onChange={(e) => patch({ expectedEndDate: e.target.value })}
          />
        </Field>
        <Field label="Actual end">
          <input
            type="date"
            className={inputClass}
            value={values.actualEndDate}
            onChange={(e) => patch({ actualEndDate: e.target.value })}
          />
        </Field>
      </div>

      {/* Address + budget */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Field label="Address">
            <input
              type="text"
              className={inputClass}
              value={values.address}
              onChange={(e) => patch({ address: e.target.value })}
              placeholder="e.g. Eagle Pass, TX"
            />
          </Field>
        </div>
        <Field label="Budget (USD)">
          <input
            type="number"
            inputMode="decimal"
            className={inputClass}
            value={values.budget}
            onChange={(e) => patch({ budget: e.target.value })}
            placeholder="4200000"
            min={0}
          />
        </Field>
      </div>

      {/* Description */}
      <Field label="Description">
        <textarea
          className={`${inputClass} min-h-[88px]`}
          value={values.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="Short scope summary…"
        />
      </Field>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#D8D5D0]">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[#201F1E] bg-white border border-[#D8D5D0] hover:bg-stone-50 transition disabled:opacity-40"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={!valid || saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#ED202B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9B0E18] transition disabled:opacity-40"
        >
          {saving ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving…
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </div>
  );
}

/** Convert form values into a Firestore-shaped partial. Caller adds id/createdAt/updatedAt/createdBy. */
export function formToPartialJob(
  values: JobFormValues,
): Omit<ConstructionJob, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'linkedCompanyIds'> {
  const dateMs = (s: string): number | undefined => {
    if (!s) return undefined;
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : undefined;
  };
  const budget = values.budget.trim() ? Number(values.budget) : undefined;
  return {
    name: values.name.trim(),
    companyIds: values.companyIds,
    generalContractorIds: values.generalContractorIds,
    subcontractorIds: values.subcontractorIds,
    projectManagerId: values.projectManagerId,
    workerIds: values.workerIds,
    status: values.status,
    ...(dateMs(values.startDate) !== undefined && { startDate: dateMs(values.startDate)! }),
    ...(dateMs(values.expectedEndDate) !== undefined && { expectedEndDate: dateMs(values.expectedEndDate)! }),
    ...(dateMs(values.actualEndDate) !== undefined && { actualEndDate: dateMs(values.actualEndDate)! }),
    ...(values.address.trim() && { address: values.address.trim() }),
    ...(budget !== undefined && Number.isFinite(budget) && { budget }),
    ...(values.description.trim() && { description: values.description.trim() }),
  };
}
