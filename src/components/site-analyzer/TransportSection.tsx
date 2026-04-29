import type { TransportResult } from '../../types/infrastructure';
import type { AnalysisSectionState } from '../../hooks/useSiteAnalysis';

interface Props {
  section: AnalysisSectionState<TransportResult>;
}

function SectionSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-stone-100 rounded-xl" />
        ))}
      </div>
      <div className="h-48 bg-stone-100 rounded-xl" />
    </div>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#FAFAF9] rounded-xl border border-[#D8D5D0]/60 px-4 py-3 text-center">
      <p className="text-[10px] uppercase tracking-wider text-[#7A756E] font-medium">{label}</p>
      <p className="text-lg font-heading font-semibold mt-1 text-[#201F1E]">{value}</p>
      {sub && <p className="text-xs text-[#201F1E] mt-1">{sub}</p>}
    </div>
  );
}

const thClass = 'text-left text-[10px] font-semibold uppercase tracking-wider text-[#7A756E] py-2 px-2';
const tdClass = 'py-2 px-2 text-sm text-[#201F1E]';

function fmtDist(mi: number): string {
  return mi < 1 ? '< 1 mi' : `${mi.toFixed(1)} mi`;
}

function fmtTonnage(t: number): string {
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1)}M tons`;
  if (t >= 1_000) return `${(t / 1_000).toFixed(0)}K tons`;
  return `${t.toLocaleString()} tons`;
}

function hubLabel(hub: string): string {
  switch (hub) {
    case 'L': return 'Large Hub';
    case 'M': return 'Medium Hub';
    case 'S': return 'Small Hub';
    case 'N': return 'Non-Hub';
    default: return hub || 'N/A';
  }
}

function hubAccent(hub: string): string {
  switch (hub) {
    case 'L': return 'bg-green-100 text-green-800';
    case 'M': return 'bg-blue-100 text-blue-800';
    case 'S': return 'bg-amber-100 text-amber-800';
    default: return 'bg-stone-100 text-stone-700';
  }
}

function interstateLabel(r: { routeName: string; routeNumber: string }): string {
  return r.routeName?.trim() || `I-${r.routeNumber}`;
}

// ── Main Component ──────────────────────────────────────────────────────────

function TransportReport({ result }: { result: TransportResult }) {
  const { airports, interstates, ports, railroads } = result;

  const nearestAirport = airports[0];
  const nearestInterstate = interstates[0];
  const nearestPort = ports[0];
  const nearestRailroad = railroads[0];

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Nearest Airport"
            value={nearestAirport ? fmtDist(nearestAirport.distanceMi) : 'None found'}
          />
          <StatCard
            label="Nearest Interstate"
            value={nearestInterstate ? fmtDist(nearestInterstate.distanceMi) : 'None found'}
          />
          <StatCard
            label="Nearest Port"
            value={nearestPort ? fmtDist(nearestPort.distanceMi) : 'None found'}
          />
          <StatCard
            label="Nearest Railroad"
            value={nearestRailroad ? fmtDist(nearestRailroad.distanceMi) : 'None found'}
          />
        </div>
      </div>

      {/* Airports Table */}
      {airports.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
          <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-3">
            Airports ({airports.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#D8D5D0]">
                  <th className={thClass}>Name</th>
                  <th className={thClass}>FAA ID</th>
                  <th className={thClass}>Hub</th>
                  <th className={thClass}>City</th>
                  <th className={thClass}>Commercial Ops</th>
                  <th className={thClass}>Distance</th>
                </tr>
              </thead>
              <tbody>
                {airports.map((a, i) => (
                  <tr key={i} className={i % 2 === 1 ? 'bg-[#FAFAF9]' : ''}>
                    <td className={`${tdClass} font-medium`}>{a.name}</td>
                    <td className={tdClass}>{a.locId}</td>
                    <td className={tdClass}>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${hubAccent(a.hub)}`}>
                        {hubLabel(a.hub)}
                      </span>
                    </td>
                    <td className={tdClass}>{a.city}, {a.state}</td>
                    <td className={tdClass}>{a.commercialOps.toLocaleString()}</td>
                    <td className={tdClass}>{fmtDist(a.distanceMi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Interstates */}
      {interstates.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
          <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-3">
            Interstates ({interstates.length})
          </h3>
          <div className="space-y-2">
            {interstates.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-[#D8D5D0]/40 last:border-0">
                <span className="text-sm font-medium text-[#201F1E]">{interstateLabel(r)}</span>
                <span className="text-sm text-[#7A756E] tabular-nums">{fmtDist(r.distanceMi)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ports Table */}
      {ports.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
          <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-3">
            Major Ports ({ports.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#D8D5D0]">
                  <th className={thClass}>Port</th>
                  <th className={thClass}>Total Tonnage</th>
                  <th className={thClass}>Imports</th>
                  <th className={thClass}>Exports</th>
                  <th className={thClass}>Domestic</th>
                  <th className={thClass}>Distance</th>
                </tr>
              </thead>
              <tbody>
                {ports.map((p, i) => (
                  <tr key={i} className={i % 2 === 1 ? 'bg-[#FAFAF9]' : ''}>
                    <td className={`${tdClass} font-medium`}>{p.name}</td>
                    <td className={tdClass}>{fmtTonnage(p.totalTonnage)}</td>
                    <td className={tdClass}>{fmtTonnage(p.imports)}</td>
                    <td className={tdClass}>{fmtTonnage(p.exports)}</td>
                    <td className={tdClass}>{fmtTonnage(p.domestic)}</td>
                    <td className={tdClass}>{fmtDist(p.distanceMi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Railroads Table */}
      {railroads.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
          <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-3">
            Class I Railroads ({railroads.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#D8D5D0]">
                  <th className={thClass}>Owner</th>
                  <th className={thClass}>Subdivision</th>
                  <th className={thClass}>Tracks</th>
                  <th className={thClass}>Passenger</th>
                  <th className={thClass}>STRACNET</th>
                  <th className={thClass}>Distance</th>
                </tr>
              </thead>
              <tbody>
                {railroads.map((r, i) => (
                  <tr key={i} className={i % 2 === 1 ? 'bg-[#FAFAF9]' : ''}>
                    <td className={`${tdClass} font-medium`}>{r.owner}</td>
                    <td className={tdClass}>{r.subdivision || '—'}</td>
                    <td className={tdClass}>{r.tracks}</td>
                    <td className={tdClass}>
                      {r.passenger === 'Y' ? (
                        <span className="text-green-700">Yes</span>
                      ) : (
                        <span className="text-[#7A756E]">No</span>
                      )}
                    </td>
                    <td className={tdClass}>{r.stracnet || '—'}</td>
                    <td className={tdClass}>{fmtDist(r.distanceMi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state if nothing found at all */}
      {airports.length === 0 && interstates.length === 0 && ports.length === 0 && railroads.length === 0 && (
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6 text-center text-sm text-[#7A756E]">
          No transport infrastructure found within search radius.
        </div>
      )}
    </div>
  );
}

export default function TransportSection({ section }: Props) {
  const { loading, error, data } = section;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="h-8 w-8 rounded-lg bg-[#ED202B]/10 flex items-center justify-center">
          <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
          </svg>
        </div>
        <h2 className="font-heading text-base font-semibold text-[#201F1E]">
          Transport Infrastructure
        </h2>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
          <SectionSkeleton />
        </div>
      )}

      {error && (
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
          <SectionError message={error} />
        </div>
      )}

      {data && <TransportReport result={data} />}
    </div>
  );
}
