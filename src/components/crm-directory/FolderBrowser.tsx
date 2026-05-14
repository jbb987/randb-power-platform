import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useFoldersByCompany } from '../../hooks/useFolders';
import { useDocumentsByCompany } from '../../hooks/useDocumentRecords';
import {
  archiveFolder,
  createFolder,
  deriveAncestorFolderIds,
  updateFolder,
} from '../../lib/folders';
import {
  ACCEPTED_DOCUMENT_MIME,
  archiveDocument,
  getDocumentUrl,
  MAX_DOCUMENT_BYTES,
  updateDocumentRecord,
  uploadDocument,
} from '../../lib/documentRecords';
import type { DocumentRecord, Folder } from '../../types';

interface Props {
  companyId: string;
  /** When provided, the browser is scoped to a project's subtree: it starts
   *  inside this folder, hides the customer-root crumb, and treats this
   *  folder as the top of the visible tree. Used by the construction tracker
   *  to show only a single project's folders. */
  rootFolderId?: string;
  /** Optional project id to stamp on newly created folders/docs so they're
   *  bound to the project as well as the customer. */
  projectId?: string;
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

type RenameTarget = { kind: 'folder'; folder: Folder } | { kind: 'doc'; doc: DocumentRecord };
type ArchiveTarget = { kind: 'folder'; folder: Folder } | { kind: 'doc'; doc: DocumentRecord };

export default function FolderBrowser({
  companyId,
  rootFolderId,
  projectId,
  title = 'Folders (new)',
  description = 'Customer-rooted folder tree.',
}: Props) {
  const { user } = useAuth();
  const { folders, loading: foldersLoading } = useFoldersByCompany(companyId);
  const { documents, loading: docsLoading } = useDocumentsByCompany(companyId);

  const scoped = !!rootFolderId;

  const [path, setPath] = useState<Folder[]>([]);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!scoped || initializedRef.current) return;
    const root = folders.find((f) => f.id === rootFolderId);
    if (root) {
      setPath([root]);
      initializedRef.current = true;
    }
  }, [scoped, rootFolderId, folders]);

  const currentFolder = path.length === 0 ? null : path[path.length - 1];
  const currentFolderId = currentFolder?.id ?? null;

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

  // ── Mutations ─────────────────────────────────────────────────────────

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // 'creating' | 'uploading' | 'renaming' | 'archiving'
  const [error, setError] = useState<string | null>(null);

  async function handleCreateFolder() {
    if (!user) return;
    const name = newFolderName.trim();
    if (!name) return;
    setBusy('creating');
    setError(null);
    try {
      await createFolder(
        {
          companyId,
          ...(projectId ? { projectId } : {}),
          parentFolderId: currentFolderId,
          name,
          kind: 'user',
          createdBy: user.uid,
        },
        currentFolder,
      );
      setNewFolderName('');
      setShowNewFolder(false);
    } catch (err) {
      console.error('[FolderBrowser] createFolder failed', err);
      setError(err instanceof Error ? err.message : 'Could not create folder.');
    } finally {
      setBusy(null);
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0 || !user) return;
    setBusy('uploading');
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await uploadDocument({
          file,
          companyId,
          ...(projectId ? { projectId } : {}),
          folder: currentFolder,
          uploadedBy: user.uid,
        });
      }
    } catch (err) {
      console.error('[FolderBrowser] upload failed', err);
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const [renaming, setRenaming] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState('');

  function openRename(target: RenameTarget) {
    setRenaming(target);
    setRenameValue(target.kind === 'folder' ? target.folder.name : target.doc.name);
  }
  async function handleRename() {
    if (!user || !renaming) return;
    const name = renameValue.trim();
    if (!name) return;
    setBusy('renaming');
    setError(null);
    try {
      if (renaming.kind === 'folder') {
        await updateFolder(renaming.folder.id, { name }, user.uid);
      } else {
        await updateDocumentRecord(renaming.doc.id, { name }, user.uid);
      }
      setRenaming(null);
      setRenameValue('');
    } catch (err) {
      console.error('[FolderBrowser] rename failed', err);
      setError(err instanceof Error ? err.message : 'Rename failed.');
    } finally {
      setBusy(null);
    }
  }

  const [archiving, setArchiving] = useState<ArchiveTarget | null>(null);

  async function handleArchive() {
    if (!user || !archiving) return;
    setBusy('archiving');
    setError(null);
    try {
      if (archiving.kind === 'folder') {
        await archiveFolder(archiving.folder.id, user.uid);
      } else {
        await archiveDocument(archiving.doc.id, user.uid);
      }
      setArchiving(null);
    } catch (err) {
      console.error('[FolderBrowser] archive failed', err);
      setError(err instanceof Error ? err.message : 'Archive failed.');
    } finally {
      setBusy(null);
    }
  }

  const loading = foldersLoading || docsLoading;
  const canMutate = !!user;
  // In scoped mode we don't yet have the project root in `path` until folders
  // load — disable mutations until the root is resolved, since `currentFolder`
  // is the wrong target otherwise.
  const ready = !scoped || path.length > 0;

  return (
    <section className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h3 className="font-heading font-semibold text-[#201F1E]">{title}</h3>
          <p className="text-xs text-[#7A756E] mt-0.5">{description}</p>
        </div>
        {canMutate && ready && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowNewFolder(true)}
              disabled={busy !== null}
              className="text-sm font-medium text-[#ED202B] border border-[#ED202B] px-3 py-1.5 rounded-lg hover:bg-[#ED202B]/5 transition disabled:opacity-50"
            >
              + New folder
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy !== null}
              className="text-sm font-medium text-white bg-[#ED202B] hover:bg-[#9B0E18] px-3 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              {busy === 'uploading' ? 'Uploading…' : '+ Upload'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_DOCUMENT_MIME.join(',')}
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-[#ED202B]/30 bg-[#ED202B]/5 p-2 text-xs text-[#ED202B]">
          {error}
        </div>
      )}

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
          <p className="text-sm text-[#7A756E]">
            This folder is empty.{' '}
            {canMutate && ready && (
              <button
                onClick={() => setShowNewFolder(true)}
                className="font-medium text-[#ED202B] hover:underline"
              >
                Create one
              </button>
            )}
          </p>
        </div>
      ) : (
        <>
          {/* Folder tiles */}
          {childFolders.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
              {childFolders.map((f) => (
                <FolderTile
                  key={f.id}
                  folder={f}
                  onOpen={() => enterFolder(f)}
                  onRename={canMutate ? () => openRename({ kind: 'folder', folder: f }) : undefined}
                  onArchive={canMutate ? () => setArchiving({ kind: 'folder', folder: f }) : undefined}
                />
              ))}
            </div>
          )}

          {/* Document rows */}
          {docsInFolder.length > 0 && (
            <ul className="divide-y divide-[#D8D5D0] border-t border-[#D8D5D0]">
              {docsInFolder.map((d) => (
                <DocRow
                  key={d.id}
                  doc={d}
                  onOpen={() => openDoc(d)}
                  onRename={canMutate ? () => openRename({ kind: 'doc', doc: d }) : undefined}
                  onArchive={canMutate ? () => setArchiving({ kind: 'doc', doc: d }) : undefined}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {/* New folder modal */}
      {showNewFolder && (
        <Modal onClose={() => !busy && setShowNewFolder(false)}>
          <h4 className="font-heading font-semibold text-[#201F1E] mb-3">New folder</h4>
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            autoFocus
            placeholder="Folder name"
            className="w-full rounded-lg border border-[#D8D5D0] px-3 py-2 text-sm text-[#201F1E] focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={() => setShowNewFolder(false)}
              disabled={busy === 'creating'}
              className="text-sm font-medium text-[#7A756E] hover:text-[#201F1E] px-3 py-1.5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || busy === 'creating'}
              className="text-sm font-medium text-white bg-[#ED202B] hover:bg-[#9B0E18] px-3 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              {busy === 'creating' ? 'Creating…' : 'Create folder'}
            </button>
          </div>
        </Modal>
      )}

      {/* Rename modal */}
      {renaming && (
        <Modal onClose={() => !busy && setRenaming(null)}>
          <h4 className="font-heading font-semibold text-[#201F1E] mb-3">
            Rename {renaming.kind === 'folder' ? 'folder' : 'document'}
          </h4>
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            autoFocus
            className="w-full rounded-lg border border-[#D8D5D0] px-3 py-2 text-sm text-[#201F1E] focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={() => setRenaming(null)}
              disabled={busy === 'renaming'}
              className="text-sm font-medium text-[#7A756E] hover:text-[#201F1E] px-3 py-1.5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleRename}
              disabled={!renameValue.trim() || busy === 'renaming'}
              className="text-sm font-medium text-white bg-[#ED202B] hover:bg-[#9B0E18] px-3 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              {busy === 'renaming' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {/* Archive confirm */}
      {archiving && (
        <Modal onClose={() => !busy && setArchiving(null)}>
          <h4 className="font-heading font-semibold text-[#201F1E] mb-2">
            Archive {archiving.kind === 'folder' ? 'folder' : 'document'}?
          </h4>
          <p className="text-sm text-[#7A756E] mb-4">
            “{archiving.kind === 'folder' ? archiving.folder.name : archiving.doc.name}” will
            disappear from this view. Nothing is deleted — it can be restored from Trash later.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setArchiving(null)}
              disabled={busy === 'archiving'}
              className="text-sm font-medium text-[#7A756E] hover:text-[#201F1E] px-3 py-1.5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleArchive}
              disabled={busy === 'archiving'}
              className="text-sm font-medium text-white bg-[#ED202B] hover:bg-[#9B0E18] px-3 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              {busy === 'archiving' ? 'Archiving…' : 'Archive'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

// Silence unused-import warning — exported helper from `folders` lib reused below
// by future PR 2.2B (move) so we keep it available.
void deriveAncestorFolderIds;
void MAX_DOCUMENT_BYTES;

// ── Sub-components ─────────────────────────────────────────────────────

function FolderTile({
  folder,
  onOpen,
  onRename,
  onArchive,
}: {
  folder: Folder;
  onOpen: () => void;
  onRename?: () => void;
  onArchive?: () => void;
}) {
  return (
    <div className="group relative flex items-center gap-2.5 rounded-lg border border-[#D8D5D0] bg-white px-3 py-2.5 hover:border-[#ED202B]/30 hover:shadow-sm transition">
      <button onClick={onOpen} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
        <FolderIcon />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-sm text-[#201F1E] group-hover:text-[#ED202B] truncate transition">
            {folder.name}
          </span>
          {folder.systemRole && (
            <span className="block text-[10px] uppercase tracking-wide text-[#7A756E]">
              system
            </span>
          )}
        </span>
      </button>
      {(onRename || onArchive) && (
        <KebabMenu onRename={onRename} onArchive={onArchive} />
      )}
    </div>
  );
}

function DocRow({
  doc,
  onOpen,
  onRename,
  onArchive,
}: {
  doc: DocumentRecord;
  onOpen: () => void;
  onRename?: () => void;
  onArchive?: () => void;
}) {
  return (
    <li>
      <div className="group flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-lg hover:bg-stone-50 transition">
        <button onClick={onOpen} className="flex items-center gap-3 min-w-0 flex-1 text-left">
          <DocIcon contentType={doc.mimeType} />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-sm text-[#201F1E] group-hover:text-[#ED202B] truncate transition">
              {doc.name}
            </span>
            <span className="block text-xs text-[#7A756E] truncate">
              {formatSize(doc.byteSize)} · {formatDate(doc.uploadedAt)}
              {doc.legacyCategory ? ` · ${doc.legacyCategory}` : ''}
            </span>
          </span>
        </button>
        {(onRename || onArchive) && (
          <KebabMenu onRename={onRename} onArchive={onArchive} />
        )}
      </div>
    </li>
  );
}

function KebabMenu({ onRename, onArchive }: { onRename?: () => void; onArchive?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="h-7 w-7 rounded-md flex items-center justify-center text-[#7A756E] hover:text-[#ED202B] hover:bg-stone-100 transition"
        aria-label="More actions"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 5v.01M12 12v.01M12 19v.01"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-10 min-w-[140px] rounded-lg border border-[#D8D5D0] bg-white shadow-md py-1">
          {onRename && (
            <button
              onClick={() => {
                setOpen(false);
                onRename();
              }}
              className="block w-full text-left text-sm text-[#201F1E] px-3 py-1.5 hover:bg-stone-50"
            >
              Rename
            </button>
          )}
          {onArchive && (
            <button
              onClick={() => {
                setOpen(false);
                onArchive();
              }}
              className="block w-full text-left text-sm text-[#ED202B] px-3 py-1.5 hover:bg-stone-50"
            >
              Archive
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
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
