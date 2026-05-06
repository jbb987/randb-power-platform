import type { BroadbandProvider, BroadbandResult } from '../../types';

const tierColors: Record<string, { bg: string; text: string }> = {
  Served:      { bg: 'bg-green-100', text: 'text-green-800' },
  Underserved: { bg: 'bg-amber-100', text: 'text-amber-800' },
  Unserved:    { bg: 'bg-red-100',   text: 'text-red-800' },
};

const techIcons: Record<string, string> = {
  Fiber: '🟢', Cable: '🔵', DSL: '🟡', 'Fixed Wireless': '🟠', Satellite: '⚪', Other: '⚫',
};

const thClass = 'text-left text-[10px] font-semibold uppercase tracking-wider text-[#7A756E] py-2 px-2';
const tdClass = 'py-2 px-2 text-sm text-[#201F1E]';

export default function BroadbandReport({ result }: { result: BroadbandResult }) {
  const tierStyle = tierColors[result.tier] ?? tierColors.Unserved;

  const nearby = result.nearbyServiceBlocks ?? [];
  const hasNearbyBlocks = nearby.length > 0;
  const hasTerrestrialOnSite = result.providers.some(p =>
    p.technology !== 'Satellite' && p.technology !== 'Other'
  );
  const hasSatelliteOnly = result.providers.length > 0 && !hasTerrestrialOnSite;
  const countyProviders = result.countyProviders ?? [];

  // Fiber/Cable status logic
  const hasFiberOnRequest = !result.fiberAvailable && nearby.some(b => b.fiberAvailable);
  const hasCableOnRequest = !result.cableAvailable && nearby.some(b => b.cableAvailable);
  const hasFiberInCounty = !result.fiberAvailable && !hasFiberOnRequest
    && countyProviders.some(p => p.technology === 'Fiber');
  const hasCableInCounty = !result.cableAvailable && !hasCableOnRequest
    && countyProviders.some(p => p.technology === 'Cable');

  // Providers / Max Down / Max Up cascade values (on-site → nearby → county)
  const nearbyProviderCount = new Set(
    nearby.flatMap(b => b.providers.map(p => p.providerName)),
  ).size;
  const nearbyMaxDown = nearby.flatMap(b => b.providers).reduce((m, p) => Math.max(m, p.maxDown), 0);
  const nearbyMaxUp = nearby.flatMap(b => b.providers).reduce((m, p) => Math.max(m, p.maxUp), 0);
  const countyMaxDown = countyProviders.reduce((m, p) => Math.max(m, p.maxDown), 0);
  const countyMaxUp = countyProviders.reduce((m, p) => Math.max(m, p.maxUp), 0);

  const providersStat = pickStat({
    onSite: result.totalProviders > 0 ? `${result.totalProviders}` : null,
    onRequest: nearbyProviderCount > 0 ? `${nearbyProviderCount} On Request` : null,
    inCounty: countyProviders.length > 0 ? `${countyProviders.length} In County` : null,
    fallback: '0',
  });

  const maxDownStat = pickStat({
    onSite: result.maxDownload > 0 ? `${result.maxDownload} Mbps` : null,
    onRequest: nearbyMaxDown > 0 ? `${nearbyMaxDown} Mbps On Request` : null,
    inCounty: countyMaxDown > 0 ? `${countyMaxDown} Mbps In County` : null,
    fallback: '—',
  });

  const maxUpStat = pickStat({
    onSite: result.maxUpload > 0 ? `${result.maxUpload} Mbps` : null,
    onRequest: nearbyMaxUp > 0 ? `${nearbyMaxUp} Mbps On Request` : null,
    inCounty: countyMaxUp > 0 ? `${countyMaxUp} Mbps In County` : null,
    fallback: '—',
  });

  // Determine scenario
  const isScenarioA = hasTerrestrialOnSite;
  const isScenarioB = !hasTerrestrialOnSite && hasNearbyBlocks;
  const isScenarioC = !hasTerrestrialOnSite && !hasNearbyBlocks && countyProviders.length > 0;
  // Scenario D = none of the above

  return (
    <div className="space-y-5">
      {/* Summary Card */}
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="font-heading text-sm font-semibold text-[#201F1E]">Connectivity</h3>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tierStyle.bg} ${tierStyle.text}`}>
              {result.tier}
            </span>
          </div>
          <span className="text-[10px] text-[#7A756E] font-mono">{result.fips}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MiniStat label="Providers" value={providersStat.value} accent={providersStat.accent} />
          <MiniStat label="Max Download" value={maxDownStat.value} accent={maxDownStat.accent} />
          <MiniStat label="Max Upload" value={maxUpStat.value} accent={maxUpStat.accent} />
          <MiniStat
            label="Fiber"
            value={result.fiberAvailable ? 'Available' : hasFiberOnRequest ? 'On Request (~2 mi)' : hasFiberInCounty ? `In County${result.nearestCountyFiberMi ? ` (~${result.nearestCountyFiberMi} mi)` : ''}` : 'No'}
            accent={result.fiberAvailable ? 'green' : hasFiberOnRequest ? 'blue' : hasFiberInCounty ? 'amber' : 'red'}
          />
          <MiniStat
            label="Cable"
            value={result.cableAvailable ? 'Available' : hasCableOnRequest ? 'On Request (~2 mi)' : hasCableInCounty ? `In County${result.nearestCountyCableMi ? ` (~${result.nearestCountyCableMi} mi)` : ''}` : 'No'}
            accent={result.cableAvailable ? 'green' : hasCableOnRequest ? 'blue' : hasCableInCounty ? 'amber' : 'red'}
          />
        </div>
      </div>

      {/* ── Scenario A: Service on site ── */}
      {isScenarioA && (
        <ProviderTable
          title={`Fixed Broadband Providers (${result.providers.length})`}
          providers={result.providers}
        />
      )}

      {/* ── Scenario B: Not on site, nearby on request ── */}
      {isScenarioB && (
        <>
          {hasSatelliteOnly ? (
            <ProviderTable
              title="At Site"
              providers={result.providers}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
              <p className="text-sm text-[#7A756E]">No fixed broadband service detected at this location.</p>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
            <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-1">
              Service Available on Request
            </h3>
            <p className="text-xs text-[#7A756E] mb-3">
              Typical last-mile build cost: $30K–50K/mi.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px]">
                <thead>
                  <tr className="border-b border-[#D8D5D0]">
                    <th className={thClass}>Distance</th>
                    <th className={thClass}>Provider</th>
                    <th className={thClass}>Technology</th>
                    <th className={thClass}>Download</th>
                    <th className={thClass}>Upload</th>
                  </tr>
                </thead>
                <tbody>
                  {nearby.flatMap((block) =>
                    block.providers.length > 0
                      ? block.providers.map((p, pi) => (
                          <tr key={`${block.geoid}-${pi}`} className="border-b border-[#D8D5D0]/50">
                            {pi === 0 && (
                              <td className={tdClass} rowSpan={block.providers.length}>{block.distanceMi} mi</td>
                            )}
                            <td className={`${tdClass} font-medium`}>{p.providerName}</td>
                            <td className={tdClass}>
                              <span className="mr-1">{techIcons[p.technology] ?? ''}</span>
                              {p.technology}
                            </td>
                            <td className={tdClass}>{p.maxDown > 0 ? `${p.maxDown} Mbps` : '—'}</td>
                            <td className={tdClass}>{p.maxUp > 0 ? `${p.maxUp} Mbps` : '—'}</td>
                          </tr>
                        ))
                      : [(
                          <tr key={block.geoid} className="border-b border-[#D8D5D0]/50">
                            <td className={tdClass}>{block.distanceMi} mi</td>
                            <td className={`${tdClass} italic text-[#7A756E]`} colSpan={4}>Service confirmed, provider details pending</td>
                          </tr>
                        )]
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Scenario C: In county only ── */}
      {isScenarioC && (
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
          <p className="text-sm text-[#7A756E]">
            No broadband service detected at this location or nearby blocks.
            Providers in {result.countyName || 'the county'} are listed below.
          </p>
        </div>
      )}

      {/* ── Scenario D: Nothing ── */}
      {!isScenarioA && !isScenarioB && !isScenarioC && (
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
          <p className="text-sm text-[#7A756E]">
            No broadband service detected. Cellular or satellite may be the only options.
          </p>
        </div>
      )}

      {/* County Providers */}
      {countyProviders.length > 0 && (
        <CountyProvidersTable providers={countyProviders} countyName={result.countyName} />
      )}


    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type StatAccent = 'green' | 'blue' | 'amber' | 'red';

function pickStat(opts: {
  onSite: string | null;
  onRequest: string | null;
  inCounty: string | null;
  fallback: string;
}): { value: string; accent: StatAccent } {
  if (opts.onSite) return { value: opts.onSite, accent: 'green' };
  if (opts.onRequest) return { value: opts.onRequest, accent: 'blue' };
  if (opts.inCounty) return { value: opts.inCounty, accent: 'amber' };
  return { value: opts.fallback, accent: 'red' };
}

// ── Sub-components ──────────────────────────────────────────────────────────

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: 'green' | 'red' | 'blue' | 'amber' }) {
  return (
    <div className="bg-[#FAFAF9] rounded-xl border border-[#D8D5D0]/60 px-3 py-2.5 text-center">
      <p className="text-[10px] uppercase tracking-wider text-[#7A756E] font-medium">{label}</p>
      <p className={`text-base font-heading font-semibold mt-0.5 ${
        accent === 'green' ? 'text-green-600' :
        accent === 'blue' ? 'text-blue-600' :
        accent === 'red' ? 'text-red-500' :
        accent === 'amber' ? 'text-amber-600' :
        'text-[#201F1E]'
      }`}>
        {value}
      </p>
    </div>
  );
}

function ProviderTable({ title, providers }: { title: string; providers: BroadbandProvider[] }) {
  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
      <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-3">{title}</h3>
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

function CountyProvidersTable({ providers, countyName }: { providers: BroadbandProvider[]; countyName: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
      <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-1">
        County-Wide Providers — {countyName} ({providers.length})
      </h3>
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
              <tr key={i} className={i % 2 === 1 ? 'bg-[#FAFAF9]' : ''}>
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

