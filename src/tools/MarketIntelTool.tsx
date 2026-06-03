import { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useMarketFeed } from '../hooks/useMarketFeed';
import type { MarketFeedItem } from '../types';

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white px-3 py-2 text-sm transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none';

const SOURCE_LABELS: Record<MarketFeedItem['source'], string> = {
  gdelt: 'GDELT',
  rss: 'Trade press',
  'google-news': 'Google News',
};

function formatDate(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMw(mw?: number): string | null {
  if (mw === undefined) return null;
  if (mw >= 1000) return `${(mw / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} GW`;
  return `${mw.toLocaleString()} MW`;
}

function formatMoney(n?: number): string | null {
  if (n === undefined) return null;
  if (n >= 1e9) return `$${(n / 1e9).toLocaleString(undefined, { maximumFractionDigits: 1 })}B`;
  if (n >= 1e6) return `$${(n / 1e6).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
  return `$${n.toLocaleString()}`;
}

/** A cluster of articles about the same story (grouped by titleKey). */
interface Cluster {
  key: string;
  rep: MarketFeedItem; // newest item, used for display + tags
  ids: string[]; // every item id in the cluster (actions apply to all)
  sourceNames: string[]; // distinct publishers
  related: number; // count beyond the representative
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#ED202B]/10 px-2 py-0.5 text-xs font-medium text-[#9B0E18]">
      {children}
    </span>
  );
}

export default function MarketIntelTool() {
  const { items, loading, error, retry, setItemStatus } = useMarketFeed();

  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<MarketFeedItem['source'] | 'all'>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // States present in the data, for the filter dropdown.
  const states = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.usState && set.add(i.usState));
    return [...set].sort();
  }, [items]);

  const clusters = useMemo<Cluster[]>(() => {
    const needle = search.trim().toLowerCase();
    const filtered = items.filter((i) => {
      const status = i.status ?? 'new';
      if (status === 'archived' && !showArchived) return false;
      if (sourceFilter !== 'all' && i.source !== sourceFilter) return false;
      if (stateFilter !== 'all' && i.usState !== stateFilter) return false;
      if (needle) {
        const hay = `${i.title} ${i.summary ?? ''} ${i.sourceName}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const byKey = new Map<string, MarketFeedItem[]>();
    for (const item of filtered) {
      const k = item.titleKey || item.id;
      const arr = byKey.get(k);
      if (arr) arr.push(item);
      else byKey.set(k, [item]);
    }

    const out: Cluster[] = [];
    for (const [key, group] of byKey) {
      group.sort((a, b) => b.publishedAt - a.publishedAt);
      const rep = group[0];
      const sourceNames = [...new Set(group.map((g) => g.sourceName))];
      out.push({ key, rep, ids: group.map((g) => g.id), sourceNames, related: group.length - 1 });
    }
    out.sort((a, b) => b.rep.publishedAt - a.rep.publishedAt);
    return out;
  }, [items, search, sourceFilter, stateFilter, showArchived]);

  // Apply a status to every item in the cluster. Surfaces failures (offline /
  // permission) instead of letting the promise reject unhandled and silently
  // leaving the row unchanged.
  const setClusterStatus = async (c: Cluster, status: MarketFeedItem['status']) => {
    setActionError(null);
    try {
      await Promise.all(c.ids.map((id) => setItemStatus(id, status)));
    } catch {
      setActionError("Couldn't update that item — check your connection and try again.");
    }
  };

  return (
    <Layout>
      <main className="py-6 space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-[#201F1E]">Market Intelligence</h1>
          <p className="mt-1 text-sm text-[#7A756E]">
            Live feed of US data-center deal news — auto-collected from GDELT, trade press, and
            Google News. {clusters.length} stories.
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-[#7A756E] mb-1">Search</label>
              <input
                className={inputClass}
                placeholder="Filter by keyword, company, place…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-44">
              <label className="block text-xs font-medium text-[#7A756E] mb-1">Source</label>
              <select
                className={inputClass}
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as MarketFeedItem['source'] | 'all')}
              >
                <option value="all">All sources</option>
                <option value="gdelt">GDELT</option>
                <option value="rss">Trade press</option>
                <option value="google-news">Google News</option>
              </select>
            </div>
            <div className="w-full sm:w-36">
              <label className="block text-xs font-medium text-[#7A756E] mb-1">State</label>
              <select
                className={inputClass}
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
              >
                <option value="all">All states</option>
                {states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-[#7A756E] pb-2">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="h-4 w-4 accent-[#ED202B] cursor-pointer"
              />
              Show archived
            </label>
          </div>
        </div>

        {actionError && (
          <div className="rounded-xl border border-[#ED202B]/30 bg-[#ED202B]/5 px-4 py-2 text-sm text-[#9B0E18]">
            {actionError}
          </div>
        )}

        {/* Feed */}
        {error ? (
          <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-8 text-center space-y-3">
            <p className="text-sm text-[#ED202B]">Couldn’t load the feed: {error}</p>
            <button
              onClick={retry}
              className="inline-flex items-center rounded-lg bg-[#ED202B] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#9B0E18]"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <p className="text-sm text-[#7A756E]">Loading…</p>
        ) : clusters.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-8 text-center text-sm text-[#7A756E]">
            No deals match your filters yet. The listener refreshes every few hours.
          </div>
        ) : (
          <ul className="space-y-3">
            {clusters.map((c) => {
              const { rep } = c;
              const status = rep.status ?? 'new';
              const mw = formatMw(rep.mwMentioned);
              const money = formatMoney(rep.dollarsMentioned);
              return (
                <li
                  key={c.key}
                  className={`bg-white rounded-xl shadow-sm border border-[#D8D5D0] px-4 py-3 transition ${
                    status === 'read' || status === 'archived' ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <a
                        href={rep.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-heading font-semibold text-sm text-[#201F1E] hover:text-[#ED202B] transition"
                      >
                        {rep.title}
                      </a>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#7A756E]">
                        <span>{c.sourceNames.slice(0, 2).join(', ')}</span>
                        <span>·</span>
                        <span>{SOURCE_LABELS[rep.source]}</span>
                        <span>·</span>
                        <span>{formatDate(rep.publishedAt)}</span>
                        {c.related > 0 && (
                          <>
                            <span>·</span>
                            <span>+{c.related} related</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {status !== 'read' && status !== 'archived' && (
                        <button
                          onClick={() => setClusterStatus(c, 'read')}
                          className="text-xs font-medium text-[#7A756E] hover:text-[#ED202B] transition"
                        >
                          Mark read
                        </button>
                      )}
                      {status === 'archived' ? (
                        <button
                          onClick={() => setClusterStatus(c, 'new')}
                          className="text-xs font-medium text-[#7A756E] hover:text-[#ED202B] transition"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          onClick={() => setClusterStatus(c, 'archived')}
                          className="text-xs font-medium text-[#7A756E] hover:text-[#ED202B] transition"
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </div>

                  {(rep.usState || mw || money) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {rep.usState && <Tag>{rep.usState}</Tag>}
                      {mw && <Tag>{mw}</Tag>}
                      {money && <Tag>{money}</Tag>}
                    </div>
                  )}

                  {rep.summary && (
                    <p className="mt-2 text-xs text-[#7A756E] line-clamp-2">{rep.summary}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </Layout>
  );
}
