import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import JobForm, { EMPTY_JOB_FORM, formToPartialJob, type JobFormValues } from '../components/construction/JobForm';
import { useConstructionJobs } from '../hooks/useConstructionJobs';
import { useAuth } from '../hooks/useAuth';

export default function ConstructionTrackerNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { createJob } = useConstructionJobs();

  const [values, setValues] = useState<JobFormValues>(EMPTY_JOB_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from ?companyId= (adds it to the Companies (clients) list)
  const initialCompanyId = searchParams.get('companyId');
  useEffect(() => {
    if (initialCompanyId && values.companyIds.length === 0) {
      setValues((prev) => ({ ...prev, companyIds: [initialCompanyId] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCompanyId]);

  async function handleSubmit() {
    if (!user) {
      setError('You must be signed in to create a job.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const partial = formToPartialJob(values);
      const id = await createJob({
        ...partial,
        createdBy: user.uid,
      });
      navigate(`/construction-tracker/${id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job.');
      setSaving(false);
    }
  }

  return (
    <Layout>
      <main className="py-6 space-y-5">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">New construction job</h1>
          <p className="text-sm text-[#7A756E] mt-0.5">
            Fill in the basics. Photos, documents, tasks, and timeline can be added once the job is created.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
          <JobForm
            values={values}
            onChange={setValues}
            onSubmit={handleSubmit}
            onCancel={() => navigate('/construction-tracker')}
            saving={saving}
            submitLabel="Create job"
          />
          {error && (
            <p className="mt-3 text-sm text-[#ED202B]" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    </Layout>
  );
}
