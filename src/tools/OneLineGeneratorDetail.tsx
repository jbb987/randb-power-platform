import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import DiagramViewer from '../components/one-line-generator/DiagramViewer';
import DownloadButtons from '../components/one-line-generator/DownloadButtons';
import OneLineForm from '../components/one-line-generator/OneLineForm';
import { useOneLineDocument } from '../hooks/useOneLineDiagrams';
import { updateOneLineDocument } from '../lib/oneLineDiagrams';
import { generateOneLine, type OneLineSpec } from '../lib/oneLine';

export default function OneLineGeneratorDetail() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { doc, loading } = useOneLineDocument(documentId);

  const [spec, setSpec] = useState<OneLineSpec | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the editable spec once the doc loads (or when switching docs).
  useEffect(() => {
    if (doc) setSpec(doc.spec);
  }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p: Partial<OneLineSpec>) => setSpec((s) => (s ? { ...s, ...p } : s));

  const generated = useMemo(() => {
    if (!spec || !spec.ultimateMW || spec.ultimateMW <= 0) return null;
    try {
      return generateOneLine(spec);
    } catch {
      return null;
    }
  }, [spec]);

  const dirty = useMemo(
    () => (doc && spec ? JSON.stringify(doc.spec) !== JSON.stringify(spec) : false),
    [doc, spec],
  );

  const save = async () => {
    if (!documentId || !spec) return;
    setSaving(true);
    setError(null);
    try {
      await updateOneLineDocument(documentId, { name: spec.projectName || spec.drawingNo, spec });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
        </div>
      </Layout>
    );
  }

  if (!doc || !spec) {
    return (
      <Layout>
        <div className="py-12 text-center text-sm text-[#7A756E]">
          Diagram not found.{' '}
          <button onClick={() => navigate('/one-line-generator')} className="text-[#ED202B] hover:underline">
            Back to list
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout fullWidth>
      <main className="py-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <h1 className="font-heading text-2xl font-semibold text-[#201F1E] truncate">
              {spec.projectName || 'Untitled one-line'}
            </h1>
            {saving ? (
              <span title="Saving…" className="shrink-0">
                <span className="block h-5 w-5 animate-spin rounded-full border-2 border-[#D8D5D0] border-t-[#ED202B]" />
              </span>
            ) : dirty ? (
              <button
                onClick={save}
                title="Save changes"
                aria-label="Save changes"
                className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-[#ED202B] hover:bg-[#ED202B]/10 transition"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 5a2 2 0 012-2h9l3 3v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v5h6M8 13h8v6H8z" />
                </svg>
              </button>
            ) : (
              <span title="Saved" className="shrink-0 text-[#10B981]">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
            )}
          </div>
          {error && <span className="text-xs text-[#ED202B]">{error}</span>}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 items-start">
          <div className="xl:col-span-2 bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4">
            <OneLineForm spec={spec} onChange={patch} />
          </div>
          <div className="xl:col-span-3 space-y-3">
            {generated ? (
              <>
                <DownloadButtons
                  svg={generated.svg}
                  width={generated.diagram.width}
                  height={generated.diagram.height}
                  name={spec.drawingNo || 'one-line'}
                />
                <DiagramViewer svg={generated.svg} />
              </>
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
