import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Button from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';
import { useOneLineDocuments } from '../hooks/useOneLineDiagrams';
import { archiveOneLineDocument, updateOneLineDocument } from '../lib/oneLineDiagrams';

export default function OneLineGeneratorIndex() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { docs, loading } = useOneLineDocuments();
  const [query, setQuery] = useState('');

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) =>
      [d.name, d.spec.drawingNo, d.spec.location, d.spec.customer]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [docs, query]);

  const canCreate = role === 'admin' || role === 'manager';

  const startRename = (id: string, name: string) => {
    setOpenMenuId(null);
    setRenameDraft(name);
    setRenamingId(id);
  };

  const commitRename = (id: string, current: string) => {
    const next = renameDraft.trim();
    setRenamingId(null);
    if (next && next !== current) void updateOneLineDocument(id, { name: next });
  };

  return (
    <Layout>
      <main className="py-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">
              One-Line Generator
            </h1>
            <p className="text-sm text-[#7A756E] mt-0.5">
              {loading ? 'Loading…' : `${filtered.length} diagram${filtered.length === 1 ? '' : 's'}`}
            </p>
          </div>
          {canCreate && (
            <Button onClick={() => navigate('/one-line-generator/new')}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>New diagram</span>
            </Button>
          )}
        </div>

        <div className="relative max-w-md">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, drawing no., customer…"
            className="w-full px-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 transition"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-[#D8D5D0] py-12 text-center">
            <p className="text-sm text-[#7A756E]">
              {docs.length === 0 ? 'No one-line diagrams yet. ' : 'No diagrams match your search.'}
              {docs.length === 0 && canCreate && (
                <button
                  onClick={() => navigate('/one-line-generator/new')}
                  className="font-medium text-[#ED202B] hover:underline"
                >
                  Create the first one.
                </button>
              )}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((d) => (
              <li key={d.id} className="relative">
                <div className="group bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 hover:shadow-md hover:border-[#ED202B]/30 transition">
                  {renamingId === d.id ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(d.id, d.name);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      onBlur={() => commitRename(d.id, d.name)}
                      className="w-full font-heading font-semibold text-[#201F1E] bg-white border border-[#ED202B] rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#ED202B]/20"
                    />
                  ) : (
                    <button
                      onClick={() => navigate(`/one-line-generator/${d.id}`)}
                      className="block w-full text-left"
                    >
                      <h3 className="font-heading font-semibold text-[#201F1E] group-hover:text-[#ED202B] transition mb-1 pr-10">
                        {d.name || 'Untitled one-line'}
                      </h3>
                      <div className="text-xs text-[#7A756E]">
                        {d.spec.drawingNo}
                        {d.spec.ultimateMW ? ` · ${d.spec.ultimateMW} MW` : ''}
                        {d.spec.feeds ? ` · ${d.spec.feeds} feed` : ''}
                        {d.spec.location ? ` · ${d.spec.location}` : ''}
                      </div>
                    </button>
                  )}

                  {/* three-dots menu */}
                  {canCreate && renamingId !== d.id && (
                    <button
                      aria-label="Actions"
                      onClick={() => setOpenMenuId(openMenuId === d.id ? null : d.id)}
                      className="absolute top-3 right-3 h-8 w-8 rounded-lg flex items-center justify-center text-[#7A756E] hover:text-[#ED202B] hover:bg-[#ED202B]/5 transition"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="1.8" />
                        <circle cx="12" cy="12" r="1.8" />
                        <circle cx="12" cy="19" r="1.8" />
                      </svg>
                    </button>
                  )}
                </div>

                {openMenuId === d.id && (
                  <div className="absolute top-12 right-3 z-20 w-40 bg-white rounded-lg border border-[#D8D5D0] shadow-lg py-1 text-sm">
                    <button
                      onClick={() => startRename(d.id, d.name)}
                      className="block w-full text-left px-3 py-2 text-[#201F1E] hover:bg-[#ED202B]/5 hover:text-[#ED202B] transition"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => {
                        setOpenMenuId(null);
                        void archiveOneLineDocument(d.id);
                      }}
                      className="block w-full text-left px-3 py-2 text-[#7A756E] hover:bg-[#ED202B]/5 hover:text-[#ED202B] transition"
                    >
                      Archive
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* click-away layer to close the open menu */}
      {openMenuId && (
        <button
          aria-hidden="true"
          tabIndex={-1}
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => setOpenMenuId(null)}
        />
      )}
    </Layout>
  );
}
