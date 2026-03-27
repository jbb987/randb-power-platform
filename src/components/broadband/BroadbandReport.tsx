import { useState } from 'react';
import type { BroadbandProvider, BroadbandResult } from '../../types';

const tierColors: Record<string, { bg: string; text: string; label: string }> = {
  Served:      { bg: 'bg-green-100', text: 'text-green-800', label: 'Served (≥100/20 Mbps)' },
  Underserved: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Underserved (≥25/3 but <100/20)' },
  Unserved:    { bg: 'bg-red-100',   text: 'text-red-800',   label: 'Unserved (<25/3 or high latency only)' },
};

const techIcons: Record<string, string> = {
  Fiber:            '🟢',
  Cable:            '🔵',
  DSL:              '🟡',
  'Fixed Wireless': '🟠',
  Satellite:        '⚪',
  Other:            '⚫',
};

const thClass = 'text-left text-[10px] font-semibold uppercase tracking-wider text-[#7A756E] py-2 px-2';
const tdClass = 'py-2 px-2 text-sm text-[#201F1E]';

export default function BroadbandReport({ result }: { result: BroadbandResult }) {
  const tierStyle = tierColors[result.tier] ?? tierColors.Unserved;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-base font-semibold text-[#201F1E]">
            Broadband Due Diligence Report
          </h3>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tierStyle.bg} ${tierStyle.text}`}>
            {result.tier}
          </span>
        </div>

        {/* Location Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoCell label="County" value={result.countyName} />
          <InfoCell label="State" value={`${result.stateName} (${result.stateCode})`} />
          <InfoCell label="Census Block" value={result.fips} mono />
          <InfoCell label="ISO / RTO" value={result.iso || 'N/A'} />
        </div>

        <div className="mt-3 pt-3 border-t border-[#D8D5D0]/60">
          <p className="text-xs text-[#7A756E]">
            Classification: <span className={`font-medium ${tierStyle.text}`}>{tierStyle.label}</span>
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Providers" value={String(result.totalProviders)} />
        <StatCard label="Max Download" value={result.maxDownload > 0 ? `${result.maxDownload} Mbps` : '—'} />
        <StatCard label="Max Upload" value={result.maxUpload > 0 ? `${result.maxUpload} Mbps` : '—'} />
        <StatCard
          label="Fiber"
          value={result.fiberAvailable ? 'Available' : 'Not Available'}
          accent={result.fiberAvailable ? 'green' : 'red'}
        />
        <StatCard
          label="Cable"
          value={result.cableAvailable ? 'Available' : 'Not Available'}
          accent={result.cableAvailable ? 'green' : 'red'}
        />
      </div>

      {/* Provider Table */}
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
        <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-4">
          Available Providers ({result.providers.length})
        </h3>

        <p className="text-xs text-[#7A756E] mb-3">
          Providers available in census block {result.fips}. Data reflects all broadband serviceable locations in the area surrounding the site.
        </p>

        {result.providers.length === 0 ? (
          <div className="text-sm text-[#7A756E] italic py-4">
            No provider data available from FCC BDC for this census block.
            <a
              href={result.fccMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 text-[#ED202B] hover:underline"
            >
              Check FCC Map directly &rarr;
            </a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-[#D8D5D0]">
                  <th className={thClass}>Provider</th>
                  <th className={thClass}>Technology</th>
                  <th className={thClass}>Download</th>
                  <th className={thClass}>Upload</th>
                  <th className={thClass}>Latency</th>
                </tr>
              </thead>
              <tbody>
                {result.providers.map((p, i) => (
                  <tr key={i} className="border-b border-[#D8D5D0]/50">
                    <td className={`${tdClass} font-medium`}>{p.providerName}</td>
                    <td className={tdClass}>
                      <span className="mr-1">{techIcons[p.technology] ?? ''}</span>
                      {p.technology}
                    </td>
                    <td className={tdClass}>{p.maxDown > 0 ? `${p.maxDown} Mbps` : '—'}</td>
                    <td className={tdClass}>{p.maxUp > 0 ? `${p.maxUp} Mbps` : '—'}</td>
                    <td className={tdClass}>
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        p.lowLatency
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {p.lowLatency ? 'Low' : 'High'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Nearby Fiber Routes */}
      {result.nearbyFiberRoutes.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
          <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-4">
            Nearby Fiber Routes ({result.nearbyFiberRoutes.length})
          </h3>
          <p className="text-xs text-[#7A756E] mb-3">
            Long-haul fiber routes within ~20 miles of the site.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="border-b border-[#D8D5D0]">
                  <th className={thClass}>Route</th>
                  <th className={thClass}>Owner</th>
                  <th className={thClass}>Type</th>
                  <th className={`${thClass} text-right`}>Distance</th>
                </tr>
              </thead>
              <tbody>
                {result.nearbyFiberRoutes.map((r, i) => (
                  <tr key={i} className="border-b border-[#D8D5D0]/50">
                    <td className={`${tdClass} font-medium`}>{r.name}</td>
                    <td className={tdClass}>{r.owner || '—'}</td>
                    <td className={tdClass}>
                      <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 px-1.5 py-0.5 text-[10px] font-medium">
                        {r.type}
                      </span>
                    </td>
                    <td className={`${tdClass} text-right`}>{r.distanceMi} mi</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result.nearbyFiberRoutes.length === 0 && (
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
          <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-2">
            Nearby Fiber Routes
          </h3>
          <p className="text-sm text-[#7A756E] italic">
            No public fiber route data available within search radius (~20 mi).
          </p>
        </div>
      )}

      {/* County-Wide Providers */}
      {result.countyProviders.length > 0 && (
        <CountyProvidersSection providers={result.countyProviders} countyName={result.countyName} />
      )}

      {/* OSP Engineer Assessment */}
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
        <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-4">
          OSP Engineer Assessment
        </h3>
        <div className="space-y-3 text-sm text-[#201F1E]">
          <AssessmentItem
            label="SCADA / Telemetry"
            value={getScadaAssessment(result)}
          />
          <AssessmentItem
            label="Fiber Backhaul"
            value={getFiberAssessment(result)}
          />
          <AssessmentItem
            label="Redundancy"
            value={getRedundancyAssessment(result)}
          />
          <AssessmentItem
            label="Recommendation"
            value={getRecommendation(result)}
          />
        </div>
      </div>

      {/* FCC Map Link */}
      <div className="flex items-center justify-between bg-[#F5F4F2] rounded-xl border border-[#D8D5D0] px-4 py-3">
        <p className="text-xs text-[#7A756E]">
          Analyzed {new Date(result.analyzedAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
          })}
        </p>
        <a
          href={result.fccMapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#ED202B] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#9B0E18]"
        >
          Verify on FCC Map
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </a>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function InfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[#7A756E] font-medium">{label}</p>
      <p className={`text-sm text-[#201F1E] mt-0.5 ${mono ? 'font-mono text-xs' : ''}`}>
        {value || '—'}
      </p>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'green' | 'red' }) {
  return (
    <div className="bg-white rounded-xl border border-[#D8D5D0] px-3 py-3 text-center">
      <p className="text-[10px] uppercase tracking-wider text-[#7A756E] font-medium">{label}</p>
      <p className={`text-lg font-heading font-semibold mt-0.5 ${
        accent === 'green' ? 'text-green-600' :
        accent === 'red' ? 'text-red-500' :
        'text-[#201F1E]'
      }`}>
        {value}
      </p>
    </div>
  );
}

function AssessmentItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-xs font-semibold text-[#7A756E] uppercase tracking-wider min-w-[120px] pt-0.5">
        {label}
      </span>
      <span className="text-sm text-[#201F1E]">{value}</span>
    </div>
  );
}

// ── OSP Assessment Logic ────────────────────────────────────────────────────

function CountyProvidersSection({ providers, countyName }: { providers: BroadbandProvider[]; countyName: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="font-heading text-base font-semibold text-[#201F1E]">
          County-Wide Providers — {countyName} ({providers.length})
        </h3>
        <svg
          className={`h-4 w-4 text-[#7A756E] transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <p className="text-xs text-[#7A756E] mt-1">
        All broadband providers reporting service in {countyName}.
      </p>
      {expanded && (
        <div className="overflow-x-auto mt-3">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b border-[#D8D5D0]">
                <th className={thClass}>Provider</th>
                <th className={thClass}>Technology</th>
                <th className={thClass}>Download</th>
                <th className={thClass}>Upload</th>
                <th className={thClass}>Latency</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p, i) => (
                <tr key={i} className="border-b border-[#D8D5D0]/50">
                  <td className={`${tdClass} font-medium`}>{p.providerName}</td>
                  <td className={tdClass}>
                    <span className="mr-1">{techIcons[p.technology] ?? ''}</span>
                    {p.technology}
                  </td>
                  <td className={tdClass}>{p.maxDown > 0 ? `${p.maxDown} Mbps` : '—'}</td>
                  <td className={tdClass}>{p.maxUp > 0 ? `${p.maxUp} Mbps` : '—'}</td>
                  <td className={tdClass}>
                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      p.lowLatency ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {p.lowLatency ? 'Low' : 'High'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── OSP Assessment Logic ────────────────────────────────────────────────────

function getScadaAssessment(r: BroadbandResult): string {
  if (r.fiberAvailable) return 'Fiber available on-site — ideal for SCADA/telemetry with high reliability and low latency.';
  if (r.cableAvailable) return 'Cable broadband available — sufficient for SCADA/telemetry. Consider cellular backup.';
  if (r.fixedWirelessAvailable) return 'Fixed wireless available — viable for basic SCADA/monitoring. Recommend cellular or satellite backup.';
  if (r.providers.length > 0) return 'Satellite-only coverage — high latency limits real-time SCADA. Cellular (LTE/5G) recommended as primary.';
  return 'No broadband coverage detected. Cellular (LTE/5G) or private radio network required for SCADA/telemetry.';
}

function getFiberAssessment(r: BroadbandResult): string {
  const fiberProviders = r.providers.filter((p) => p.technology === 'Fiber');
  if (fiberProviders.length > 0) {
    const names = fiberProviders.map((p) => p.providerName).join(', ');
    const maxDown = Math.max(...fiberProviders.map((p) => p.maxDown));
    return `Fiber available from ${names} (up to ${maxDown} Mbps). Direct interconnection possible.`;
  }
  return 'No fiber service reported at this location. Last-mile fiber construction may be required for high-bandwidth interconnection.';
}

function getRedundancyAssessment(r: BroadbandResult): string {
  const techTypes = new Set(r.providers.map((p) => p.technology));
  if (techTypes.size >= 3) return `${techTypes.size} technology types available — excellent path diversity for redundant connectivity.`;
  if (techTypes.size === 2) return `${techTypes.size} technology types available — adequate for primary/backup configuration.`;
  if (techTypes.size === 1) return 'Single technology type — limited redundancy. Consider adding cellular or satellite backup.';
  return 'No providers detected — plan for dual-path deployment (cellular + satellite).';
}

function getRecommendation(r: BroadbandResult): string {
  if (r.tier === 'Served' && r.fiberAvailable) {
    return 'Well-connected site. Fiber as primary, cable or fixed wireless as backup. Low telecom risk for project development.';
  }
  if (r.tier === 'Served') {
    return 'Adequate connectivity. Cable/fixed wireless as primary. Budget for potential fiber extension if high-bandwidth interconnection needed.';
  }
  if (r.tier === 'Underserved') {
    return 'Limited connectivity. Fixed wireless or cellular as primary, satellite as backup. Budget $30K-50K/mi for potential fiber last-mile build.';
  }
  return 'Remote/unserved area. Cellular (LTE/5G) as primary if coverage exists, LEO satellite (Starlink) as backup. Budget for telecom infrastructure in project costs.';
}
