/**
 * Methodology + glossary section, rendered below the Well Finder map.
 * Explains how the Reactivation Score is computed, what each badge means,
 * and the hard limitations.
 */

export default function Methodology() {
  return (
    <section className="mt-8 max-w-5xl mx-auto px-4 pb-12 text-[#201F1E]">
      <h2 className="font-heading text-2xl font-semibold mb-4">Methodology</h2>

      <p className="text-sm text-[#7A756E] mb-6 leading-relaxed">
        Well Finder ranks Texas oil &amp; gas wells by reactivation potential. Every well on the
        map carries a composite score blending production history, operator pressure, cost
        feasibility, and regulatory deadlines. Records refresh monthly so distress signals,
        deadlines, and orphan listings stay current.
      </p>

      {/* ── How the Reactivation Score is computed ─────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#D8D5D0] p-5 mb-6">
        <h3 className="font-heading text-lg font-semibold mb-3">Reactivation Score (0–100)</h3>
        <p className="text-sm text-[#7A756E] mb-4">
          A weighted blend of four components, computed per well. Wells already plugged score
          zero (disqualified). The score is a decision-support signal, not a guaranteed return.
        </p>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-[#7A756E]">
            <tr className="border-b border-[#D8D5D0]">
              <th className="text-left py-2 pr-3">Component</th>
              <th className="text-right py-2 pr-3 w-20">Weight</th>
              <th className="text-left py-2">What it measures</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0EDE9]">
            <tr>
              <td className="py-2 pr-3 font-medium">Production</td>
              <td className="py-2 pr-3 text-right font-mono">40%</td>
              <td className="py-2">
                Was the well a real producer? Combines the last 12-month rate before shut-in,
                initial production rate (IP), lifetime cumulative volume, and total months active.
                Higher = strong historical performer.
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-3 font-medium">Operator opportunity</td>
              <td className="py-2 pr-3 text-right font-mono">30%</td>
              <td className="py-2">
                Is the operator distressed? Orphan-listed wells score highest, plus signals from
                P-5 delinquency status and W-3X plugging-extension denials. Higher = motivated seller.
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-3 font-medium">Cost feasibility</td>
              <td className="py-2 pr-3 text-right font-mono">20%</td>
              <td className="py-2">
                How cheap is the well to handle? Driven by the State Managed Plugging cost estimate
                and well depth. Shallow + low plug cost ≈ shallow + low workover cost.
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-3 font-medium">Time pressure</td>
              <td className="py-2 pr-3 text-right font-mono">10%</td>
              <td className="py-2">
                How close is the SB 1150 plug-or-reactivate deadline? Wells already past trigger score
                100; wells &gt;5 years out score 5. Closer deadline = more urgent decision for the
                current operator.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Glossary ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#D8D5D0] p-5 mb-6">
        <h3 className="font-heading text-lg font-semibold mb-3">Glossary</h3>
        <dl className="space-y-3 text-sm">
          <Term term="Orphan well">
            A well whose operator's P-5 organization report has been delinquent (unrenewed) for more
            than 12 months. The "Orphan (N&nbsp;mo)" badge in the popup is the count of months the
            operator has been P-5 inactive — higher = deeper distress. Texas <strong>SB 1146</strong>
            {' '}(effective 2025) lets a reactivator take over an orphan well via <strong>Form P-4</strong>
            {' '}with limited liability, plus $0.50/foot State Managed Plugging reimbursement when
            restored to continuous service.
          </Term>
          <Term term="P-5 delinquent">
            All Texas operators must annually file <strong>Form P-5</strong> (Organization Report)
            to maintain their license. The "P-5 delinquent" badge means the operator was in
            delinquent status when this well's record was last generated. After 12+ months
            delinquent, the operator's wells land on the orphan list.
          </Term>
          <Term term="W-3X (Plugging Extension)">
            <strong>Statewide Rule 14</strong> requires inactive wells to be plugged within 12 months.
            <strong> Form W-3X</strong> is the operator's request for an extension. Status codes:
            <span className="block mt-1 ml-3 text-[#7A756E]">
              <strong>A</strong> = active extension granted &nbsp;·&nbsp;
              <strong>D</strong> = denied (operator must plug or restore production) &nbsp;·&nbsp;
              <strong>P</strong> = pending review &nbsp;·&nbsp;
              <strong>blank</strong> = no extension on file
            </span>
            "W-3X D" is a strong forced-decision signal — the operator is on the plug clock.
          </Term>
          <Term term="Plug/reactivate by (SB 1150 deadline)">
            Texas <strong>SB 1150</strong> (effective Sept 1, 2027) requires that any well meeting{' '}
            <strong>both</strong> conditions — 25+ years old AND 15+ years inactive — be either
            plugged or returned to production. Per-well deadline = max(completion + 25 yrs, shut-in +
            15 yrs, 2027-09-01). "in 16 mo" means the well crosses that threshold in 16 months;
            "12 mo past" means it already crossed it. The closer the deadline, the more motivated the
            current operator to either plug or sell — both create reactivation opportunities.
          </Term>
          <Term term="Cum oil / Cum gas">
            Lifetime cumulative production volume for the well, in barrels (oil) or thousand cubic
            feet (gas). Texas reports oil at lease level (multi-well leases share one production
            number); when allocation is approximated 1/N across wells on a lease, the popup flags
            it as "est."
          </Term>
          <Term term="Last 12-mo rate">
            Average daily production rate over the last 12 months of activity before the well went
            inactive (or current rate for active wells). Strongest single signal of reservoir
            performance at the moment of shut-in.
          </Term>
          <Term term="IP (Initial Production)">
            Average daily production rate over the first 6 months after the well came online. Proxy
            for completion quality and reservoir energy.
          </Term>
          <Term term="Total recoverable (Arps EUR)">
            Estimated Ultimate Recovery — the total volume (barrels or mcf) the well is forecast to
            produce over its remaining lifetime, computed by fitting an Arps hyperbolic decline
            curve to the well's monthly production history. <em>This is a volume, not a dollar
            value.</em> Bounded by economic limit assumptions; treat as a directional estimate, not
            a reserve report.
          </Term>
          <Term term="Plug cost estimate">
            State Managed Plugging Program (SMP) internal cost estimate for plugging this specific
            well, in dollars. Useful as both a cleanup-liability measure and a workover-cost proxy
            (similar depth + complexity).
          </Term>
        </dl>
      </div>

      {/* ── Coverage ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#D8D5D0] p-5 mb-6">
        <h3 className="font-heading text-lg font-semibold mb-3">Coverage</h3>
        <ul className="text-sm space-y-2 list-disc pl-5">
          <li>
            <strong>~1.4 million wells statewide</strong> — every active, inactive, shut-in, and
            plugged well in Texas, with operator, status, and coordinates.
          </li>
          <li>
            <strong>Inactive-well compliance</strong> — operator, P-5 number, lease, field, depth,
            shut-in date, months inactive, W-3X extension status, plug cost estimate, and
            compliance due date for every well that has been inactive 12+ months.
          </li>
          <li>
            <strong>Orphan listings</strong> — operators with P-5 delinquent &gt;12 months,
            with months-delinquent counter for distress depth.
          </li>
          <li>
            <strong>Full production history since 1993</strong> — every monthly cycle for every
            Texas lease, used to compute cum oil/gas, IP, last 12-month rate, and Arps decline
            curve fits.
          </li>
          <li>
            <strong>Refresh cadence: monthly.</strong> Distress signals, orphan listings, and
            compliance deadlines are re-pulled each month so the rankings reflect the current
            state of the operator universe.
          </li>
        </ul>
      </div>

      {/* ── What this tool can't tell you ──────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#D8D5D0] p-5 mb-6">
        <h3 className="font-heading text-lg font-semibold mb-3">What this tool can't tell you</h3>
        <p className="text-sm text-[#7A756E] mb-3">
          Use the rankings to build a short list — then verify on the ground before committing
          capital. The score does not capture:
        </p>
        <ul className="text-sm space-y-2 list-disc pl-5">
          <li>
            <strong>Per-well oil split on multi-well leases</strong>. Oil volumes are reported at
            lease level; allocation across wells on a shared lease is approximated 1/N (flagged
            "est." in the popup). Real per-well allocation requires test-data weighting.
          </li>
          <li>
            <strong>Water cut</strong>. Reactivation economics swing on water/oil ratio — verify
            via H-10 / W-10 injection records or the operator's last well files before budgeting.
          </li>
          <li>
            <strong>Mechanical integrity</strong>. A high-scoring well still requires a casing /
            integrity test (H-15) before workover budgeting. Casing failure can turn a $50K
            reactivation into a $300K project.
          </li>
          <li>
            <strong>Mineral lease status</strong>. Long-shut-in leases may have terminated under
            HBP (held-by-production) clauses; verify with county clerk records before signing
            anything.
          </li>
          <li>
            <strong>Reactivation cost</strong>. The plug cost shown is a directional proxy. Real
            workover budgeting depends on rod string condition, downhole equipment, and a
            field walkdown — none of which are captured in regulatory data.
          </li>
          <li>
            <strong>Recent shut-ins.</strong> Production reporting settles slowly — wells that
            just shut in this month may not yet show that change. Always cross-check current
            status before contacting an operator.
          </li>
        </ul>
      </div>

      {/* ── How to use ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#D8D5D0] p-5">
        <h3 className="font-heading text-lg font-semibold mb-3">How to use it</h3>
        <ol className="text-sm space-y-2 list-decimal pl-5">
          <li>
            Start with the sidebar's default sort by score descending — the top entries are
            statewide, ranked by composite reactivation potential.
          </li>
          <li>
            Use the <strong>Min reactivation score</strong> slider to narrow to high-confidence
            candidates (60+ is "actionable", 80+ is the A-list).
          </li>
          <li>
            Combine with <strong>Orphan-listed only</strong> for distressed-operator candidates
            adoptable under SB 1146 / Form P-4.
          </li>
          <li>
            Combine with <strong>SB 1150 deadline</strong> &lt;24mo to find wells the current
            operator <em>must</em> resolve in the next two years — maximum motivated-seller signal.
          </li>
          <li>
            Click any candidate row → map flies to the well, popup opens with the full breakdown,
            and aerial-view links open the location in Google Maps / Earth / Bing 3D for visual
            site review.
          </li>
        </ol>
      </div>
    </section>
  );
}

function Term({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-[#201F1E]">{term}</dt>
      <dd className="text-[#7A756E] mt-0.5">{children}</dd>
    </div>
  );
}
