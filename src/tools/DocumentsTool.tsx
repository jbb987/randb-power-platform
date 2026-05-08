import Layout from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import { getShortcutsForRole, type DocumentShortcut } from '../lib/documents';

export default function DocumentsTool() {
  const { role } = useAuth();
  const shortcuts = getShortcutsForRole(role);

  return (
    <Layout>
      <main className="py-6">
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">Documents</h1>
        </div>

        {shortcuts.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#D8D5D0] p-6 text-sm text-[#7A756E]">
            You don't have any document shortcuts yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {shortcuts.map((s) => (
              <ShortcutCard key={s.id} shortcut={s} />
            ))}
          </div>
        )}
      </main>
    </Layout>
  );
}

function ShortcutCard({ shortcut }: { shortcut: DocumentShortcut }) {
  return (
    <a
      href={shortcut.url}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] px-4 py-4 text-left hover:shadow-md hover:border-[#ED202B]/30 transition group flex items-start gap-3"
    >
      <div className="h-10 w-10 rounded-lg bg-[#ED202B]/10 flex items-center justify-center shrink-0">
        <FolderIcon />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-heading font-semibold text-sm text-[#201F1E] group-hover:text-[#ED202B] transition">
          {shortcut.name}
        </h3>
        <p className="text-xs text-[#7A756E] mt-0.5 line-clamp-2">{shortcut.description}</p>
      </div>
      <ExternalIcon />
    </a>
  );
}

function FolderIcon() {
  return (
    <svg
      className="h-5 w-5 text-[#ED202B]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
      />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg
      className="h-4 w-4 text-[#7A756E] shrink-0 mt-1"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3h7v7m0-7L10 14m-7 7h7v-7" />
    </svg>
  );
}
