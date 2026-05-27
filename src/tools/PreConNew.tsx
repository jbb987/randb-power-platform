import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Button from '../components/ui/Button';
import CompanyPicker from '../components/crm-directory/CompanyPicker';
import { useAuth } from '../hooks/useAuth';
import { useCompanies } from '../hooks/useCompanies';
import { usePreConSitesList } from '../hooks/usePreConSites';
import { useSiteRegistry } from '../hooks/useSiteRegistry';
import {
  createPreConSite,
  createPreConSiteFromRegistry,
  PreConSiteAlreadyExistsError,
} from '../lib/preConSites';
import { parseCoordinates } from '../utils/parseCoordinates';

type CompanyMode = 'existing' | 'new' | 'from-analyzed';

export default function PreConNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { createCompany, companies } = useCompanies();
  const { sites: registrySites } = useSiteRegistry();
  const { sites: preConSites } = usePreConSitesList({ includeArchived: true });
  const [searchParams] = useSearchParams();
  const initialCompanyId = searchParams.get('companyId');

  const [companyMode, setCompanyMode] = useState<CompanyMode>(
    initialCompanyId ? 'existing' : 'existing',
  );
  const [companyId, setCompanyId] = useState<string | null>(initialCompanyId);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyLocation, setNewCompanyLocation] = useState('');

  const [name, setName] = useState('');
  const [coordinates, setCoordinates] = useState('');
  const [acreage, setAcreage] = useState('');

  const [analyzedSiteId, setAnalyzedSiteId] = useState<string | null>(null);
  const [analyzedSearch, setAnalyzedSearch] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialCompanyId && !companyId) setCompanyId(initialCompanyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCompanyId]);

  // Analyzed sites eligible for conversion: company-linked + not already in
  // Pre-Con. The set is small enough that filtering client-side is fine.
  const alreadyTrackedRegistryIds = useMemo(
    () => new Set(preConSites.map((p) => p.siteRegistryId)),
    [preConSites],
  );
  const companyNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies) m.set(c.id, c.name);
    return m;
  }, [companies]);
  const eligibleAnalyzedSites = useMemo(() => {
    const filtered = registrySites.filter(
      (s) => s.companyId && !alreadyTrackedRegistryIds.has(s.id),
    );
    const q = analyzedSearch.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter((s) => {
      const companyName = s.companyId ? (companyNameById.get(s.companyId) ?? '') : '';
      return (
        (s.name || '').toLowerCase().includes(q) || companyName.toLowerCase().includes(q)
      );
    });
  }, [registrySites, alreadyTrackedRegistryIds, analyzedSearch, companyNameById]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      setError('You must be signed in.');
      return;
    }

    if (companyMode === 'from-analyzed') {
      if (!analyzedSiteId) {
        setError('Pick an analyzed site to convert.');
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const siteId = await createPreConSiteFromRegistry({
          siteRegistryId: analyzedSiteId,
          createdBy: user.uid,
        });
        navigate(`/llr/${siteId}`, { replace: true });
      } catch (err) {
        if (err instanceof PreConSiteAlreadyExistsError) {
          navigate(`/llr/${err.existingPreConSiteId}`, { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to convert analyzed site.');
        setSaving(false);
      }
      return;
    }

    const parsed = parseCoordinates(coordinates);
    if (!parsed) {
      setError('Coordinates must be decimal (e.g. 32.7767, -96.7970) or DMS.');
      return;
    }
    const acreageNum = Number(acreage);
    if (!Number.isFinite(acreageNum) || acreageNum < 0) {
      setError('Acreage must be a non-negative number.');
      return;
    }
    if (!name.trim()) {
      setError('Enter a site name.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let resolvedCompanyId = companyId;
      if (companyMode === 'new') {
        if (!newCompanyName.trim()) {
          throw new Error('Enter a company name.');
        }
        resolvedCompanyId = await createCompany({
          name: newCompanyName.trim(),
          location: newCompanyLocation.trim(),
          tags: ['Pre Construction'],
        });
      }
      if (!resolvedCompanyId) {
        throw new Error('Pick or create a company.');
      }

      const siteId = await createPreConSite({
        companyId: resolvedCompanyId,
        name: name.trim(),
        coordinates: { lat: parsed.lat, lng: parsed.lng },
        acreage: acreageNum,
        createdBy: user.uid,
      });

      navigate(`/llr/${siteId}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create Large Load Request site.');
      setSaving(false);
    }
  }

  return (
    <Layout>
      <main className="py-6 space-y-5">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">
            New Large Load Request site
          </h1>
          <p className="text-sm text-[#7A756E] mt-0.5">
            Pick a customer, drop the coordinates, and we'll run the appraisal so you can grade
            the site and track the LOA process with the utility.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5 space-y-4"
        >
          {/* Mode selector */}
          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-wide text-[#7A756E] font-medium">
              Source
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCompanyMode('existing')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                  companyMode === 'existing'
                    ? 'bg-[#ED202B] text-white border-[#ED202B]'
                    : 'bg-white text-[#201F1E] border-[#D8D5D0] hover:border-[#ED202B]/50'
                }`}
              >
                Pick existing customer
              </button>
              <button
                type="button"
                onClick={() => setCompanyMode('new')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                  companyMode === 'new'
                    ? 'bg-[#ED202B] text-white border-[#ED202B]'
                    : 'bg-white text-[#201F1E] border-[#D8D5D0] hover:border-[#ED202B]/50'
                }`}
              >
                Create new customer
              </button>
              <button
                type="button"
                onClick={() => setCompanyMode('from-analyzed')}
                title="Convert a site you've already analyzed in the Site Analyzer — reuses all section results, no quota burned."
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                  companyMode === 'from-analyzed'
                    ? 'bg-[#ED202B] text-white border-[#ED202B]'
                    : 'bg-white text-[#201F1E] border-[#D8D5D0] hover:border-[#ED202B]/50'
                }`}
              >
                From existing analyzed site
              </button>
            </div>

            {companyMode === 'existing' && (
              <CompanyPicker value={companyId} onChange={setCompanyId} />
            )}
            {companyMode === 'new' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="Company name"
                  className="px-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
                />
                <input
                  type="text"
                  value={newCompanyLocation}
                  onChange={(e) => setNewCompanyLocation(e.target.value)}
                  placeholder="Location (City, ST)"
                  className="px-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
                />
              </div>
            )}
            {companyMode === 'from-analyzed' && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={analyzedSearch}
                  onChange={(e) => setAnalyzedSearch(e.target.value)}
                  placeholder="Search by site name or customer…"
                  className="w-full px-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
                />
                <div className="max-h-72 overflow-y-auto border border-[#D8D5D0] rounded-lg divide-y divide-[#D8D5D0] bg-white">
                  {eligibleAnalyzedSites.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-[#7A756E] italic">
                      No analyzed sites available. A site is eligible when it's linked to a
                      customer and not already tracked as a Large Load Request.
                    </p>
                  ) : (
                    eligibleAnalyzedSites.map((s) => {
                      const selected = analyzedSiteId === s.id;
                      const companyName = s.companyId
                        ? (companyNameById.get(s.companyId) ?? '—')
                        : '—';
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setAnalyzedSiteId(s.id)}
                          className={`w-full text-left px-3 py-2 hover:bg-stone-50 transition ${
                            selected ? 'bg-[#ED202B]/5' : ''
                          }`}
                        >
                          <div className="text-sm font-medium text-[#201F1E] truncate">
                            {s.name || 'Untitled Site'}
                          </div>
                          <div className="text-xs text-[#7A756E] truncate">
                            {companyName}
                            {s.coordinates
                              ? ` · ${s.coordinates.lat.toFixed(4)}, ${s.coordinates.lng.toFixed(4)}`
                              : ''}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
                <p className="text-xs text-[#7A756E]">
                  The new Large Load Request site reuses the analyzed site's appraisal and section results.
                </p>
              </div>
            )}
          </div>

          {/* Site core fields — hidden in from-analyzed mode (data pulled from registry) */}
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${
              companyMode === 'from-analyzed' ? 'hidden' : ''
            }`}
          >
            <div className="sm:col-span-2">
              <label className="block text-xs uppercase tracking-wide text-[#7A756E] font-medium mb-1">
                Site name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., West Texas Solar — Phase 1"
                className="w-full px-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs uppercase tracking-wide text-[#7A756E] font-medium mb-1">
                Coordinates
              </label>
              <input
                type="text"
                value={coordinates}
                onChange={(e) => setCoordinates(e.target.value)}
                placeholder="32.7767, -96.7970  (decimal or DMS)"
                className="w-full px-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs uppercase tracking-wide text-[#7A756E] font-medium mb-1">
                Acreage
              </label>
              <input
                type="number"
                value={acreage}
                onChange={(e) => setAcreage(e.target.value)}
                placeholder="e.g., 250"
                step="0.1"
                className="w-full px-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
              />
              <p className="text-xs text-[#7A756E] mt-1">
                MW capacity comes from the engineer review. $/acre values are entered in the Site
                Analyzer's valuation section.
              </p>
            </div>
          </div>

          {error && (
            <p className="text-sm text-[#ED202B]" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => navigate('/llr')}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? companyMode === 'from-analyzed'
                  ? 'Converting…'
                  : 'Creating…'
                : companyMode === 'from-analyzed'
                  ? 'Convert to LLR'
                  : 'Create site'}
            </Button>
          </div>
        </form>
      </main>
    </Layout>
  );
}
