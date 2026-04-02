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

  const nearby = result.nearbyServiceBlocks ?? [];
  const hasFiberOnRequest = !result.fiberAvailable && nearby.some(b => b.fiberAvailable);
  const hasCableOnRequest = !result.cableAvailable && nearby.some(b => b.cableAvailable);
  const hasNearbyBlocks = nearby.length > 0;

  // "On request" summary stats from nearby blocks — exclude providers already at the site
  const siteProviderNames = new Set(result.providers.map(p => p.providerName));
  const allNearbyProviders = nearby.flatMap(b => b.providers).filter(p => !siteProviderNames.has(p.providerName));
  const uniqueNearbyProviders = new Set(allNearbyProviders.map(p => p.providerName)).size;
  const nearbyMaxDown = allNearbyProviders.length > 0 ? Math.max(...allNearbyProviders.map(p => p.maxDown)) : 0;
  const nearbyMaxUp = allNearbyProviders.length > 0 ? Math.max(...allNearbyProviders.map(p => p.maxUp)) : 0;

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
          value={result.fiberAvailable ? 'Available' : hasFiberOnRequest ? 'On Request' : 'Not Available'}
          accent={result.fiberAvailable ? 'green' : hasFiberOnRequest ? 'blue' : 'red'}
        />
        <StatCard
          label="Cable"
          value={result.cableAvailable ? 'Available' : hasCableOnRequest ? 'On Request' : 'Not Available'}
          accent={result.cableAvailable ? 'green' : hasCableOnRequest ? 'blue' : 'red'}
        />
      </div>

      {/* Potential on-request stats */}
      {hasNearbyBlocks && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Potential Providers" value={String(uniqueNearbyProviders)} accent="blue" subtitle="on request" />
          <StatCard label="Potential Max Download" value={nearbyMaxDown > 0 ? `${nearbyMaxDown} Mbps` : '—'} accent="blue" subtitle="on request" />
          <StatCard label="Potential Max Upload" value={nearbyMaxUp > 0 ? `${nearbyMaxUp} Mbps` : '—'} accent="blue" subtitle="on request" />
        </div>
      )}

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

      {/* Nearby Service Blocks */}
      {hasNearbyBlocks && (
        <div className="bg-blue-50 rounded-2xl border border-blue-200 p-5 md:p-6">
          <h3 className="font-heading text-base font-semibold text-blue-800 mb-2">
            Service Available on Request
          </h3>
          <p className="text-sm text-blue-700 mb-4">
            Wired broadband service (fiber/cable) exists in {nearby.length} nearby
            block{nearby.length > 1 ? 's' : ''} within ~2 miles. Service may be extendable to the site upon request from the provider.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-blue-200">
                  <th className={thClass}>Block GEOID</th>
                  <th className={thClass}>Distance</th>
                  <th className={thClass}>Provider</th>
                  <th className={thClass}>Technology</th>
                  <th className={thClass}>Download</th>
                  <th className={thClass}>Upload</th>
                </tr>
              </thead>
              <tbody>
                {nearby.map((block) =>
                  block.providers.length > 0
                    ? block.providers.map((p, pi) => (
                        <tr key={`${block.geoid}-${pi}`} className="border-b border-blue-100">
                          {pi === 0 ? (
                            <>
                              <td className={`${tdClass} font-mono text-xs`} rowSpan={block.providers.length}>{block.geoid}</td>
                              <td className={tdClass} rowSpan={block.providers.length}>{block.distanceMi} mi</td>
                            </>
                          ) : null}
                          <td className={`${tdClass} font-medium`}>{p.providerName}</td>
                          <td className={tdClass}>
                            <span className="mr-1">{techIcons[p.technology] ?? ''}</span>
                            {p.technology}
                          </td>
                          <td className={tdClass}>{p.maxDown > 0 ? `${p.maxDown} Mbps` : '—'}</td>
                          <td className={tdClass}>{p.maxUp > 0 ? `${p.maxUp} Mbps` : '—'}</td>
                        </tr>
                      ))
                    : (
                        <tr key={block.geoid} className="border-b border-blue-100">
                          <td className={`${tdClass} font-mono text-xs`}>{block.geoid}</td>
                          <td className={tdClass}>{block.distanceMi} mi</td>
                          <td className={`${tdClass} italic text-[#7A756E]`} colSpan={4}>Service reported (details unavailable)</td>
                        </tr>
                      )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile Broadband Coverage */}
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-base font-semibold text-[#201F1E]">
            Mobile Broadband Coverage
          </h3>
          <a
            href={result.fccMobileMapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#ED202B] hover:underline"
          >
            View on FCC Map
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        </div>

        {result.mobileProviders.length > 0 ? (
          <>
            <p className="text-xs text-[#7A756E] mb-3">
              Mobile carriers reporting coverage at this location per FCC BDC data.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px]">
                <thead>
                  <tr className="border-b border-[#D8D5D0]">
                    <th className={thClass}>Provider</th>
                    <th className={thClass}>Technology</th>
                    <th className={thClass}>Download</th>
                    <th className={thClass}>Upload</th>
                  </tr>
                </thead>
                <tbody>
                  {result.mobileProviders.map((p, i) => (
                    <tr key={i} className="border-b border-[#D8D5D0]/50">
                      <td className={`${tdClass} font-medium`}>{p.providerName}</td>
                      <td className={tdClass}>
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          p.technology === '5G-NR'
                            ? 'bg-violet-100 text-violet-700'
                            : p.technology === '4G LTE'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-stone-100 text-stone-600'
                        }`}>
                          {p.technology}
                        </span>
                      </td>
                      <td className={tdClass}>{p.maxDown > 0 ? `${p.maxDown} Mbps` : '—'}</td>
                      <td className={tdClass}>{p.maxUp > 0 ? `${p.maxUp} Mbps` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-sm text-[#7A756E] italic py-2">
            <p>
              Mobile coverage data is not available through the ArcGIS BDC service (fixed broadband only).
              Use the FCC Mobile Broadband Map to verify carrier coverage (4G LTE / 5G) at this location.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={result.fccMobileMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#ED202B] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#9B0E18] not-italic"
              >
                Check FCC Mobile Map
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            </div>
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

      {/* FCC Map Links */}
      <div className="flex items-center justify-between bg-[#F5F4F2] rounded-xl border border-[#D8D5D0] px-4 py-3">
        <p className="text-xs text-[#7A756E]">
          Analyzed {new Date(result.analyzedAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
          })}
        </p>
        <div className="flex gap-2">
          <a
            href={result.fccMapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#ED202B] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#9B0E18]"
          >
            Fixed Map
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
          <a
            href={result.fccMobileMapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#ED202B] bg-white px-3 py-1.5 text-xs font-medium text-[#ED202B] transition hover:bg-[#ED202B]/5"
          >
            Mobile Map
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        </div>
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

function StatCard({ label, value, accent, subtitle }: { label: string; value: string; accent?: 'green' | 'red' | 'blue'; subtitle?: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#D8D5D0] px-3 py-3 text-center">
      <p className="text-[10px] uppercase tracking-wider text-[#7A756E] font-medium">{label}</p>
      <p className={`text-lg font-heading font-semibold mt-0.5 ${
        accent === 'green' ? 'text-green-600' :
        accent === 'blue' ? 'text-blue-600' :
        accent === 'red' ? 'text-red-500' :
        'text-[#201F1E]'
      }`}>
        {value}
      </p>
      {subtitle && <p className="text-[9px] text-[#7A756E] mt-0.5">{subtitle}</p>}
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
  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
      <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-1">
        County-Wide Providers — {countyName} ({providers.length})
      </h3>
      <p className="text-xs text-[#7A756E] mb-3">
        All broadband providers reporting service in {countyName}.
      </p>
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
    </div>
  );
}

// ── OSP Assessment Logic ────────────────────────────────────────────────────

function getMobileSummary(r: BroadbandResult): string {
  if (r.mobileProviders.length === 0) return '';
  const has5g = r.mobileProviders.some((p) => p.technology === '5G-NR');
  const hasLte = r.mobileProviders.some((p) => p.technology === '4G LTE');
  const carriers = new Set(r.mobileProviders.map((p) => p.providerName)).size;
  if (has5g) return ` ${carriers} mobile carrier(s) with 5G coverage detected.`;
  if (hasLte) return ` ${carriers} mobile carrier(s) with 4G LTE coverage detected.`;
  return ` ${carriers} mobile carrier(s) detected.`;
}

function getScadaAssessment(r: BroadbandResult): string {
  const mobile = getMobileSummary(r);
  if (r.fiberAvailable) return `Fiber available on-site — ideal for SCADA/telemetry with high reliability and low latency.${mobile}`;
  if (r.cableAvailable) return `Cable broadband available — sufficient for SCADA/telemetry. Consider cellular backup.${mobile}`;
  if (r.fixedWirelessAvailable) return `Fixed wireless available — viable for basic SCADA/monitoring. Recommend cellular or satellite backup.${mobile}`;
  if (r.providers.length > 0) return `Satellite-only coverage — high latency limits real-time SCADA. Cellular (LTE/5G) recommended as primary.${mobile}`;
  return `No fixed broadband coverage detected. Cellular (LTE/5G) or private radio network required for SCADA/telemetry.${mobile || ' Verify mobile coverage on the FCC Mobile Map.'}`;
}

function getFiberAssessment(r: BroadbandResult): string {
  const fiberProviders = r.providers.filter((p) => p.technology === 'Fiber');
  if (fiberProviders.length > 0) {
    const names = fiberProviders.map((p) => p.providerName).join(', ');
    const maxDown = Math.max(...fiberProviders.map((p) => p.maxDown));
    return `Fiber available from ${names} (up to ${maxDown} Mbps). Direct interconnection possible.`;
  }
  const nearbyFiber = r.nearbyServiceBlocks?.find(b => b.fiberAvailable);
  if (nearbyFiber) {
    const names = nearbyFiber.providers.filter(p => p.technology === 'Fiber').map(p => p.providerName).join(', ') || 'nearby provider(s)';
    return `No fiber at site, but available ~${nearbyFiber.distanceMi} mi away from ${names}. Last-mile extension likely feasible — contact provider for service availability.`;
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
  const nearbyBlocks = r.nearbyServiceBlocks ?? [];
  if (nearbyBlocks.length > 0 && nearbyBlocks[0].distanceMi <= 3) {
    const closest = nearbyBlocks[0];
    const providerName = closest.providers[0]?.providerName || 'provider';
    const techTypes = [...new Set(closest.providers.map(p => p.technology))].join('/');
    return `${techTypes || 'Wired service'} available ${closest.distanceMi} mi from site — contact ${providerName} about service extension. Budget $30K-50K/mi for last-mile build.`;
  }
  if (r.tier === 'Underserved') {
    return 'Limited connectivity. Fixed wireless or cellular as primary, satellite as backup. Budget $30K-50K/mi for potential fiber last-mile build.';
  }
  return 'Remote/unserved area. Cellular (LTE/5G) as primary if coverage exists, LEO satellite (Starlink) as backup. Budget for telecom infrastructure in project costs.';
}
