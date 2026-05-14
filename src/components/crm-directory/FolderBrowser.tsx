import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useFoldersByCompany } from '../../hooks/useFolders';
import { useDocumentsByCompany } from '../../hooks/useDocumentRecords';
import { getDocumentUrl } from '../../lib/documentRecords';
import type { DocumentRecord, Folder } from '../../types';

interface Props {
  companyId: string;
  /** When provided, the browser is scoped to a project's subtree: it starts
   *  inside this folder, hides the customer-root crumb, and treats this
   *  folder as the top of the visible tree. Used by the construction tracker
   *  to show only a single project's folders. */
  rootFolderId?: string;
  /** Section title — defaults to "Folders (new)". */
  title?: string;
  /** Section description — defaults to a generic explainer. */
  description?: string;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Read-only folder browser. Mounted on the CRM customer profile and on the
 *  construction tracker detail page (scoped to a single project via
 *  `rootFolderId`). Mutations come in PR 2.2. */
export default function FolderBrowser({
  companyId,
  rootFolderId,
  title = 'Folders (new)',
  description = 'Customer-rooted folder tree. Read-only preview; upload + create-folder come next.',
}: Props) {
  const { folders, loading: foldersLoading } = useFoldersByCompany(companyId);
  const { documents, loading: docsLoading } = useDocumentsByCompany(companyId);

  const scoped = !!rootFolderId;

  // Current path: an array of ancestor folder ids, ending in the visible folder.
  // Empty array = customer root (unscoped) OR project root not yet found (scoped).
  const [path, setPath] = useState<Folder[]>([]);
  const initializedRef = useRef(false);

  // Scoped mode: seed `path` once the project's root folder is in the loaded
  // folders list. The ref guard prevents this from re-seeding on subsequent
  // folder changes (e.g., a sibling folder being created elsewhere).
  useEffect(() => {
    if (!scoped || initializedRef.current) return;
    const root = folders.find((f) => f.id === rootFolderId);
    if (root) {
      setPath([root]);
      initializedRef.current = true;
    }
  }, [scoped, rootFolderId, folders]);

  const currentFolderId = path.length === 0 ? null : path[path.length - 1].id;

  const childFolders = useMemo(
    () =>
      folders
        .filter((f) => f.parentFolderId === currentFolderId)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [folders, currentFolderId],
  );

  const docsInFolder = useMemo(
    () => documents.filter((d) => d.folderId === currentFolderId),
    [documents, currentFolderId],
  );

  function enterFolder(folder: Folder) {
    setPath([...path, folder]);
  }
  function jumpToCrumb(index: number) {
    // In scoped mode the floor is the project root (index 0). In unscoped
    // mode index === -1 means "back to customer root".
    if (scoped) {
      setPath(path.slice(0, Math.max(index, 0) + 1));
    } else {
      setPath(index < 0 ? [] : path.slice(0, index + 1));
    }
  }

  async function openDoc(record: DocumentRecord) {
    try {
      const url = await getDocumentUrl(record);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('[FolderBrowser] failed to open doc', err);
      alert('Could not open this document. The file may have been moved.');
    }
  }

  const loading = foldersLoading || docsLoading;

  return (
    <section className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h3 className="font-heading font-semibold text-[#201F1E]">{title}</h3>
          <p className="text-xs text-[#7A756E] mt-0.5">{description}</p>
        </div>
      </div>

      {/* Breadcrumb */}
      <nav aria-label="Folder path" className="mb-4 flex items-center flex-wrap gap-x-1.5 text-sm">
        {!scoped && (
          <button
            onClick={() => jumpToCrumb(-1)}
            className={
              'font-medium transition ' +
              (path.length === 0
                ? 'text-[#201F1E] cursor-default'
                : 'text-[#7A756E] hover:text-[#ED202B]')
            }
            disabled={path.length === 0}
          >
            Root
          </button>
        )}
        {path.map((f, i) => (
          <Fragment key={f.id}>
            {(!scoped || i > 0) && (
              <span aria-hidden="true" className="text-[#D8D5D0] select-none">
                ›
              </span>
            )}
            <button
              onClick={() => jumpToCrumb(i)}
              className={
                'truncate max-w-[160px] font-medium transition ' +
                (i === path.length - 1
                  ? 'text-[#201F1E] cursor-default'
                  : 'text-[#7A756E] hover:text-[#ED202B]')
              }
              disabled={i === path.length - 1}
            >
              {f.name}
            </button>
          </Fragment>
        ))}
      </nav>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
        </div>
      ) : childFolders.length === 0 && docsInFolder.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#D8D5D0] py-10 text-center">
          <p className="text-sm text-[#7A756E]">This folder is empty.</p>
        </div>
      ) : (
        <>
          {/* Folder tiles */}
          {childFolders.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
              {childFolders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => enterFolder(f)}
                  className="group flex items-center gap-2.5 rounded-lg border border-[#D8D5D0] bg-white px-3 py-2.5 text-left hover:border-[#ED202B]/30 hover:shadow-sm transition"
                >
                  <FolderIcon />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-sm text-[#201F1E] group-hover:text-[#ED202B] truncate transition">
                      {f.name}
                    </span>
                    {f.systemRole && (
                      <span className="block text-[10px] uppercase tracking-wide text-[#7A756E]">
                        system
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Document rows */}
          {docsInFolder.length > 0 && (
            <ul className="divide-y divide-[#D8D5D0] border-t border-[#D8D5D0]">
              {docsInFolder.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() => openDoc(d)}
                    className="group w-full text-left py-2.5 flex items-center gap-3 hover:bg-stone-50 -mx-2 px-2 rounded-lg transition"
                  >
                    <DocIcon contentType={d.mimeType} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-sm text-[#201F1E] group-hover:text-[#ED202B] truncate transition">
                        {d.name}
                      </span>
                      <span className="block text-xs text-[#7A756E] truncate">
                        {formatSize(d.byteSize)} · {formatDate(d.uploadedAt)}
                        {d.legacyCategory ? ` · ${d.legacyCategory}` : ''}
                      </span>
                    </span>
                    <svg
                      className="h-4 w-4 text-[#7A756E] opacity-0 group-hover:opacity-100 group-hover:text-[#ED202B] transition shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function FolderIcon() {
  return (
    <svg
      className="h-5 w-5 text-[#ED202B] shrink-0"
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

function DocIcon({ contentType }: { contentType: string }) {
  const isImage = contentType.startsWith('image/');
  return (
    <svg
      className="h-5 w-5 text-[#7A756E] shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      {isImage ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.5" />
          <path d="M21 16l-5-5L8 19" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      )}
    </svg>
  );
}
