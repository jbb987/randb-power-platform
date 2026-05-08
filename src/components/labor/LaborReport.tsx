import type {
  LaborAnalysisResult,
  IndustryRow,
  OccupationRow,
  EducationDistribution,
  LaborBenchmark,
} from '../../lib/laborAnalysis';

// ── Shared sub-components ───────────────────────────────────────────────────

function SectionCard({
  title,
  children,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
      <div className="mb-4">
        <h3 className="font-heading text-base font-semibold text-[#201F1E]">{title}</h3>
        {subtitle && <p className="text-xs text-[#7A756E] mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#FAFAF9] rounded-xl border border-[#D8D5D0] p-4">
      <p className="text-xs text-[#7A756E] mb-1">{label}</p>
      <p className="text-lg font-semibold font-heading text-[#201F1E]">{value}</p>
      {sub && <p className="text-xs text-[#7A756E] mt-0.5">{sub}</p>}
    </div>
  );
}

function GeoBadge({ level }: { level: 'msa' | 'state' | 'national' }) {
  const map = {
    msa: { bg: 'bg-stone-100', text: 'text-stone-700', label: 'MSA' },
    state: { bg: 'bg-amber-50', text: 'text-amber-800', label: 'STATE' },
    national: { bg: 'bg-stone-100', text: 'text-stone-700', label: 'US' },
  }[level];
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${map.bg} ${map.text}`}
    >
      {map.label}
    </span>
  );
}

const thClass =
  'text-left text-[10px] font-semibold uppercase tracking-wider text-[#7A756E] py-2 px-3';
const tdClass = 'py-2.5 px-3 text-sm text-[#201F1E]';

// ── Formatters ──────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || isNaN(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

function fmtPctRaw(v: number | null | undefined, digits = 1): string {
  if (v == null || isNaN(v)) return '—';
  return `${v.toFixed(digits)}%`;
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString()}`;
}

function fmtMoneyFull(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  return `$${n.toLocaleString()}`;
}

function fmtWage(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  return `$${n.toFixed(2)}`;
}

// ── Mini-bar (county vs state vs national comparison) ───────────────────────

function CompareBar({
  label,
  county,
  state,
  national,
  format = 'pct-fraction',
}: {
  label: string;
  county: number;
  state: number;
  national: number;
  format?: 'pct-fraction' | 'pct-raw' | 'money';
}) {
  const fmt = (v: number) => {
    if (format === 'pct-fraction') return fmtPct(v);
    if (format === 'pct-raw') return fmtPctRaw(v);
    return fmtMoneyFull(v);
  };
  const max = Math.max(county, state, national, 0.0001);
  const w = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div>
      <p className="text-xs text-[#7A756E] mb-2">{label}</p>
      <div className="space-y-1.5">
        <Row tag="This site" value={fmt(county)} width={w(county)} accent />
        <Row tag="State" value={fmt(state)} width={w(state)} />
        <Row tag="US" value={fmt(national)} width={w(national)} />
      </div>
    </div>
  );
}

function Row({
  tag,
  value,
  width,
  accent = false,
}: {
  tag: string;
  value: string;
  width: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] text-[#7A756E]">{tag}</span>
      <div className="flex-1 h-2 rounded-full bg-stone-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${accent ? 'bg-[#ED202B]' : 'bg-stone-400'}`}
          style={{ width }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-xs font-medium text-[#201F1E]">{value}</span>
    </div>
  );
}

// ── Data source notices (failed sources + seed-estimate flags) ─────────────

function DataSourceNotices({ result }: { result: LaborAnalysisResult }) {
  const hard: string[] = [];
  const soft: string[] = [];
  if (result.acsError) hard.push(result.acsError);
  if (result.qcewError) soft.push(result.qcewError);
  if (result.oewsError) soft.push(result.oewsError);
  if (result.lausError) soft.push(result.lausError);
  if (hard.length === 0 && soft.length === 0) return null;

  return (
    <div className="space-y-2">
      {hard.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-xs font-semibold text-red-800 mb-1">Data unavailable</p>
          <ul className="text-xs text-red-800 space-y-0.5">
            {hard.map((m, i) => (
              <li key={i}>· {m}</li>
            ))}
          </ul>
        </div>
      )}
      {soft.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-900 mb-1">Estimates in use</p>
          <ul className="text-xs text-amber-900 space-y-0.5">
            {soft.map((m, i) => (
              <li key={i}>· {m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Geography header (county + MSA the data covers) ────────────────────────

function GeographyHeader({ result }: { result: LaborAnalysisResult }) {
  const parts: string[] = [];
  if (result.resolvedCounty)
    parts.push(`${result.resolvedCounty.name}, ${result.resolvedCounty.state}`);
  if (result.resolvedMsa) parts.push(`${result.resolvedMsa.name} MSA`);
  if (parts.length === 0) return null;
  return <p className="text-sm text-[#7A756E]">{parts.join(' · ')}</p>;
}

// ── Section: Pool Summary ───────────────────────────────────────────────────

function PoolSummarySection({ result }: { result: LaborAnalysisResult }) {
  const { laborForce, population, unemploymentRate, medianHouseholdIncome, benchmarks } = result;

  if (result.acsError) {
    return (
      <SectionCard title="Pool Summary">
        <p className="text-sm text-[#7A756E] italic">Data unavailable for this county.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Pool Summary">
      <div className="mb-5">
        <p className="text-3xl font-heading font-semibold text-[#201F1E]">
          {fmtNum(laborForce.total)}
        </p>
        <p className="text-sm text-[#7A756E] mt-0.5">
          workers in the labor force&nbsp;·&nbsp;out of {fmtNum(population.total)} residents
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Population"
          value={fmtNum(population.total)}
          sub={`${fmtNum(population.workingAge16Plus)} working-age (16+)`}
        />
        <StatCard
          label="Employed"
          value={fmtNum(laborForce.employed)}
          sub={`${fmtNum(laborForce.unemployed)} unemployed`}
        />
        <StatCard
          label="Unemployment"
          value={fmtPctRaw(unemploymentRate.current)}
          sub={unemploymentRate.vintage}
        />
        <StatCard label="Median Household Income" value={fmtMoney(medianHouseholdIncome)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <CompareBar
          label="Labor force participation rate"
          county={laborForce.participationRate}
          state={benchmarks.state.laborForceParticipationRate}
          national={benchmarks.national.laborForceParticipationRate}
        />
        <CompareBar
          label="Unemployment rate"
          county={unemploymentRate.current}
          state={benchmarks.state.unemploymentRate}
          national={benchmarks.national.unemploymentRate}
          format="pct-raw"
        />
      </div>
    </SectionCard>
  );
}

// ── Section: Workers by Industry ────────────────────────────────────────────

function IndustriesSection({ industries }: { industries: IndustryRow[] }) {
  if (industries.length === 0) {
    return (
      <SectionCard
        title="Workers by Industry"
        subtitle="Private-sector employment by NAICS supersector (BLS QCEW)"
      >
        <p className="text-sm text-[#7A756E] italic">Data unavailable for this county.</p>
      </SectionCard>
    );
  }
  const total = industries.reduce((sum, r) => sum + r.employed, 0);
  const max = Math.max(...industries.map((r) => r.employed), 1);

  return (
    <SectionCard
      title="Workers by Industry"
      subtitle="Private-sector employment by NAICS supersector (BLS QCEW)"
    >
      <div className="space-y-2">
        {industries.map((row) => {
          const share = total > 0 ? row.employed / total : 0;
          return (
            <div key={row.naicsCode} className="flex items-center gap-3">
              <span className="w-56 shrink-0 text-sm text-[#201F1E] truncate" title={row.naicsName}>
                {row.naicsName}
              </span>
              <div className="flex-1 h-3 rounded-full bg-stone-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#ED202B]/80"
                  style={{ width: `${(row.employed / max) * 100}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-sm font-medium text-[#201F1E]">
                {fmtNum(row.employed)}
              </span>
              <span className="w-12 shrink-0 text-right text-xs text-[#7A756E]">
                {(share * 100).toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ── Section: Education Distribution ─────────────────────────────────────────

function EducationSection({
  education,
  benchmarks,
  unavailable,
}: {
  education: EducationDistribution;
  benchmarks: { state: LaborBenchmark; national: LaborBenchmark };
  unavailable?: boolean;
}) {
  if (unavailable) {
    return (
      <SectionCard title="Education Distribution">
        <p className="text-sm text-[#7A756E] italic">Data unavailable for this county.</p>
      </SectionCard>
    );
  }
  const rows: Array<{ key: keyof EducationDistribution; label: string }> = [
    { key: 'noHs', label: 'No high school' },
    { key: 'hs', label: 'High school' },
    { key: 'someCollege', label: 'Some college' },
    { key: 'associate', label: "Associate's" },
    { key: 'bachelor', label: "Bachelor's" },
    { key: 'graduate', label: 'Graduate' },
  ];
  const countyBach = (education.bachelor ?? 0) + (education.graduate ?? 0);
  const max = Math.max(...rows.map((r) => education[r.key] ?? 0), 0.4);

  return (
    <SectionCard title="Education Distribution">
      <div className="space-y-2 mb-5">
        {rows.map((r) => {
          const v = education[r.key] ?? 0;
          return (
            <div key={r.key} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-sm text-[#201F1E]">{r.label}</span>
              <div className="flex-1 h-3 rounded-full bg-stone-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#ED202B]/80"
                  style={{ width: `${(v / max) * 100}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-sm font-medium text-[#201F1E]">
                {fmtPct(v, 0)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-[#D8D5D0] pt-4">
        <CompareBar
          label="Bachelor's degree or higher"
          county={countyBach}
          state={benchmarks.state.educationBachelorPlus}
          national={benchmarks.national.educationBachelorPlus}
        />
      </div>
    </SectionCard>
  );
}

// ── Section: Commute ────────────────────────────────────────────────────────

function CommuteSection({
  commute,
  unavailable,
}: {
  commute: LaborAnalysisResult['commute'];
  unavailable?: boolean;
}) {
  if (unavailable) {
    return (
      <SectionCard title="Commute Patterns">
        <p className="text-sm text-[#7A756E] italic">Data unavailable for this county.</p>
      </SectionCard>
    );
  }
  const modes: Array<{ key: keyof typeof commute.modeShare; label: string }> = [
    { key: 'car', label: 'Car (alone)' },
    { key: 'carpool', label: 'Carpool' },
    { key: 'transit', label: 'Transit' },
    { key: 'wfh', label: 'WFH' },
    { key: 'other', label: 'Other' },
  ];

  return (
    <SectionCard title="Commute Patterns">
      <p className="text-sm text-[#7A756E] mb-4">
        Mean travel time&nbsp;·&nbsp;
        <span className="font-medium text-[#201F1E]">
          {commute.meanTravelTimeMinutes.toFixed(1)} min
        </span>
      </p>

      <div className="space-y-1.5">
        {modes.map((m) => (
          <div key={m.key} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-sm text-[#201F1E]">{m.label}</span>
            <div className="flex-1 h-2 rounded-full bg-stone-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-stone-500/70"
                style={{ width: `${(commute.modeShare[m.key] ?? 0) * 100}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-xs font-medium text-[#201F1E]">
              {fmtPct(commute.modeShare[m.key] ?? 0, 0)}
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Section: Wages by Occupation ────────────────────────────────────────────

function WagesSection({ rows, msaName }: { rows: OccupationRow[]; msaName: string | null }) {
  if (rows.length === 0) {
    return (
      <SectionCard title="Wages by Occupation" subtitle="Hourly wage percentiles (BLS OEWS)">
        <p className="text-sm text-[#7A756E] italic">Data unavailable for this state.</p>
      </SectionCard>
    );
  }
  const subtitle = msaName
    ? `Hourly wage percentiles, ${msaName} MSA. Falls back to state when an MSA cell is suppressed.`
    : 'Hourly wage percentiles, state level (BLS OEWS).';
  return (
    <SectionCard title="Wages by Occupation" subtitle={subtitle}>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#D8D5D0]">
              <th className={thClass}>Occupation</th>
              <th className={thClass}>Geo</th>
              <th className={thClass + ' text-right'}>P10</th>
              <th className={thClass + ' text-right'}>P25</th>
              <th className={thClass + ' text-right'}>P50</th>
              <th className={thClass + ' text-right'}>P75</th>
              <th className={thClass + ' text-right'}>P90</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.socCode} className="border-b border-stone-100 last:border-0">
                <td className={tdClass}>
                  <div className="font-medium">{r.socName}</div>
                  <div className="text-[10px] text-[#7A756E]">{r.socCode}</div>
                </td>
                <td className={tdClass}>
                  <GeoBadge level={r.geographyUsed} />
                </td>
                {r.suppressed || !r.wages ? (
                  <td className={tdClass + ' text-right text-[#7A756E] italic'} colSpan={5}>
                    suppressed
                  </td>
                ) : (
                  <>
                    <td className={tdClass + ' text-right tabular-nums'}>{fmtWage(r.wages.p10)}</td>
                    <td className={tdClass + ' text-right tabular-nums'}>{fmtWage(r.wages.p25)}</td>
                    <td className={tdClass + ' text-right tabular-nums font-semibold'}>
                      {fmtWage(r.wages.p50)}
                    </td>
                    <td className={tdClass + ' text-right tabular-nums'}>{fmtWage(r.wages.p75)}</td>
                    <td className={tdClass + ' text-right tabular-nums'}>{fmtWage(r.wages.p90)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function LaborReport({ result }: { result: LaborAnalysisResult }) {
  return (
    <div className="space-y-4">
      <GeographyHeader result={result} />
      <DataSourceNotices result={result} />
      <PoolSummarySection result={result} />
      <IndustriesSection industries={result.industries} />
      <EducationSection
        education={result.education}
        benchmarks={result.benchmarks}
        unavailable={!!result.acsError}
      />
      <CommuteSection commute={result.commute} unavailable={!!result.acsError} />
      <WagesSection rows={result.wagesByOccupation} msaName={result.resolvedMsa?.name ?? null} />
    </div>
  );
}
