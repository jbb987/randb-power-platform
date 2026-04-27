import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import PowerSlider from '../components/PowerSlider';
import CompanyPicker from '../components/crm-directory/CompanyPicker';
import { useAuth } from '../hooks/useAuth';
import { useSiteRegistry } from '../hooks/useSiteRegistry';
import { useCompanies } from '../hooks/useCompanies';
import { createSiteEntry, findSiteByCoordinates } from '../lib/siteRegistry';
import { parseCoordinates } from '../utils/parseCoordinates';

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white/80 px-3 py-2.5 text-sm text-[#201F1E] outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 placeholder:text-[#7A756E]';

const MW_MIN = 10;
const MW_MAX = 1000;

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
  const { companies } = useCompanies();

  // Pre-fill from query params (e.g. ?companyId=X from CRM, ?lat=&lng= from PowerMapView)
  const initialCompanyId = searchParams.get('companyId');
  const latParam = searchParams.get('lat');
  const lngParam = searchParams.get('lng');
  const initialCoords = latParam && lngParam ? `${latParam}, ${lngParam}` : '';

  const [siteName, setSiteName] = useState('');
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState(initialCoords);
  const [acreage, setAcreage] = useState(0);
  const [mw, setMw] = useState(50);
  const [ppaLow, setPpaLow] = useState(0);
  const [ppaHigh, setPpaHigh] = useState(0);
  const [priorUsage, setPriorUsage] = useState('');
  const [legalDescription, setLegalDescription] = useState('');
  const [county, setCounty] = useState('');
  const [parcelId, setParcelId] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(initialCompanyId);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const initialCompany = companies.find((c) => c.id === initialCompanyId);

  async function handleRun() {
    setError(null);

    if (!siteName.trim()) {
      setError('Site name is required.');
      return;
    }
    if (!coordinates.trim()) {
      setError('Coordinates are required.');
      return;
    }
    const coords = parseCoordinates(coordinates.trim());
    if (!coords) {
      setError('Invalid coordinates. Use decimal (28.65, -98.84) or DMS (28°39\'22"N 98°50\'38"W).');
      return;
    }
    if (!user) {
      setError('You must be signed in.');
      return;
    }

    // If a site already exists at these coordinates, route to it instead of creating a duplicate.
    const match = findSiteByCoordinates(registrySites, coords.lat, coords.lng);
    if (match) {
      const proceed = window.confirm(
        `A site already exists at these coordinates: "${match.name || 'Untitled Site'}". Open it instead?`,
      );
      if (proceed) {
        navigate(`/site-analyzer/${match.id}`);
        return;
      }
      // User chose to continue creating a duplicate at those coords — proceed.
    }

    setSubmitting(true);
    try {
      const newId = await createSiteEntry({
        name: siteName.trim(),
        address: address.trim(),
        coordinates: coords,
        acreage: acreage || 0,
        mwCapacity: mw,
        dollarPerAcreLow: ppaLow || 0,
        dollarPerAcreHigh: ppaHigh || 0,
        priorUsage: priorUsage.trim() || undefined,
        legalDescription: legalDescription.trim() || undefined,
        county: county.trim() || undefined,
        parcelId: parcelId.trim() || undefined,
        companyId: companyId ?? undefined,
        createdBy: user.uid,
        memberIds: [user.uid],
      });
      // Detail page sees ?run=1 and triggers analysis automatically.
      navigate(`/site-analyzer/${newId}?run=1`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create site.');
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !submitting) handleRun();
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
          <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">New Site Analysis</h1>
          {initialCompany && (
            <p className="text-sm text-[#7A756E] mt-1">
              Linking to <span className="font-medium text-[#201F1E]">{initialCompany.name}</span>
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6 mb-6">
          <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-5">Site Information</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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

            <Field label="Coordinates *">
              <input
                type="text"
                className={inputClass}
                value={coordinates}
                onChange={(e) => setCoordinates(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={'28°39\'22.0"N 98°50\'38.3"W'}
              />
            </Field>

            <Field label="Address">
              <input
                type="text"
                className={inputClass}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. 13850 Cottage Grove Ave, Dolton, IL 60419"
              />
            </Field>

            <Field label="Acreage">
              <input
                type="number"
                className={inputClass}
                value={acreage || ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setAcreage(isNaN(v) ? 0 : v);
                }}
                onKeyDown={handleKeyDown}
                placeholder="414"
              />
            </Field>

            <Field label="$/Acre Low">
              <input
                type="number"
                className={inputClass}
                value={ppaLow || ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setPpaLow(isNaN(v) ? 0 : v);
                }}
                onKeyDown={handleKeyDown}
                placeholder="5000"
              />
            </Field>

            <Field label="$/Acre High">
              <input
                type="number"
                className={inputClass}
                value={ppaHigh || ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setPpaHigh(isNaN(v) ? 0 : v);
                }}
                onKeyDown={handleKeyDown}
                placeholder="8000"
              />
            </Field>
          </div>

          <div className="mt-6 max-w-md">
            <PowerSlider value={mw} min={MW_MIN} max={MW_MAX} step={5} label="MW Capacity" onChange={setMw} />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-[#7A756E]">{MW_MIN} MW</span>
              <span className="text-sm font-heading font-semibold text-[#ED202B]">{mw} MW</span>
              <span className="text-[10px] text-[#7A756E]">{MW_MAX} MW</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6 mb-6">
          <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-5">Property Details</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Prior Usage / Property Type">
              <input
                type="text"
                className={inputClass}
                value={priorUsage}
                onChange={(e) => setPriorUsage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Agricultural, Vacant, Ranch"
              />
            </Field>

            <Field label="Legal Description">
              <input
                type="text"
                className={inputClass}
                value={legalDescription}
                onChange={(e) => setLegalDescription(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Lot 1, Block 2, Section 14"
              />
            </Field>

            <Field label="County">
              <input
                type="text"
                className={inputClass}
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Laramie County, WY"
              />
            </Field>

            <Field label="Parcel ID">
              <input
                type="text"
                className={inputClass}
                value={parcelId}
                onChange={(e) => setParcelId(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="00014006623014"
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
            onClick={handleRun}
            disabled={submitting}
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
                Run Analysis
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate('/site-analyzer')}
            disabled={submitting}
            className="rounded-lg border border-[#D8D5D0] bg-white px-4 py-3 text-sm text-[#7A756E] hover:bg-[#F5F4F2] transition disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </main>
    </Layout>
  );
}
