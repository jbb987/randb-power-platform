import type {
  LaborAnalysisResult,
  IndustryRow,
  OccupationRow,
  EducationDistribution,
  LaborBenchmark,
} from '../../lib/laborAnalysis';

// ── Shared sub-components (mirror GasReport tokens) ──────────────────────────

function SectionCard({ title, badge, children, subtitle }: {
  title: string;
  badge?: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-heading text-base font-semibold text-[#201F1E]">{title}</h3>
          {subtitle && <p className="text-xs text-[#7A756E] mt-0.5">{subtitle}</p>}
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub }: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-[#FAFAF9] rounded-xl border border-[#D8D5D0] p-4">
      <p className="text-xs text-[#7A756E] mb-1">{label}</p>
      <p className="text-lg font-semibold font-heading text-[#201F1E]">{value}</p>
      {sub && <p className="text-xs text-[#7A756E] mt-0.5">{sub}</p>}
    </div>
  );
}

function StatusBadge({ variant }: { variant: 'verified' | 'estimated' | 'modeled' }) {
  const styles = {
    verified:  { bg: 'bg-green-100', text: 'text-green-800', label: 'VERIFIED' },
    estimated: { bg: 'bg-blue-100',  text: 'text-blue-800',  label: 'ESTIMATED' },
    modeled:   { bg: 'bg-amber-100', text: 'text-amber-800', label: 'MODELED' },
  }[variant];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles.bg} ${styles.text}`}>
      {styles.label}
    </span>
  );
}

function GeoBadge({ level }: { level: 'msa' | 'state' | 'national' }) {
  const map = {
    msa:      { bg: 'bg-stone-100',  text: 'text-stone-700',  label: 'MSA' },
    state:    { bg: 'bg-amber-50',   text: 'text-amber-800',  label: 'STATE' },
    national: { bg: 'bg-stone-100',  text: 'text-stone-700',  label: 'US' },
  }[level];
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${map.bg} ${map.text}`}>
      {map.label}
    </span>
  );
}

const thClass = 'text-left text-[10px] font-semibold uppercase tracking-wider text-[#7A756E] py-2 px-3';
const tdClass = 'py-2.5 px-3 text-sm text-[#201F1E]';

// ── Formatters ──────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || isNaN(v)) return '—';
  // v may be 0–1 fraction or already a percent — assume 0–1 here (we control inputs)
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
  // Scale each bar to the max of the three so the visual is comparable.
  const max = Math.max(county, state, national, 0.0001);
  const w = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div>
      <p className="text-xs text-[#7A756E] mb-2">{label}</p>
      <div className="space-y-1.5">
        <Row tag="This site" value={fmt(county)} width={w(county)} accent />
        <Row tag="State"     value={fmt(state)}    width={w(state)} />
        <Row tag="US"        value={fmt(national)} width={w(national)} />
      </div>
    </div>
  );
}

function Row({ tag, value, width, accent = false }: { tag: string; value: string; width: string; accent?: boolean }) {
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

// ── Section: Pool Summary ───────────────────────────────────────────────────

function PoolSummarySection({ result }: { result: LaborAnalysisResult }) {
  const { laborForce, population, unemploymentRate, medianHouseholdIncome, benchmarks } = result;
  const geoLabel = result.resolvedCounty
    ? `${result.resolvedCounty.name}, ${result.resolvedCounty.state}`
    : 'County of record';

  return (
    <SectionCard
      title="Pool Summary"
      subtitle={`Workforce within ${geoLabel}.`}
      badge={<StatusBadge variant="verified" />}
    >
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
        <StatCard
          label="Median Household Income"
          value={fmtMoney(medianHouseholdIncome)}
        />
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
  const total = industries.reduce((sum, r) => sum + r.employed, 0);
  const max = Math.max(...industries.map((r) => r.employed), 1);

  return (
    <SectionCard
      title="Workers by Industry"
      subtitle="Top NAICS sectors in the county."
      badge={<StatusBadge variant="verified" />}
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

// ── Section: Workers by Occupation ──────────────────────────────────────────

function OccupationsBarsSection({ occupations }: { occupations: OccupationRow[] }) {
  const employed = occupations.filter((o) => o.employed != null);
  const total = employed.reduce((sum, r) => sum + (r.employed ?? 0), 0);
  const max = Math.max(...employed.map((r) => r.employed ?? 0), 1);

  return (
    <SectionCard
      title="Workers by Occupation"
      subtitle="Major SOC occupational groups."
      badge={<StatusBadge variant="verified" />}
    >
      <div className="space-y-2">
        {employed.map((row) => {
          const share = total > 0 ? (row.employed ?? 0) / total : 0;
          return (
            <div key={row.socCode} className="flex items-center gap-3">
              <span className="w-56 shrink-0 text-sm text-[#201F1E] truncate" title={row.socName}>
                {row.socName}
              </span>
              <div className="flex-1 h-3 rounded-full bg-stone-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-stone-500/70"
                  style={{ width: `${((row.employed ?? 0) / max) * 100}%` }}
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
}: {
  education: EducationDistribution;
  benchmarks: { state: LaborBenchmark; national: LaborBenchmark };
}) {
  const rows: Array<{ key: keyof EducationDistribution; label: string }> = [
    { key: 'noHs',         label: 'No high school' },
    { key: 'hs',           label: 'High school' },
    { key: 'someCollege',  label: 'Some college' },
    { key: 'associate',    label: "Associate's" },
    { key: 'bachelor',     label: "Bachelor's" },
    { key: 'graduate',     label: 'Graduate' },
  ];
  const countyBach = (education.bachelor ?? 0) + (education.graduate ?? 0);
  const max = Math.max(...rows.map((r) => education[r.key] ?? 0), 0.4);

  return (
    <SectionCard
      title="Education Distribution"
      subtitle="Share of working-age population (16+)."
      badge={<StatusBadge variant="estimated" />}
    >
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

function CommuteSection({ commute }: { commute: LaborAnalysisResult['commute'] }) {
  const modes: Array<{ key: keyof typeof commute.modeShare; label: string }> = [
    { key: 'car',     label: 'Car (alone)' },
    { key: 'carpool', label: 'Carpool' },
    { key: 'transit', label: 'Transit' },
    { key: 'wfh',     label: 'WFH' },
    { key: 'other',   label: 'Other' },
  ];

  return (
    <SectionCard
      title="Commute Patterns"
      subtitle="How workers get to work."
      badge={<StatusBadge variant="verified" />}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <StatCard
          label="Mean travel time"
          value={`${commute.meanTravelTimeMinutes.toFixed(1)} min`}
        />
        <StatCard
          label="Drive alone"
          value={fmtPct(commute.modeShare.car, 0)}
        />
        <StatCard
          label="Work from home"
          value={fmtPct(commute.modeShare.wfh, 0)}
        />
      </div>

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
  const subtitle = msaName
    ? `Hourly wage percentiles, ${msaName} MSA. Falls back to state when an MSA cell is suppressed.`
    : 'Hourly wage percentiles. Geography level shown per row.';
  return (
    <SectionCard
      title="Wages by Occupation"
      subtitle={subtitle}
      badge={<StatusBadge variant="estimated" />}
    >
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
                    <td className={tdClass + ' text-right tabular-nums font-semibold'}>{fmtWage(r.wages.p50)}</td>
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

// ── Sources & Vintages footer ───────────────────────────────────────────────

function SourcesFooter({ vintages }: { vintages: LaborAnalysisResult['vintages'] }) {
  return (
    <div className="rounded-xl border border-dashed border-[#D8D5D0] px-4 py-3 text-xs text-[#7A756E]">
      <span className="font-medium text-[#201F1E]">Sources</span>
      <span className="mx-2">·</span>
      <span>ACS {vintages.acs}</span>
      <span className="mx-1.5">·</span>
      <span>QCEW {vintages.qcew}</span>
      <span className="mx-1.5">·</span>
      <span>OEWS {vintages.oews}</span>
      <span className="mx-1.5">·</span>
      <span>LAUS {vintages.laus}</span>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function LaborReport({ result }: { result: LaborAnalysisResult }) {
  return (
    <div className="space-y-4">
      <PoolSummarySection result={result} />
      <IndustriesSection industries={result.industries} />
      <OccupationsBarsSection occupations={result.wagesByOccupation} />
      <EducationSection education={result.education} benchmarks={result.benchmarks} />
      <CommuteSection commute={result.commute} />
      <WagesSection rows={result.wagesByOccupation} msaName={result.resolvedMsa?.name ?? null} />
      <SourcesFooter vintages={result.vintages} />
    </div>
  );
}
