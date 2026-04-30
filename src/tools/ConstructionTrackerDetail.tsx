import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import JobStatusBadge from '../components/construction/JobStatusBadge';
import JobOverviewSection from '../components/construction/JobOverviewSection';
import JobTeamSection from '../components/construction/JobTeamSection';
import JobForm, { formToPartialJob, jobToForm, type JobFormValues } from '../components/construction/JobForm';
import { useCompanies } from '../hooks/useCompanies';
import { useUsers } from '../hooks/useUsers';
import { useConstructionJob, useConstructionJobs } from '../hooks/useConstructionJobs';
import { useJobPermissions } from '../hooks/useJobPermissions';

function formatDate(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ConstructionTrackerDetail() {
  const navigate = useNavigate();
  const { jobId } = useParams<{ jobId: string }>();
  const { job, loading } = useConstructionJob(jobId);
  const { updateJob, removeJob } = useConstructionJobs();
  const { companies } = useCompanies();
  const { users } = useUsers();
  const perms = useJobPermissions(job);

  const [editing, setEditing] = useState(false);
  const [formValues, setFormValues] = useState<JobFormValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (job && !editing) setFormValues(jobToForm(job));
  }, [job, editing]);

  const headlineCompany = useMemo(() => {
    if (!job) return null;
    const id = job.companyIds[0] ?? job.generalContractorId ?? job.subcontractorIds[0];
    return id ? companies.find((c) => c.id === id) ?? null : null;
  }, [job, companies]);

  const pmEmail = useMemo(() => {
    if (!job) return null;
    return users.find((u) => u.id === job.projectManagerId)?.email ?? null;
  }, [job, users]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
        </div>
      </Layout>
    );
  }

  if (!job) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-[#7A756E]">Job not found.</p>
          <button
            onClick={() => navigate('/construction-tracker')}
            className="mt-4 text-sm font-medium text-[#ED202B] hover:underline"
          >
            Back to Construction Tracker
          </button>
        </div>
      </Layout>
    );
  }

  if (!perms.canView) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-[#7A756E]">You don't have access to this job.</p>
          <button
            onClick={() => navigate('/construction-tracker')}
            className="mt-4 text-sm font-medium text-[#ED202B] hover:underline"
          >
            Back to Construction Tracker
          </button>
        </div>
      </Layout>
    );
  }

  async function handleSave() {
    if (!formValues || !job) return;
    setSaving(true);
    setError(null);
    try {
      await updateJob(job.id, formToPartialJob(formValues));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!job) return;
    if (!window.confirm(`Delete "${job.name}"? This cannot be undone.`)) return;
    try {
      await removeJob(job.id);
      navigate('/construction-tracker', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.');
    }
  }

  return (
    <Layout>
      <main className="py-6 space-y-5">
        {/* Header */}
        <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="font-heading text-xl sm:text-2xl font-semibold text-[#201F1E] break-words">
                  {job.name}
                </h1>
                <JobStatusBadge status={job.status} />
              </div>
              <div className="text-xs sm:text-sm text-[#7A756E]">
                {headlineCompany?.name ?? 'No company linked'}
                {pmEmail && <> · PM {pmEmail}</>}
                {job.address && <> · {job.address}</>}
              </div>
              {(job.startDate || job.expectedEndDate) && (
                <div className="text-xs text-[#7A756E] mt-0.5">
                  {formatDate(job.startDate)}
                  {job.expectedEndDate && <> → {formatDate(job.expectedEndDate)}</>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!editing && perms.canEditBasicInfo && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-sm font-medium text-[#ED202B] border border-[#ED202B] px-3 py-1.5 rounded-lg hover:bg-[#ED202B]/5 transition"
                >
                  Edit
                </button>
              )}
              {editing && perms.canDeleteJob && (
                <button
                  onClick={handleDelete}
                  className="text-sm font-medium text-[#7A756E] hover:text-[#ED202B] transition px-2 py-1.5"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Edit form OR view sections */}
        {editing && formValues ? (
          <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
            <JobForm
              values={formValues}
              onChange={setFormValues}
              onSubmit={handleSave}
              onCancel={() => {
                setEditing(false);
                setFormValues(jobToForm(job));
              }}
              saving={saving}
              submitLabel="Save changes"
            />
          </div>
        ) : (
          <>
            <JobOverviewSection job={job} />
            <JobTeamSection job={job} />
            <section className="bg-white rounded-xl border border-dashed border-[#D8D5D0] p-4 sm:p-5 text-center">
              <p className="text-sm text-[#7A756E]">
                Tasks, photos, documents, and timeline are coming in upcoming releases.
              </p>
            </section>
          </>
        )}

        {error && (
          <div className="bg-[#ED202B]/5 border border-[#ED202B]/30 rounded-lg p-3">
            <p className="text-sm text-[#ED202B]">{error}</p>
          </div>
        )}
      </main>
    </Layout>
  );
}
