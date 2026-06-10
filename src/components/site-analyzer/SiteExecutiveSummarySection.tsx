import { Fragment, useMemo } from 'react';
import type { SiteRegistryEntry } from '../../types';
import {
  buildExecutiveSummaryModel,
  type ExecutiveSummaryModel,
  type SummarySection,
  type ValuationViz,
} from '../../lib/executiveSummary';
import { formatCurrencyShort } from '../../utils/format';
import { useExecutiveSummaryPdfExport } from '../../hooks/useExecutiveSummaryPdfExport';

interface Props {
  site: SiteRegistryEntry;
  companyName: string | null;
}

/** Left-aligned cumulative-MW bar chart. Fixed-width bars so a single-year
 *  ramp stays tidy. Only the cumulative MW is labelled (no duplicate added). */
function RampChart({ model }: { model: ExecutiveSummaryModel }) {
  const { ramp, targetMW } = model;
  if (ramp.length === 0) {
    return <p className="text-sm text-[#7A756E]">Set a MW target to generate the ramp.</p>;
  }
  // Explicit pixel heights — percentage heights inside nested flex don't
  // resolve reliably and collapse all bars to the same minimum.
  const MAX_BAR_PX = 72;
  return (
    <div className="flex items-end justify-start gap-3">
      {ramp.map((p) => {
        const px = targetMW > 0 ? Math.max((p.cumulativeMW / targetMW) * MAX_BAR_PX, 6) : 6;
        return (
          <div key={p.index} className="flex w-12 flex-col items-center">
            <span className="text-[11px] font-heading font-semibold text-[#201F1E] mb-1">
              {p.cumulativeMW}
            </span>
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-[#9B0E18] to-[#ED202B]"
              style={{ height: `${px}px` }}
            />
            <span className="mt-1.5 text-[10px] font-medium text-[#7A756E]">{p.year}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Valuation as a small box: current land value vs energized value, as bars. */
function ValuationBox({ valuation }: { valuation: ValuationViz | null }) {
  if (!valuation) {
    return (
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5">
        <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-3">Valuation</h3>
        <p className="text-sm text-[#7A756E]">Not available</p>
      </div>
    );
  }
  const MAX_BAR_PX = 72;
  const max = Math.max(valuation.currentValue, valuation.energizedValue, 1);
  const bars = [
    { label: 'Current', value: valuation.currentValue, accent: false },
    { label: 'Energized', value: valuation.energizedValue, accent: true },
  ];
  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5">
      <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-3">Valuation</h3>
      <div className="flex items-end gap-6">
        {bars.map((b) => {
          const px = Math.max((b.value / max) * MAX_BAR_PX, 6);
          return (
            <div key={b.label} className="flex flex-col items-center">
              <span className="text-[11px] font-heading font-semibold text-[#201F1E] mb-1">
                {formatCurrencyShort(b.value)}
              </span>
              <div
                className={`w-14 rounded-t-md ${b.accent ? 'bg-gradient-to-t from-[#9B0E18] to-[#ED202B]' : 'bg-stone-300'}`}
                style={{ height: `${px}px` }}
              />
              <span className="mt-1.5 text-[10px] font-medium text-[#7A756E]">{b.label}</span>
            </div>
          );
        })}
      </div>
      {valuation.valueCreated > 0 && (
        <p className="mt-3 text-xs text-[#7A756E]">
          Value created{' '}
          <span className="text-[#ED202B] font-semibold">
            +{formatCurrencyShort(valuation.valueCreated)}
          </span>
        </p>
      )}
    </div>
  );
}

/** Ramp Schedule as a small box matching the other section blocks. */
function RampBox({ model }: { model: ExecutiveSummaryModel }) {
  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5">
      <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-3">Ramp Schedule</h3>
      <RampChart model={model} />
    </div>
  );
}

function SectionBlock({ section }: { section: SummarySection }) {
  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5">
      <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-3">{section.title}</h3>
      <dl className="space-y-2">
        {section.rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-[11px] uppercase tracking-wider text-[#7A756E] font-medium shrink-0">
              {r.label}
            </dt>
            <dd
              className={`text-sm font-medium text-right ${r.accent ? 'text-[#ED202B]' : 'text-[#201F1E]'}`}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function SiteExecutiveSummarySection({ site, companyName }: Props) {
  const model = useMemo(
    () => buildExecutiveSummaryModel(site, { currentYear: new Date().getFullYear() }),
    [site],
  );
  const pdf = useExecutiveSummaryPdfExport();

  // A site analyzed before a given section existed (or a stale record) will be
  // missing one of these results — surface a "re-run" hint rather than showing
  // a wall of "Not Available".
  const incomplete =
    !site.infraResult ||
    !site.broadbandResult ||
    !site.waterResult ||
    !site.gasResult ||
    !site.transportResult ||
    !site.appraisalResult;

  async function handleDownload() {
    await pdf.generatePdf({
      model,
      siteName: site.name || 'Untitled Site',
      address: site.address || '',
      coordinates: site.coordinates ? `${site.coordinates.lat}, ${site.coordinates.lng}` : '',
      companyName,
      generatedAt: Date.now(),
    });
  }

  return (
    <div className="space-y-5">
      {/* Header / action */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-widest text-[#ED202B] font-semibold">
          Executive Summary
        </p>
        <button
          onClick={handleDownload}
          disabled={pdf.generating}
          className="inline-flex items-center gap-2 rounded-lg bg-[#ED202B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9B0E18] transition disabled:opacity-60"
        >
          {pdf.generating ? 'Generating…' : 'Download PDF'}
        </button>
      </div>

      {incomplete && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800">
          <svg className="h-4 w-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.34 3.94l-7.5 12.99A1.5 1.5 0 004.14 19.5h15.72a1.5 1.5 0 001.3-2.57l-7.5-12.99a1.5 1.5 0 00-2.62 0z" />
          </svg>
          <span>
            Some information may be missing or out of date. Use <strong>Re-analyze</strong> (top of
            the page) to run the analysis again and refresh everything.
          </span>
        </div>
      )}

      {pdf.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
          {pdf.error}
        </div>
      )}

      {/* Hero */}
      <div className="bg-gradient-to-br from-[#9B0E18] to-[#ED202B] rounded-2xl p-6 md:p-8 text-white">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-widest opacity-80">Target Capacity</p>
            <p className="font-heading text-5xl md:text-6xl font-bold leading-none mt-1">
              {model.targetMW}
              <span className="text-2xl font-semibold ml-1">MW</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest opacity-80">Full capacity by</p>
            <p className="font-heading text-3xl font-semibold mt-1">{model.fullByLabel}</p>
          </div>
        </div>
      </div>

      {/* Section mini-summaries (Location, Valuation, Power, Ramp after Power, …) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {model.sections.map((section) => (
          <Fragment key={section.key}>
            <SectionBlock section={section} />
            {section.key === 'location' && <ValuationBox valuation={model.valuation} />}
            {section.key === 'power' && <RampBox model={model} />}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
