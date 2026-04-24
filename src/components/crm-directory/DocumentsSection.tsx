import { useMemo, useRef, useState } from 'react';
import {
  ACCEPTED_DOCUMENT_MIME,
  ALL_DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  type CrmDocument,
  type DocumentCategory,
} from '../../types';
import { useCompanyDocuments } from '../../hooks/useDocuments';

interface Props {
  companyId: string;
  defaultCategory?: DocumentCategory;
}

function formatSize(bytes: number): string {
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

function isImage(doc: CrmDocument): boolean {
  return doc.contentType.startsWith('image/');
}

function isPdf(doc: CrmDocument): boolean {
  return doc.contentType === 'application/pdf';
}

export default function DocumentsSection({ companyId, defaultCategory = 'legal' }: Props) {
  const { documents, loading, upload, remove, openUrl } = useCompanyDocuments(companyId);
  const [activeCategory, setActiveCategory] = useState<DocumentCategory>(defaultCategory);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ doc: CrmDocument; url: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => documents.filter((d) => d.category === activeCategory),
    [documents, activeCategory],
  );

  const countsByCategory = useMemo(() => {
    const counts: Partial<Record<DocumentCategory, number>> = {};
    documents.forEach((d) => {
      counts[d.category] = (counts[d.category] ?? 0) + 1;
    });
    return counts;
  }, [documents]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        await upload(file, activeCategory);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleOpen(doc: CrmDocument) {
    try {
      const url = await openUrl(doc);
      if (isPdf(doc) || isImage(doc)) {
        setPreview({ doc, url });
      } else {
        window.open(url, '_blank');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open file');
    }
  }

  async function handleDownload(doc: CrmDocument) {
    try {
      const url = await openUrl(doc);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  }

  async function handleDelete(doc: CrmDocument) {
    const ok = window.confirm(`Delete "${doc.name}"? This is permanent.`);
    if (!ok) return;
    try {
      await remove(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <section className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-heading font-semibold text-[#201F1E]">Documents</h3>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 bg-[#ED202B] text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-[#9B0E18] transition disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_DOCUMENT_MIME.join(',')}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4 -mx-0.5">
        {ALL_DOCUMENT_CATEGORIES.map((cat) => {
          const active = activeCategory === cat;
          const count = countsByCategory[cat] ?? 0;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition ${
                active
                  ? 'bg-[#ED202B] text-white border-[#ED202B]'
                  : 'bg-white text-[#7A756E] border-[#D8D5D0] hover:border-[#ED202B]/50'
              }`}
            >
              {DOCUMENT_CATEGORY_LABELS[cat]}
              {count > 0 && <span className={`ml-1 ${active ? 'text-white/80' : 'text-[#7A756E]'}`}>· {count}</span>}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 text-sm text-[#ED202B] bg-[#ED202B]/5 border border-[#ED202B]/30 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm text-[#7A756E]">
          No {DOCUMENT_CATEGORY_LABELS[activeCategory].toLowerCase()} yet. Click <span className="font-medium text-[#201F1E]">Upload</span> to add one.
        </div>
      ) : (
        <ul className="divide-y divide-[#D8D5D0]">
          {filtered.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              onOpen={() => handleOpen(doc)}
              onDownload={() => handleDownload(doc)}
              onDelete={() => handleDelete(doc)}
            />
          ))}
        </ul>
      )}

      {preview && <PreviewModal preview={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}

function DocumentRow({
  doc,
  onOpen,
  onDownload,
  onDelete,
}: {
  doc: CrmDocument;
  onOpen: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="py-3 flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-[#ED202B]/10 flex items-center justify-center shrink-0">
        {isImage(doc) ? (
          <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ) : isPdf(doc) ? (
          <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ) : (
          <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
      </div>

      <button onClick={onOpen} className="flex-1 min-w-0 text-left hover:text-[#ED202B] transition">
        <div className="font-medium text-[#201F1E] truncate">{doc.name}</div>
        <div className="text-xs text-[#7A756E] mt-0.5 truncate">
          {formatSize(doc.sizeBytes)} · {formatDate(doc.uploadedAt)} · {doc.uploadedByName}
        </div>
      </button>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onDownload}
          aria-label="Download"
          className="h-8 w-8 rounded-lg text-[#7A756E] hover:text-[#ED202B] hover:bg-[#ED202B]/5 flex items-center justify-center transition"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
          </svg>
        </button>
        <button
          onClick={onDelete}
          aria-label="Delete"
          className="h-8 w-8 rounded-lg text-[#7A756E] hover:text-[#ED202B] hover:bg-[#ED202B]/5 flex items-center justify-center transition"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V4a1 1 0 011-1h6a1 1 0 011 1v3" />
          </svg>
        </button>
      </div>
    </li>
  );
}

function PreviewModal({
  preview,
  onClose,
}: {
  preview: { doc: CrmDocument; url: string };
  onClose: () => void;
}) {
  const { doc, url } = preview;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex flex-col items-stretch"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#201F1E] text-white">
        <div className="truncate font-medium text-sm">{doc.name}</div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="h-8 w-8 rounded-lg hover:bg-white/10 flex items-center justify-center shrink-0"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {isImage(doc) ? (
          <div className="h-full w-full flex items-center justify-center p-4">
            <img src={url} alt={doc.name} className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <iframe src={url} title={doc.name} className="h-full w-full bg-white" />
        )}
      </div>
    </div>
  );
}
