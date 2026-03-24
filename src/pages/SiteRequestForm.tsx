import { useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import { useSiteRequests } from '../hooks/useSiteRequests';
import { saveProject } from '../lib/projects';
import { saveSite } from '../lib/firebase';
import type { SiteRequestSite } from '../types';

type SiteEntry = SiteRequestSite & { _id: string };
let nextId = 0;
const emptySite = (): SiteEntry => ({ _id: String(++nextId), address: '', notes: '' });
const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export default function SiteRequestForm() {
  const { user } = useAuth();
  const { addRequest } = useSiteRequests();

  const [customerName, setCustomerName] = useState('');
  const [sites, setSites] = useState<SiteEntry[]>([emptySite()]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const updateSite = (index: number, field: keyof SiteRequestSite, value: string) => {
    setSites((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const removeSite = (index: number) => {
    if (sites.length <= 1) return;
    setSites((prev) => prev.filter((_, i) => i !== index));
  };

  const addSite = () => setSites((prev) => [...prev, emptySite()]);

  const canSubmit =
    customerName.trim() !== '' &&
    sites.every((s) => s.address.trim() !== '') &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !user?.email) return;

    setSubmitting(true);
    try {
      const trimmedSites = sites.map((s) => ({ address: s.address.trim(), notes: s.notes.trim() }));

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
              siteName: site.address,
              totalAcres: 0,
              currentPPA: 0,
              mw: 50,
              parcelId: '',
              substationName: '',
              county: '',
              utilityTerritory: '',
              iso: '',
              description: site.notes,
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
          Add the customer info and one or more site addresses below.
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
              className="w-full rounded-lg border border-[#D8D5D0] px-3 py-2 text-sm text-[#201F1E] placeholder:text-[#B5B0A8] focus:outline-none focus:ring-2 focus:ring-[#C1121F]/20 focus:border-[#C1121F]"
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
                      className="text-xs text-[#7A756E] hover:text-[#C1121F] transition"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-[#7A756E] mb-1">
                      Site Address
                    </label>
                    <input
                      type="text"
                      value={site.address}
                      onChange={(e) => updateSite(i, 'address', e.target.value)}
                      placeholder="Full address or coordinates"
                      className="w-full rounded-lg border border-[#D8D5D0] px-3 py-2 text-sm text-[#201F1E] placeholder:text-[#B5B0A8] focus:outline-none focus:ring-2 focus:ring-[#C1121F]/20 focus:border-[#C1121F]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#7A756E] mb-1">
                      Notes <span className="text-[#B5B0A8]">(optional)</span>
                    </label>
                    <textarea
                      value={site.notes}
                      onChange={(e) => updateSite(i, 'notes', e.target.value)}
                      placeholder="Any additional details..."
                      rows={2}
                      className="w-full rounded-lg border border-[#D8D5D0] px-3 py-2 text-sm text-[#201F1E] placeholder:text-[#B5B0A8] focus:outline-none focus:ring-2 focus:ring-[#C1121F]/20 focus:border-[#C1121F] resize-none"
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
            className="w-full rounded-xl border-2 border-dashed border-[#D8D5D0] py-3 text-sm font-medium text-[#7A756E] hover:border-[#C1121F]/30 hover:text-[#C1121F] transition"
          >
            + Add Another Site
          </button>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl bg-[#C1121F] py-3 text-sm font-semibold text-white hover:bg-[#A10E1A] transition disabled:opacity-40 disabled:cursor-not-allowed"
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
