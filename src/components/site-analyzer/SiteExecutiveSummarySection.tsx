import { useMemo } from 'react';
import type { SiteRegistryEntry } from '../../types';
import type { InfraResult } from '../../lib/infraLookup';
import { buildExecutiveSummaryModel, type Verdict } from '../../lib/executiveSummary';
import { buildGridStaticMap } from '../../utils/buildStaticMap';
import { fetchTransmissionLines } from '../../lib/powerMapData';
import GridContextMap from '../power-calculator/GridContextMap';
import { usePreConSiteByRegistryId } from '../../hooks/usePreConSites';
import { useExecutiveSummaryPdfExport } from '../../hooks/useExecutiveSummaryPdfExport';

interface Props {
  site: SiteRegistryEntry;
  companyName: string | null;
}

const GRADE_COLOR: Record<string, { text: string; border: string; bg: string }> = {
  go: { text: 'text-[#0E7C4B]', border: 'border-[#0E7C4B]', bg: 'bg-[#E7F4EE]' },
  'conditional-go': { text: 'text-[#B45309]', border: 'border-[#B45309]', bg: 'bg-[#FBF1E3]' },
  'no-go': { text: 'text-[#B91C1C]', border: 'border-[#B91C1C]', bg: 'bg-[#FBE9EA]' },
};

/** GO / CONDITIONAL GO / NO-GO badge (screen twin of the PDF badge). */
function VerdictBadge({ verdict, energizedBy }: { verdict: Verdict | null; energizedBy: string }) {
  const c = verdict ? GRADE_COLOR[verdict.grade] : { text: 'text-[#7A756E]', border: 'border-[#D8D5D0]', bg: 'bg-[#F2F0ED]' };
  return (
    <div className={`shrink-0 w-40 rounded-xl border ${c.border} ${c.bg} px-4 py-3 text-center`}>
      <p className={`font-heading text-3xl font-bold leading-none ${c.text}`}>
        {verdict ? verdict.label : '—'}
      </p>
      <p className={`text-[11px] font-semibold mt-1.5 ${c.text}`}>
        {verdict ? (verdict.reviewed ? 'Engineer-reviewed' : 'Preliminary grade') : 'Not yet graded'}
      </p>
      {energizedBy && energizedBy !== '—' && (
        <>
          <p className="text-[9px] uppercase tracking-widest text-[#7A756E] mt-2">Target energization</p>
          <p className="font-heading text-xl font-bold text-[#201F1E]">{energizedBy}</p>
        </>
      )}
    </div>
  );
}

export default function SiteExecutiveSummarySection({ site, companyName }: Props) {
  // The engineer-reviewed verdict + verified MW live on the linked LLR record
  // (if this site has been tracked into Large Load Request) — they make the
  // "GO / engineer-reviewed" badge and the deliverable hero number credible.
  const { site: llr } = usePreConSiteByRegistryId(site.id);
  const model = useMemo(
    () =>
      buildExecutiveSummaryModel(site, {
        currentYear: new Date().getFullYear(),
        grade: llr?.grade,
        gradeReviewed: llr?.engineerReviewStatus === 'approved',
        verifiedMW: llr?.engineerVerifiedMW,
      }),
    [site, llr],
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

  const infra = site.infraResult as unknown as InfraResult | null;
  const substations = infra?.nearbySubstations ?? [];

  async function handleDownload() {
    // Build the satellite+substation map (needs DOM canvas) before the PDF render.
    let gridMapImage: string | null = null;
    if (site.coordinates && substations.length > 0) {
      const { lat, lng } = site.coordinates;
      // Pull nearby transmission-line geometry (not stored on the site — fetched
      // live, same HIFLD layer the Grid Analyzer uses) to draw the grid backbone.
      let lines: { voltage: number; coordinates: [number, number][] }[] = [];
      try {
        const d = 0.12; // ~8 mi box, matches the map's fit-to-substations extent
        lines = await fetchTransmissionLines({
          west: lng - d,
          east: lng + d,
          south: lat - d,
          north: lat + d,
        });
      } catch {
        lines = []; // map still renders without lines
      }
      gridMapImage = await buildGridStaticMap(lat, lng, substations, lines);
    }
    await pdf.generatePdf({
      model,
      siteName: site.name || 'Untitled Site',
      address: site.address || '',
      coordinates: site.coordinates ? `${site.coordinates.lat}, ${site.coordinates.lng}` : '',
      county: site.county?.trim() || null,
      companyName,
      gridMapImage,
      generatedAt: Date.now(),
    });
  }

  const coordinates = site.coordinates ? `${site.coordinates.lat}, ${site.coordinates.lng}` : '—';
  const metaBits = [model.rto, site.county ? `${site.county} County` : null, coordinates]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <div className="space-y-5">
      {/* Header / action */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-widest text-[#ED202B] font-semibold">
          Site Briefing · Confidential
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

      {/* Hero: deliverable MW + verdict */}
      <div className="flex flex-wrap items-start justify-between gap-4 bg-white rounded-2xl border border-[#D8D5D0] p-6">
        <div className="min-w-0">
          <h2 className="font-heading text-2xl font-bold text-[#201F1E]">{site.name || 'Untitled Site'}</h2>
          <p className="font-heading text-4xl md:text-5xl font-bold text-[#ED202B] leading-none mt-2">
            {model.heroMW > 0 ? model.heroMW.toLocaleString() : '—'}
            <span className="text-2xl font-semibold"> MW</span>
          </p>
          <p className="text-sm text-[#7A756E] mt-2">{metaBits}</p>
        </div>
        <VerdictBadge verdict={model.verdict} energizedBy={model.fullByLabel} />
      </div>

      {/* Power-context map */}
      {site.coordinates && substations.length > 0 && (
        <div>
          <GridContextMap
            lat={site.coordinates.lat}
            lng={site.coordinates.lng}
            substations={substations}
            siteId={site.id}
            hideHeader
            showLines
          />
          <p className="mt-2 text-sm text-[#7A756E]">
            Nearest substation{' '}
            <span className="font-semibold text-[#ED202B]">
              {model.nearestSubstation ?? 'Not Available'}
            </span>
            {model.utility ? `  ·  Served by ${model.utility}` : ''}
          </p>
        </div>
      )}

      {/* Site Highlights — benefit tiles */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#ED202B] mb-3">
          Site Highlights
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
          {model.benefits.map((b) => (
            <div key={b.key} className="border-l-2 border-[#ED202B] pl-3">
              <p className="font-heading text-base font-semibold text-[#201F1E]">{b.headline}</p>
              <p className="text-sm text-[#7A756E] mt-0.5">{b.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Attribution (not a sales CTA — this reads as an executive summary) */}
      <div className="border-t border-[#D8D5D0] pt-4 text-sm text-[#7A756E]">
        Prepared by R&amp;B Power Inc. · bwest@randbpowerinc.us
      </div>
    </div>
  );
}
