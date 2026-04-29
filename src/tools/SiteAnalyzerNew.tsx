import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import CompanyPicker from '../components/crm-directory/CompanyPicker';
import { useAuth } from '../hooks/useAuth';
import { useSiteRegistry } from '../hooks/useSiteRegistry';
import { createSiteEntry, findSiteByCoordinates } from '../lib/siteRegistry';
import { parseCoordinates } from '../utils/parseCoordinates';

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white/80 px-3 py-2.5 text-sm text-[#201F1E] outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 placeholder:text-[#7A756E]';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[#7A756E]">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-[#7A756E]">{hint}</span>}
    </label>
  );
}

export default function SiteAnalyzerNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { sites: registrySites } = useSiteRegistry();

  const initialCompanyId = searchParams.get('companyId');
  const latParam = searchParams.get('lat');
  const lngParam = searchParams.get('lng');
  const initialCoords = latParam && lngParam ? `${latParam}, ${lngParam}` : '';

  const [siteName, setSiteName] = useState('');
  const [coordinates, setCoordinates] = useState(initialCoords);
  const [companyId, setCompanyId] = useState<string | null>(initialCompanyId);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hasCoords = coordinates.trim().length > 0;

  async function handleSubmit(runAnalysis: boolean) {
    setError(null);

    if (!siteName.trim()) {
      setError('Site name is required.');
      return;
    }

    let coords: { lat: number; lng: number } | null = null;

    if (hasCoords) {
      coords = parseCoordinates(coordinates.trim());
      if (!coords) {
        setError('Invalid coordinates. Use decimal (28.65, -98.84) or DMS (28°39\'22"N 98°50\'38"W).');
        return;
      }
    }

    if (runAnalysis && !coords) {
      setError('Coordinates are required to run the analysis.');
      return;
    }

    if (!user) {
      setError('You must be signed in.');
      return;
    }

    // Duplicate check (only if coordinates are provided)
    if (coords) {
      const match = findSiteByCoordinates(registrySites, coords.lat, coords.lng);
      if (match) {
        const proceed = window.confirm(
          `A site already exists at these coordinates: "${match.name || 'Untitled Site'}". Open it instead?`,
        );
        if (proceed) {
          navigate(`/site-analyzer/${match.id}`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const newId = await createSiteEntry({
        name: siteName.trim(),
        address: '',
        coordinates: coords,
        acreage: 0,
        mwCapacity: 50,
        dollarPerAcreLow: 0,
        dollarPerAcreHigh: 0,
        companyId: companyId ?? undefined,
        createdBy: user.uid,
        memberIds: [user.uid],
      });

      if (runAnalysis) {
        navigate(`/site-analyzer/${newId}?run=1`, { replace: true });
      } else {
        navigate(`/site-analyzer/${newId}`, { replace: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create site.');
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !submitting) handleSubmit(hasCoords);
  }

  return (
    <Layout>
      <main className="py-2">
        <div className="mb-5">
          <button
            onClick={() => navigate('/site-analyzer')}
            className="text-sm text-[#7A756E] hover:text-[#201F1E] inline-flex items-center gap-1.5 mb-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            All sites
          </button>
          <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">New Site</h1>
        </div>

        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6 mb-6 max-w-lg">
          <div className="space-y-5">
            <Field label="Site Name *">
              <input
                type="text"
                className={inputClass}
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Sunrise Solar Farm"
                autoFocus
              />
            </Field>

            <Field label="Coordinates" hint="Required to run analysis. Can be added later.">
              <input
                type="text"
                className={inputClass}
                value={coordinates}
                onChange={(e) => setCoordinates(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={'28°39\'22.0"N 98°50\'38.3"W'}
              />
            </Field>

            <Field label="Company">
              <CompanyPicker
                value={companyId}
                onChange={setCompanyId}
                placeholder="Link to a company…"
              />
            </Field>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#ED202B] bg-white px-6 py-3 text-sm font-semibold text-[#ED202B] transition hover:bg-[#ED202B]/5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : 'Save Site'}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={submitting || !hasCoords}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#ED202B] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#9B0E18] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            {submitting ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating…
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Save & Run Analysis
              </>
            )}
          </button>
        </div>
      </main>
    </Layout>
  );
}
