import type { GasAnalysisResult, PipelineInfo, PipelineType } from '../../lib/gasAnalysis';

// ── Shared sub-components ────────────────────────────────────────────────────

function SectionCard({ title, badge, children }: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading text-base font-semibold text-[#201F1E]">{title}</h3>
        {badge}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, accent }: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'green' | 'amber' | 'red' | 'blue';
}) {
  const accentClass = {
    green: 'text-green-700',
    amber: 'text-amber-700',
    red:   'text-red-700',
    blue:  'text-blue-700',
  }[accent ?? 'blue'] ?? 'text-[#ED202B]';

  return (
    <div className="bg-[#FAFAF9] rounded-xl border border-[#D8D5D0] p-4">
      <p className="text-xs text-[#7A756E] mb-1">{label}</p>
      <p className={`text-lg font-semibold font-heading ${accentClass}`}>{value}</p>
      {sub && <p className="text-xs text-[#7A756E] mt-0.5">{sub}</p>}
    </div>
  );
}

type BadgeVariant = 'verified' | 'estimated' | 'action';

function StatusBadge({ variant }: { variant: BadgeVariant }) {
  const styles: Record<BadgeVariant, { bg: string; text: string; label: string }> = {
    verified:  { bg: 'bg-green-100',  text: 'text-green-800',  label: 'VERIFIED' },
    estimated: { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'ESTIMATED' },
    action:    { bg: 'bg-amber-100',  text: 'text-amber-800',  label: 'ACTION REQUIRED' },
  };
  const s = styles[variant];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

const thClass = 'text-left text-[10px] font-semibold uppercase tracking-wider text-[#7A756E] py-2 px-3';
const tdClass = 'py-2.5 px-3 text-sm text-[#201F1E]';

// ── Pipeline type colors ──────────────────────────────────────────────────────

const pipelineTypeStyle: Record<PipelineType, { bg: string; text: string }> = {
  Interstate:  { bg: 'bg-blue-100',   text: 'text-blue-800' },
  Intrastate:  { bg: 'bg-purple-100', text: 'text-purple-800' },
  Gathering:   { bg: 'bg-stone-100',  text: 'text-stone-700' },
  Unknown:     { bg: 'bg-gray-100',   text: 'text-gray-700' },
};

// ── Risk color for lateral distance ──────────────────────────────────────────

function riskColor(risk: 'low' | 'medium' | 'high') {
  if (risk === 'low')    return 'text-green-700';
  if (risk === 'medium') return 'text-amber-700';
  return 'text-red-700';
}

function riskBg(risk: 'low' | 'medium' | 'high') {
  if (risk === 'low')    return 'bg-green-50 border-green-200';
  if (risk === 'medium') return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

// ── Section: Pipeline Summary ─────────────────────────────────────────────────

function PipelineSummarySection({ result }: { result: GasAnalysisResult }) {
  const { pipelines } = result;
  const interstateCount = pipelines.filter((p) => p.type === 'Interstate').length;
  const intrastateCount = pipelines.filter((p) => p.type === 'Intrastate').length;
  const nearest = pipelines[0];

  return (
    <SectionCard
      title="Pipeline Summary"
      badge={<StatusBadge variant="verified" />}
    >
      <p className="text-xs text-[#7A756E] mb-4">
        Pipelines identified within 20-mile radius via GeoPlataform ArcGIS Natural Gas Pipeline dataset.
        {result.detectedState && ` State: ${result.detectedState}.`}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard
          label="Total Pipelines Found"
          value={String(pipelines.length)}
          accent={pipelines.length > 0 ? 'green' : 'red'}
        />
        <StatCard
          label="Interstate"
          value={String(interstateCount)}
          accent="blue"
        />
        <StatCard
          label="Intrastate"
          value={String(intrastateCount)}
          accent="blue"
        />
        <StatCard
          label="Nearest Pipeline"
          value={nearest ? `${nearest.distanceMiles} mi` : 'None found'}
          accent={nearest && nearest.distanceMiles < 3 ? 'green' : nearest && nearest.distanceMiles < 10 ? 'amber' : 'red'}
        />
      </div>

      {pipelines.length === 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          No pipelines found within 20 miles. This site may require a long lateral or alternative gas supply arrangement. Verify with a gas supply consultant.
        </div>
      )}
    </SectionCard>
  );
}

// ── Section: Pipeline Table ───────────────────────────────────────────────────

function PipelineTableSection({ pipelines }: { pipelines: PipelineInfo[] }) {
  if (pipelines.length === 0) return null;

  return (
    <SectionCard title={`Nearby Pipelines (${pipelines.length})`} badge={<StatusBadge variant="verified" />}>
      <p className="text-xs text-[#7A756E] mb-3">
        Pipelines within 20 miles, sorted by distance. Distances are approximate (nearest sampled point).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="border-b border-[#D8D5D0]">
              <th className={thClass}>Operator</th>
              <th className={thClass}>Type</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Distance</th>
            </tr>
          </thead>
          <tbody>
            {pipelines.map((p, i) => {
              const ts = pipelineTypeStyle[p.type];
              return (
                <tr key={i} className="border-b border-[#D8D5D0]/60 hover:bg-[#FAFAF9] transition">
                  <td className={tdClass}>
                    <span className="font-medium">{p.operator}</span>
                  </td>
                  <td className={tdClass}>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ts.bg} ${ts.text}`}>
                      {p.type}
                    </span>
                  </td>
                  <td className={`${tdClass} text-[#7A756E]`}>{p.status}</td>
                  <td className={tdClass}>
                    {p.distanceMiles > 0 ? (
                      <span className={
                        p.distanceMiles < 3 ? 'text-green-700 font-medium' :
                        p.distanceMiles < 10 ? 'text-amber-700 font-medium' :
                        'text-red-700 font-medium'
                      }>
                        {p.distanceMiles} mi
                      </span>
                    ) : (
                      <span className="text-[#7A756E]">&lt;1 mi</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ── Section: Gas Demand Analysis ──────────────────────────────────────────────

function GasDemandSection({ result }: { result: GasAnalysisResult }) {
  const { gasDemand } = result;
  const { combinedCycle: cc, simpleCycle: sc } = gasDemand;

  return (
    <SectionCard title="Gas Demand Analysis" badge={<StatusBadge variant="estimated" />}>
      <p className="text-xs text-[#7A756E] mb-4">
        Calculated for <strong>{gasDemand.targetMW} MW</strong> at{' '}
        <strong>{Math.round(gasDemand.capacityFactor * 100)}% capacity factor</strong>.
        Assumes HHV of 1,020 Btu/scf.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Combined Cycle */}
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-blue-900">Combined Cycle</h4>
            <span className="text-xs text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">
              {cc.heatRate.toLocaleString()} Btu/kWh HR
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-blue-800">Daily Demand</span>
              <span className="font-semibold text-blue-900">{cc.dailyDemandMMscf} MMscf/day</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-blue-800">Annual Demand</span>
              <span className="font-semibold text-blue-900">{cc.annualDemandBcf} Bcf/yr</span>
            </div>
          </div>
        </div>

        {/* Simple Cycle */}
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-purple-900">Simple Cycle / Peaker</h4>
            <span className="text-xs text-purple-700 bg-purple-100 rounded-full px-2 py-0.5">
              {sc.heatRate.toLocaleString()} Btu/kWh HR
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-purple-800">Daily Demand</span>
              <span className="font-semibold text-purple-900">{sc.dailyDemandMMscf} MMscf/day</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-purple-800">Annual Demand</span>
              <span className="font-semibold text-purple-900">{sc.annualDemandBcf} Bcf/yr</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard
          label="Recommended Lateral Sizing (CC + 30% margin)"
          value={`${gasDemand.recommendedLateralSizingMMscf} MMscf/day`}
          accent="blue"
        />
        <StatCard
          label="Inlet Pressure Requirement"
          value={gasDemand.pressureRequirementPSIG}
          sub="For large gas turbines"
          accent="blue"
        />
      </div>
    </SectionCard>
  );
}

// ── Section: Lateral Construction Estimate ────────────────────────────────────

function LateralEstimateSection({ result }: { result: GasAnalysisResult }) {
  const lat = result.lateralEstimate;
  const risk = lat.riskLevel;

  return (
    <SectionCard title="Lateral Construction Estimate" badge={<StatusBadge variant="estimated" />}>
      <p className="text-xs text-[#7A756E] mb-4">
        Based on FERC 2024–25 average of $12.1M/mile. Range: $8M–$16M/mile depending on terrain,
        HDD river crossings, permitting complexity, and labor market.
      </p>

      {/* Risk Banner */}
      <div className={`rounded-lg border px-4 py-3 mb-4 ${riskBg(risk)}`}>
        <div className="flex items-start gap-2">
          <svg className={`h-4 w-4 mt-0.5 flex-shrink-0 ${riskColor(risk)}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {risk === 'low'
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            }
          </svg>
          <div>
            <p className={`text-sm font-semibold ${riskColor(risk)}`}>
              {risk === 'low'   && 'Low Risk — Pipeline within 3 miles'}
              {risk === 'medium' && 'Medium Risk — Pipeline 3–10 miles away'}
              {risk === 'high'  && 'High Risk — Pipeline >10 miles away'}
            </p>
            <p className={`text-xs mt-0.5 ${riskColor(risk)}`}>
              Nearest pipeline: {lat.distanceToNearestPipeline} miles
              {lat.distanceToNearestPipeline === 50 && ' (no pipeline found — defaulted to 50 mi estimate)'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Distance to Nearest Pipeline"
          value={`${lat.distanceToNearestPipeline} mi`}
          accent={risk === 'low' ? 'green' : risk === 'medium' ? 'amber' : 'red'}
        />
        <StatCard
          label="Est. Lateral Cost (Low)"
          value={formatMoney(lat.estimatedTotalCost.low)}
          sub="$8M/mile"
          accent="blue"
        />
        <StatCard
          label="Est. Lateral Cost (High)"
          value={formatMoney(lat.estimatedTotalCost.high)}
          sub="$16M/mile"
          accent="blue"
        />
        <StatCard
          label="Recommended Diameter"
          value={`${lat.pipelineDiameterInches}"`}
          sub="Approximate"
          accent="blue"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-[#D8D5D0] bg-[#FAFAF9] p-4">
          <p className="text-xs text-[#7A756E] mb-1">Construction Timeline</p>
          <p className="text-lg font-semibold font-heading text-[#201F1E]">
            {lat.timelineMonths.low}–{lat.timelineMonths.high} months
          </p>
          <p className="text-xs text-[#7A756E] mt-0.5">FERC/State permitting + construction</p>
        </div>
        <div className="rounded-xl border border-[#D8D5D0] bg-[#FAFAF9] p-4">
          <p className="text-xs text-[#7A756E] mb-1">Permit Authority</p>
          <p className="text-sm font-semibold text-[#201F1E] leading-snug">{lat.permitAuthority}</p>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Section: Regional Production Context ─────────────────────────────────────

function ProductionContextSection({ result }: { result: GasAnalysisResult }) {
  const { productionContext } = result;

  return (
    <SectionCard title="Regional Production Context" badge={<StatusBadge variant="estimated" />}>
      <p className="text-xs text-[#7A756E] mb-4">
        Proximity to major US gas-producing basins. Closer proximity generally indicates
        more pipeline infrastructure and competitive gas pricing.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <StatCard
          label="Nearest Basin"
          value={productionContext.nearestBasin ?? 'Unknown'}
          accent="blue"
        />
        <StatCard
          label="Proximity to Basin Center"
          value={productionContext.basinProximityMiles != null
            ? `${productionContext.basinProximityMiles} miles`
            : 'Unknown'}
          accent={
            (productionContext.basinProximityMiles ?? 999) < 50 ? 'green' :
            (productionContext.basinProximityMiles ?? 999) < 150 ? 'amber' : 'blue'
          }
        />
      </div>

      <div className="rounded-lg bg-stone-50 border border-[#D8D5D0] px-4 py-3">
        <p className="text-sm text-[#201F1E]">{productionContext.note}</p>
      </div>
    </SectionCard>
  );
}

// ── Section: LDC Assessment ───────────────────────────────────────────────────

function LDCAssessmentSection({ result }: { result: GasAnalysisResult }) {
  const { ldcAssessment } = result;

  return (
    <SectionCard title="LDC Availability Assessment" badge={<StatusBadge variant="action" />}>
      <p className="text-xs text-[#7A756E] mb-3">
        Local Distribution Company (LDC) service availability for large industrial loads.
      </p>

      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
        <div className="flex items-start gap-2">
          <svg className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-amber-900">{ldcAssessment.note}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'LDC Availability', value: 'Manual Verification Required' },
          { label: 'Typical Interconnect Size', value: '>10 MMscf/day → Industrial Transport' },
          { label: 'Next Step', value: 'Contact State PUC for LDC map' },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-[#D8D5D0] bg-[#FAFAF9] p-3">
            <p className="text-xs text-[#7A756E] mb-1">{item.label}</p>
            <p className="text-xs font-semibold text-[#201F1E] leading-snug">{item.value}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

export default function GasReport({ result }: { result: GasAnalysisResult }) {
  const ts = new Date(result.timestamp).toLocaleString();

  return (
    <div className="space-y-5">
      {/* Report Header */}
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-heading text-base font-semibold text-[#201F1E]">
              Gas Infrastructure Due Diligence Report
            </h3>
            <p className="text-xs text-[#7A756E] mt-0.5">
              {result.lat.toFixed(5)}, {result.lng.toFixed(5)}
              {result.detectedState && ` · ${result.detectedState}`}
              {' · '}{result.gasDemand.targetMW} MW @ {Math.round(result.gasDemand.capacityFactor * 100)}% CF
            </p>
          </div>
          <span className="text-xs text-[#7A756E]">Generated {ts}</span>
        </div>

        {/* Quick summary row */}
        <div className="mt-4 pt-4 border-t border-[#D8D5D0] grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-[#7A756E]">Pipelines Found</p>
            <p className="font-semibold text-[#201F1E]">{result.pipelines.length} within 20 mi</p>
          </div>
          <div>
            <p className="text-xs text-[#7A756E]">Nearest Pipeline</p>
            <p className="font-semibold text-[#201F1E]">
              {result.pipelines.length > 0 ? `${result.pipelines[0].distanceMiles} mi` : 'None found'}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#7A756E]">CC Daily Demand</p>
            <p className="font-semibold text-[#201F1E]">{result.gasDemand.combinedCycle.dailyDemandMMscf} MMscf/day</p>
          </div>
          <div>
            <p className="text-xs text-[#7A756E]">Nearest Basin</p>
            <p className="font-semibold text-[#201F1E]">{result.productionContext.nearestBasin ?? '—'}</p>
          </div>
        </div>
      </div>

      <PipelineSummarySection result={result} />
      <PipelineTableSection pipelines={result.pipelines} />
      <GasDemandSection result={result} />
      <LateralEstimateSection result={result} />
      <ProductionContextSection result={result} />
      <LDCAssessmentSection result={result} />
    </div>
  );
}
