import { useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import { useSiteRequests } from '../hooks/useSiteRequests';
import { saveProject } from '../lib/projects';
import { saveSite } from '../lib/firebase';
import type { SiteRequestSite } from '../types';

type SiteEntry = SiteRequestSite & { _id: string };
let nextId = 0;
const emptySite = (): SiteEntry => ({ _id: String(++nextId), address: '', coordinates: '', acres: 0 });
const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export default function SiteRequestForm() {
  const { user } = useAuth();
  const { addRequest } = useSiteRequests();

  const [customerName, setCustomerName] = useState('');
  const [sites, setSites] = useState<SiteEntry[]>([emptySite()]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const updateSite = (index: number, field: keyof SiteRequestSite, value: string) => {
    const parsed = field === 'acres' ? (value === '' ? 0 : Number(value)) : value;
    setSites((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: parsed } : s)));
  };

  const removeSite = (index: number) => {
    if (sites.length <= 1) return;
    setSites((prev) => prev.filter((_, i) => i !== index));
  };

  const addSite = () => setSites((prev) => [...prev, emptySite()]);

  const canSubmit =
    customerName.trim() !== '' &&
    sites.every((s) => s.address.trim() !== '' || s.coordinates.trim() !== '') &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !user?.email) return;

    setSubmitting(true);
    try {
      const trimmedSites = sites.map((s) => ({ address: s.address.trim(), coordinates: s.coordinates.trim(), acres: s.acres }));

      // Create project + sites in the appraiser
      const projectId = generateId();
      const now = Date.now();
      await Promise.all([
        saveProject({ id: projectId, name: customerName.trim(), createdAt: now, updatedAt: now }),
        addRequest(customerName.trim(), trimmedSites, user.email, projectId),
      ]);
      await Promise.all(
        trimmedSites.map((site) => {
          const siteId = generateId();
          return saveSite({
            id: siteId,
            inputs: {
              id: siteId,
              projectId,
              siteName: site.address || site.coordinates,
              totalAcres: site.acres,
              ppaLow: 0,
              ppaHigh: 0,
              mw: 50,
              address: site.address,
              coordinates: site.coordinates,
              legalDescription: '',
              county: '',
              parcelId: '',
              owner: '',
              priorUsage: '',
              iso: '',
              utilityTerritory: '',
              tsp: '',
              nearestPoiName: '',
              nearestPoiDistMi: 0,
              nearbySubstations: [],
              nearbyLines: [],
              nearbyPowerPlants: [],
              floodZone: null,
              solarWind: null,
              detectedState: null,
            },
            createdAt: now,
            updatedAt: now,
          });
        })
      );

      setCustomerName('');
      setSites([emptySite()]);
      setToast('Request submitted successfully!');
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast('Failed to submit. Please try again.');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <main className="py-6 max-w-2xl mx-auto">
        <h2 className="font-heading text-2xl font-semibold text-[#201F1E] mb-1">
          Submit Site Request
        </h2>
        <p className="text-sm text-[#7A756E] mb-6">
          Add the customer info and one or more sites below. Provide at least an address or coordinates for each site.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Customer Name */}
          <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-5">
            <label className="block text-sm font-medium text-[#201F1E] mb-1.5">
              Customer Name
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Acme Solar LLC"
              className="w-full rounded-lg border border-[#D8D5D0] px-3 py-2 text-sm text-[#201F1E] placeholder:text-[#7A756E] focus:outline-none focus:ring-2 focus:ring-[#ED202B]/20 focus:border-[#ED202B]"
            />
          </div>

          {/* Sites */}
          <div className="space-y-3">
            {sites.map((site, i) => (
              <div
                key={site._id}
                className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-[#201F1E]">
                    Site {i + 1}
                  </span>
                  {sites.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSite(i)}
                      className="text-xs text-[#7A756E] hover:text-[#ED202B] transition"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {site.address.trim() === '' && site.coordinates.trim() === '' && (
                  <p className="text-xs text-[#ED202B] mb-2">
                    Please provide at least an address or coordinates.
                  </p>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-[#7A756E] mb-1">
                      Site Address <span className="text-[#7A756E]">(or provide coordinates)</span>
                    </label>
                    <input
                      type="text"
                      value={site.address}
                      onChange={(e) => updateSite(i, 'address', e.target.value)}
                      placeholder="Full street address"
                      className="w-full rounded-lg border border-[#D8D5D0] px-3 py-2 text-sm text-[#201F1E] placeholder:text-[#7A756E] focus:outline-none focus:ring-2 focus:ring-[#ED202B]/20 focus:border-[#ED202B]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#7A756E] mb-1">
                      Coordinates <span className="text-[#7A756E]">(or provide address)</span>
                    </label>
                    <input
                      type="text"
                      value={site.coordinates}
                      onChange={(e) => updateSite(i, 'coordinates', e.target.value)}
                      placeholder="e.g. 35.6895, -97.5164"
                      className="w-full rounded-lg border border-[#D8D5D0] px-3 py-2 text-sm text-[#201F1E] placeholder:text-[#7A756E] focus:outline-none focus:ring-2 focus:ring-[#ED202B]/20 focus:border-[#ED202B]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#7A756E] mb-1">
                      Acres <span className="text-[#7A756E]">(optional)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={site.acres || ''}
                      onChange={(e) => updateSite(i, 'acres', e.target.value)}
                      placeholder="e.g. 500"
                      className="w-full rounded-lg border border-[#D8D5D0] px-3 py-2 text-sm text-[#201F1E] placeholder:text-[#7A756E] focus:outline-none focus:ring-2 focus:ring-[#ED202B]/20 focus:border-[#ED202B]"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add Site button */}
          <button
            type="button"
            onClick={addSite}
            className="w-full rounded-xl border-2 border-dashed border-[#D8D5D0] py-3 text-sm font-medium text-[#7A756E] hover:border-[#ED202B]/30 hover:text-[#ED202B] transition"
          >
            + Add Another Site
          </button>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl bg-[#ED202B] text-white border border-[#ED202B] hover:bg-[#9B0E18] hover:border-[#9B0E18] py-3 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#201F1E] text-white text-sm px-5 py-3 rounded-xl shadow-lg z-50">
            {toast}
          </div>
        )}
      </main>
    </Layout>
  );
}
