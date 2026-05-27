import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import ArchiveIcon from '../icons/ArchiveIcon';
import type { Company, PreConSite } from '../../types';

/** Defense-in-depth: only render an `<a href>` for URLs we can parse AND that
 *  carry an `http:` or `https:` scheme. Stops `javascript:` / `data:` etc.
 *  from sneaking through if they bypass the save-time validator (legacy data,
 *  direct Firestore edit, future migration). */
function safeExternalHref(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
  } catch {
    /* not a valid URL */
  }
  return null;
}

interface Props {
  site: PreConSite;
  company: Company | null;
  canManageSite: boolean;
  onSave: (updates: { name?: string; utilityPlatformUrl?: string }) => Promise<void>;
  onArchive: () => void;
}

export default function PreConHeader({
  site,
  company,
  canManageSite,
  onSave,
  onArchive,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(site.name);
  const [utilityUrl, setUtilityUrl] = useState<string>(site.utilityPlatformUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(site.name);
    setUtilityUrl(site.utilityPlatformUrl ?? '');
  }, [site.name, site.utilityPlatformUrl]);

  const dirty =
    name.trim() !== site.name || utilityUrl.trim() !== (site.utilityPlatformUrl ?? '');

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Site name cannot be empty.');
      return;
    }
    const trimmedUrl = utilityUrl.trim();
    if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) {
      setError('URL must start with http:// or https://');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: trimmed, utilityPlatformUrl: trimmedUrl });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setName(site.name);
    setUtilityUrl(site.utilityPlatformUrl ?? '');
    setError(null);
    setEditing(false);
  }

  // ── Edit mode ──────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
        <div className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-[#7A756E] font-medium mb-1">
              Site name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 transition disabled:bg-[#FAFAF9]"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-[#7A756E] font-medium mb-1">
              Customer
            </label>
            <div className="text-sm text-[#201F1E] px-3 py-2 bg-[#FAFAF9] border border-[#D8D5D0] rounded-lg">
              {company?.name ?? 'No customer linked'}
            </div>
            <p className="text-xs text-[#7A756E] mt-1">
              Customer reassignment is locked — folder ownership + the linked project record would
              orphan. Coming in a future release.
            </p>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-[#7A756E] font-medium mb-1">
              Utility platform URL{' '}
              <span className="normal-case text-[#7A756E]">(optional)</span>
            </label>
            <input
              type="url"
              value={utilityUrl}
              onChange={(e) => setUtilityUrl(e.target.value)}
              disabled={saving}
              placeholder="https://utility.example.com/project/123"
              className="w-full px-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 transition disabled:bg-[#FAFAF9]"
            />
          </div>
          <div className="text-xs text-[#7A756E]">
            Coordinates: {site.coordinates.lat.toFixed(5)}, {site.coordinates.lng.toFixed(5)}{' '}
            <span className="italic">(not editable)</span>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-[#ED202B]" role="alert">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={onArchive} disabled={saving}>
            <ArchiveIcon className="h-3.5 w-3.5" />
            Archive
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── View mode ──────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-xl sm:text-2xl font-semibold text-[#201F1E] break-words">
            {site.name}
          </h1>
          <div className="text-xs sm:text-sm text-[#7A756E] mt-1">
            {company ? (
              <Link
                to={`/crm/companies/${company.id}`}
                className="font-medium text-[#201F1E] hover:text-[#ED202B] hover:underline"
              >
                {company.name}
              </Link>
            ) : (
              'No company linked'
            )}
            <> · {site.coordinates.lat.toFixed(5)}, {site.coordinates.lng.toFixed(5)}</>
          </div>
          {(() => {
            const safeHref = safeExternalHref(site.utilityPlatformUrl);
            if (safeHref) {
              return (
                <div className="text-xs sm:text-sm mt-1">
                  <a
                    href={safeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#ED202B] hover:underline"
                  >
                    Access utility platform
                  </a>
                </div>
              );
            }
            if (canManageSite) {
              return (
                <div className="text-xs sm:text-sm mt-1">
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="text-[#7A756E] hover:text-[#ED202B] hover:underline transition"
                  >
                    + Add a link
                  </button>
                </div>
              );
            }
            return null;
          })()}
        </div>
        {canManageSite && <Button onClick={() => setEditing(true)}>Edit</Button>}
      </div>
    </div>
  );
}
