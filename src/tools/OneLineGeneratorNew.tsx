import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Button from '../components/ui/Button';
import DiagramViewer from '../components/one-line-generator/DiagramViewer';
import OneLineForm from '../components/one-line-generator/OneLineForm';
import { useAuth } from '../hooks/useAuth';
import { useSiteRegistry } from '../hooks/useSiteRegistry';
import { useOneLineDocuments } from '../hooks/useOneLineDiagrams';
import { createOneLineDocument, nextDrawingNumber } from '../lib/oneLineDiagrams';
import { generateOneLine, type OneLineSpec } from '../lib/oneLine';

function defaultSpec(): OneLineSpec {
  return {
    projectName: '',
    location: '',
    customer: 'NTNSM, LLC',
    drawingNo: 'RB-E-001',
    utility: 'Oncor',
    rev: '1',
    date: new Date().toISOString().slice(0, 10),
    ultimateMW: 100,
    feeds: 'dual',
  };
}

export default function OneLineGeneratorNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { sites } = useSiteRegistry();
  const { docs, loading: docsLoading } = useOneLineDocuments();

  const [spec, setSpec] = useState<OneLineSpec>(defaultSpec);
  const [seededRegistryId, setSeededRegistryId] = useState<string | undefined>();
  const [seededCompanyId, setSeededCompanyId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<OneLineSpec>) => setSpec((s) => ({ ...s, ...p }));

  // Auto-assign the next drawing number once existing diagrams load, so new
  // diagrams don't all default to -001. Only touches the untouched default.
  const numberedRef = useRef(false);
  useEffect(() => {
    if (numberedRef.current || docsLoading) return;
    numberedRef.current = true;
    setSpec((s) => (s.drawingNo === 'RB-E-001' ? { ...s, drawingNo: nextDrawingNumber(docs) } : s));
  }, [docsLoading, docs]);

  const generated = useMemo(() => {
    if (!spec.ultimateMW || spec.ultimateMW <= 0) return null;
    try {
      return generateOneLine(spec);
    } catch {
      return null;
    }
  }, [spec]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const id = await createOneLineDocument({
        name: spec.projectName || spec.drawingNo,
        spec,
        createdBy: user.uid,
        companyId: seededCompanyId,
        siteRegistryId: seededRegistryId,
      });
      navigate(`/one-line-generator/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
  };

  return (
    <Layout fullWidth>
      <main className="py-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">New diagram</h1>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-[#ED202B]">{error}</span>}
            <Button variant="ghost" onClick={() => navigate('/one-line-generator')}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !user}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 items-start">
          <div className="xl:col-span-2 bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4">
            <OneLineForm
              spec={spec}
              onChange={patch}
              sites={sites}
              selectedSiteId={seededRegistryId}
              onPickSite={(s) => {
                setSeededRegistryId(s.id);
                setSeededCompanyId(s.companyId);
                // All-solid by default (show the full ultimate build-out).
                // Phasing is opt-in: fill Phase-1 MW to mark the rest as future (dashed).
                patch({
                  projectName: s.name,
                  location: s.address || spec.location,
                  ultimateMW: s.mwCapacity > 0 ? s.mwCapacity : spec.ultimateMW,
                });
              }}
            />
          </div>
          <div className="xl:col-span-3">
            {generated ? (
              <DiagramViewer svg={generated.svg} />
            ) : (
              <div className="bg-white rounded-xl border border-dashed border-[#D8D5D0] py-12 text-center text-sm text-[#7A756E]">
                Enter an ultimate MW to preview the one-line.
              </div>
            )}
          </div>
        </div>
      </main>
    </Layout>
  );
}
