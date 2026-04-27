import { useState, useMemo, useEffect, useRef } from 'react';
import type { LandComp, FilteredCompResult } from '../../types';
import { parseLandCompsCsv, filterComps, computeCompStats, CLAUDE_LANDID_PROMPT } from '../../utils/landComps';

interface Props {
  comps: LandComp[];
  onCompsChange: (comps: LandComp[]) => void;
  subjectAcres: number;
  onFilteredChange: (result: FilteredCompResult) => void;
}

const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function LandCompsPanel({ comps, onCompsChange, subjectAcres, onFilteredChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [csvInput, setCsvInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);

  const filterResult = useMemo(() => filterComps(comps, subjectAcres), [comps, subjectAcres]);

  // Notify parent when filtered median changes (including drop to 0 on clear)
  const prevMedianRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevMedianRef.current !== filterResult.medianPricePerAcre) {
      prevMedianRef.current = filterResult.medianPricePerAcre;
      onFilteredChange(filterResult);
    }
  }, [filterResult, onFilteredChange]);

  const activeStats = useMemo(() => computeCompStats(filterResult.active), [filterResult.active]);

  function handleParse() {
    setParseError(null);
    try {
      const parsed = parseLandCompsCsv(csvInput);
      if (parsed.length === 0) {
        setParseError('No valid rows found. Make sure the CSV has a header row and at least one data row with a sale price.');
        return;
      }
      onCompsChange([...comps, ...parsed]);
      setCsvInput('');
    } catch {
      setParseError('Failed to parse CSV. Check the format and try again.');
    }
  }

  function handleDelete(id: string) {
    onCompsChange(comps.filter((c) => c.id !== id));
  }

  function handleClearAll() {
    onCompsChange([]);
    // Don't reset prevMedianRef here — let the useEffect detect the change to 0
  }

  function handleToggleComp(id: string) {
    onCompsChange(
      comps.map((c) => {
        if (c.id !== id) return c;
        const isCurrentlyExcluded = filterResult.excluded.some((e) => e.id === id);
        return { ...c, manualOverride: true, excluded: !isCurrentlyExcluded };
      }),
    );
  }

  function handleAddRow() {
    onCompsChange([
      ...comps,
      {
        id: crypto.randomUUID(),
        address: '',
        county: '',
        saleDate: '',
        totalPrice: 0,
        acres: 0,
        pricePerAcre: 0,
        landUse: '',
        parcelId: '',
      },
    ]);
  }

  function handleCellEdit(id: string, field: keyof LandComp, value: string) {
    onCompsChange(
      comps.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, [field]: value };
        if (field === 'totalPrice' || field === 'acres') {
          const tp = field === 'totalPrice' ? parseFloat(value) || 0 : c.totalPrice;
          const ac = field === 'acres' ? parseFloat(value) || 0 : c.acres;
          updated.totalPrice = tp;
          updated.acres = ac;
          updated.pricePerAcre = ac > 0 ? tp / ac : 0;
        } else if (field === 'pricePerAcre') {
          updated.pricePerAcre = parseFloat(value) || 0;
        }
        return updated;
      }),
    );
  }

  async function handleCopyPrompt() {
    await navigator.clipboard.writeText(CLAUDE_LANDID_PROMPT);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }

  // Build display list: active first, then excluded
  const allDisplay = [...filterResult.active, ...filterResult.excluded];

  return (
    <div>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left group"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-[#7A756E] transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-[#201F1E]">Land Comps</span>
          {comps.length > 0 && (
            <span className="text-[10px] font-medium bg-[#ED202B]/10 text-[#ED202B] rounded-full px-2 py-0.5">
              {filterResult.activeCount} of {filterResult.totalCount}
            </span>
          )}
        </div>
        {comps.length > 0 && !expanded && (
          <span className="text-xs text-[#7A756E]">
            Median: {fmt$(filterResult.medianPricePerAcre)}/ac
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Copy prompt + paste zone */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyPrompt}
                className="text-[11px] text-[#ED202B] hover:text-[#9B0E18] font-medium transition"
              >
                {promptCopied ? 'Copied!' : 'Copy Claude Prompt'}
              </button>
              <span className="text-[10px] text-[#7A756E]">Upload LandID PDF to Claude, paste the CSV output below</span>
            </div>
            <textarea
              value={csvInput}
              onChange={(e) => setCsvInput(e.target.value)}
              placeholder="Paste CSV from Claude here..."
              rows={4}
              className="w-full rounded-lg border border-[#D8D5D0] px-3 py-2 text-xs text-[#201F1E] placeholder:text-[#7A756E]/50 focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 outline-none resize-none font-mono"
            />
            {parseError && (
              <p className="text-xs text-red-600">{parseError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleParse}
                disabled={!csvInput.trim()}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#ED202B] text-white hover:bg-[#9B0E18] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Parse & Add
              </button>
              <button
                onClick={handleAddRow}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[#D8D5D0] text-[#7A756E] hover:border-[#ED202B] hover:text-[#ED202B] transition"
              >
                + Add Row
              </button>
              {comps.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg text-[#7A756E] hover:text-red-600 transition ml-auto"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          {comps.length > 0 && (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-[#7A756E] border-b border-[#D8D5D0]/60">
                    <th className="py-2 px-1 w-6" />
                    <th className="text-left py-2 px-1 font-medium">Address</th>
                    <th className="text-left py-2 px-1 font-medium">Date</th>
                    <th className="text-right py-2 px-1 font-medium">Acres</th>
                    <th className="text-right py-2 px-1 font-medium">Price</th>
                    <th className="text-right py-2 px-1 font-medium">$/Acre</th>
                    <th className="text-left py-2 px-1 font-medium">Use</th>
                    <th className="text-right py-2 px-1 font-medium w-10">Score</th>
                    <th className="py-2 px-1 w-6" />
                  </tr>
                </thead>
                <tbody>
                  {allDisplay.map((c) => {
                    const isExcluded = c.excluded === true;
                    return (
                      <tr
                        key={c.id}
                        className={`border-b border-[#D8D5D0]/30 ${isExcluded ? 'opacity-40' : 'hover:bg-stone-50/50'}`}
                      >
                        <td className="py-1.5 px-1">
                          <button
                            onClick={() => handleToggleComp(c.id)}
                            className={`w-4 h-4 rounded border flex items-center justify-center transition ${
                              isExcluded
                                ? 'border-[#D8D5D0] text-transparent hover:border-[#ED202B]'
                                : 'border-[#ED202B] bg-[#ED202B] text-white'
                            }`}
                            title={isExcluded ? 'Include in calculation' : 'Exclude from calculation'}
                          >
                            {!isExcluded && (
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </button>
                        </td>
                        <td className="py-1.5 px-1">
                          <input
                            value={c.address}
                            onChange={(e) => handleCellEdit(c.id, 'address', e.target.value)}
                            className={`w-full bg-transparent outline-none min-w-[140px] ${isExcluded ? 'line-through text-[#7A756E]' : 'text-[#201F1E]'}`}
                          />
                        </td>
                        <td className="py-1.5 px-1">
                          <input
                            value={c.saleDate}
                            onChange={(e) => handleCellEdit(c.id, 'saleDate', e.target.value)}
                            className={`w-full bg-transparent outline-none min-w-[80px] ${isExcluded ? 'line-through text-[#7A756E]' : 'text-[#201F1E]'}`}
                          />
                        </td>
                        <td className="py-1.5 px-1 text-right">
                          <input
                            value={c.acres || ''}
                            onChange={(e) => handleCellEdit(c.id, 'acres', e.target.value)}
                            className={`w-full bg-transparent outline-none text-right min-w-[50px] ${isExcluded ? 'line-through text-[#7A756E]' : 'text-[#201F1E]'}`}
                          />
                        </td>
                        <td className="py-1.5 px-1 text-right">
                          <input
                            value={c.totalPrice || ''}
                            onChange={(e) => handleCellEdit(c.id, 'totalPrice', e.target.value)}
                            className={`w-full bg-transparent outline-none text-right min-w-[70px] ${isExcluded ? 'line-through text-[#7A756E]' : 'text-[#201F1E]'}`}
                          />
                        </td>
                        <td className={`py-1.5 px-1 text-right font-medium ${isExcluded ? 'line-through text-[#7A756E]' : 'text-[#201F1E]'}`}>
                          {c.pricePerAcre > 0 ? fmt$(c.pricePerAcre) : '--'}
                        </td>
                        <td className="py-1.5 px-1">
                          <input
                            value={c.landUse}
                            onChange={(e) => handleCellEdit(c.id, 'landUse', e.target.value)}
                            className={`w-full bg-transparent outline-none min-w-[60px] ${isExcluded ? 'line-through text-[#7A756E]' : 'text-[#7A756E]'}`}
                          />
                        </td>
                        <td className="py-1.5 px-1 text-right">
                          <span className="text-[10px] text-[#7A756E] tabular-nums">{Math.round(c.score ?? 0)}</span>
                        </td>
                        <td className="py-1.5 px-1">
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="text-[#7A756E] hover:text-red-500 transition"
                            title="Remove comp"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Warnings */}
          {filterResult.warnings.length > 0 && (
            <div className="space-y-1">
              {filterResult.warnings.map((w, i) => (
                <p key={i} className="text-[11px] text-amber-600 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  {w}
                </p>
              ))}
            </div>
          )}

          {/* Stats bar */}
          {activeStats.count >= 2 && (
            <div>
              <p className="text-[10px] text-[#7A756E] mb-2">
                Based on {filterResult.activeCount} of {filterResult.totalCount} comparable sales
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  ['Count', String(activeStats.count)],
                  ['Median', fmt$(activeStats.median)],
                  ['Min', fmt$(activeStats.min)],
                  ['Max', fmt$(activeStats.max)],
                ] as const).map(([label, value]) => (
                  <div key={label} className="bg-stone-50 rounded-lg px-2.5 py-2 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-[#7A756E] font-medium">{label}</div>
                    <div className="text-sm font-semibold text-[#201F1E] tabular-nums">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
