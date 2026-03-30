export default function Methodology() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-10 text-[#201F1E]">
      <div>
        <h2 className="font-heading text-xl font-semibold mb-2">Methodology &amp; Data Guide</h2>
        <p className="text-sm text-[#7A756E]">
          How this map works, the primary data sources it uses, the math behind
          the availability calculation, and its limitations. This section exists
          so anyone can reproduce, verify, or challenge the results.
        </p>
      </div>

      {/* ── Data Sources ── */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">1. Data Sources</h3>
        <p className="text-sm text-[#7A756E]">
          All data is fetched live from public federal APIs at page load.
          No data is hardcoded except fallback values used when an API is
          temporarily unreachable.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-[#D8D5D0] rounded-lg overflow-hidden">
            <thead className="bg-stone-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-[#7A756E]">Data</th>
                <th className="text-left px-4 py-2.5 font-medium text-[#7A756E]">Source</th>
                <th className="text-left px-4 py-2.5 font-medium text-[#7A756E]">Provider</th>
                <th className="text-left px-4 py-2.5 font-medium text-[#7A756E]">Update Freq.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8D5D0]">
              <tr>
                <td className="px-4 py-2.5">Power Generators (name, capacity, fuel type, location)</td>
                <td className="px-4 py-2.5 text-xs font-mono text-[#7A756E]">
                  Power_Plants_in_the_US / FeatureServer
                </td>
                <td className="px-4 py-2.5">GeoPlataform (EIA)</td>
                <td className="px-4 py-2.5">Monthly</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Substations (name, status, voltage, lines, coordinates)</td>
                <td className="px-4 py-2.5 text-xs font-mono text-[#7A756E]">
                  HIFLD_electric_power_substations / FeatureServer
                </td>
                <td className="px-4 py-2.5">HIFLD (Oak Ridge National Lab)</td>
                <td className="px-4 py-2.5">Periodic</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Transmission Lines (voltage, owner, status, geometry)</td>
                <td className="px-4 py-2.5 text-xs font-mono text-[#7A756E]">
                  US_Electric_Power_Transmission_Lines / FeatureServer
                </td>
                <td className="px-4 py-2.5">GeoPlataform (HIFLD)</td>
                <td className="px-4 py-2.5">Periodic</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">State Electricity Demand (monthly retail sales)</td>
                <td className="px-4 py-2.5 text-xs font-mono text-[#7A756E]">
                  EIA API v2 / electricity / retail-sales
                </td>
                <td className="px-4 py-2.5">U.S. Energy Information Administration</td>
                <td className="px-4 py-2.5">Monthly</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Capacity Factors (generation &amp; nameplate by fuel type &amp; state)</td>
                <td className="px-4 py-2.5 text-xs font-mono text-[#7A756E]">
                  EIA API v2 / electricity / electric-power-operational-data
                </td>
                <td className="px-4 py-2.5">U.S. Energy Information Administration</td>
                <td className="px-4 py-2.5">Annual</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">State Boundaries</td>
                <td className="px-4 py-2.5 text-xs font-mono text-[#7A756E]">
                  TIGERweb State_County / MapServer
                </td>
                <td className="px-4 py-2.5">U.S. Census Bureau</td>
                <td className="px-4 py-2.5">Decennial</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Substations ── */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">2. Substations</h3>
        <p className="text-sm leading-relaxed">
          Substations are fetched from the <strong>HIFLD Electric Power Substations</strong> dataset,
          which provides real surveyed coordinates, operational status, maximum/minimum voltage,
          and connected line count for substations at 69 kV and above. This is a primary dataset
          maintained by Oak Ridge National Laboratory for the Department of Homeland Security.
        </p>
        <p className="text-sm leading-relaxed">
          If the HIFLD API is temporarily unavailable, substations are derived from
          transmission line endpoint names (<code className="bg-stone-100 px-1 rounded text-xs">SUB_1</code> / <code className="bg-stone-100 px-1 rounded text-xs">SUB_2</code> fields)
          with averaged coordinates. This fallback is less accurate but ensures the map
          always displays data.
        </p>
      </section>

      {/* ── Infrastructure Status ── */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">3. Infrastructure Status</h3>
        <p className="text-sm leading-relaxed">
          Transmission lines and substations include a <code className="bg-stone-100 px-1 rounded text-xs">STATUS</code> field
          from their respective APIs. We normalize the raw status values into three categories:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-[#D8D5D0] rounded-lg overflow-hidden">
            <thead className="bg-stone-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-[#7A756E]">Category</th>
                <th className="text-left px-4 py-2.5 font-medium text-[#7A756E]">Visual</th>
                <th className="text-left px-4 py-2.5 font-medium text-[#7A756E]">Raw API Values</th>
                <th className="text-left px-4 py-2.5 font-medium text-[#7A756E]">In Availability Calc?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8D5D0]">
              <tr>
                <td className="px-4 py-2.5 font-medium">Active</td>
                <td className="px-4 py-2.5">Solid black line / colored dot</td>
                <td className="px-4 py-2.5 text-xs text-[#7A756E]">In Service, Operating, (empty)</td>
                <td className="px-4 py-2.5 font-medium text-green-600">Yes</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium">Planned</td>
                <td className="px-4 py-2.5">Orange dashed line / orange outline dot</td>
                <td className="px-4 py-2.5 text-xs text-[#7A756E]">Planned, Proposed, Under Construction</td>
                <td className="px-4 py-2.5 font-medium text-red-500">No</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium">Retired</td>
                <td className="px-4 py-2.5">Grey dashed line / grey outline dot</td>
                <td className="px-4 py-2.5 text-xs text-[#7A756E]">Retired, Out of Service, Decommissioned, Standby</td>
                <td className="px-4 py-2.5 font-medium text-red-500">No</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-[#7A756E]">
          Only active infrastructure participates in the availability calculation.
          Planned and retired features are displayed for reference but do not affect
          capacity estimates. Power generators come from a dataset that only includes
          operable plants, so all generators are treated as active.
        </p>
      </section>

      {/* ── Availability Formula ── */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">4. Availability Calculation</h3>
        <p className="text-sm leading-relaxed">
          The goal is to estimate <strong>spare power capacity</strong> at each
          active substation — how much generation exceeds estimated local demand.
        </p>

        <div className="bg-stone-50 border border-[#D8D5D0] rounded-lg p-4 space-y-4">
          <h4 className="font-heading font-semibold text-sm">Step 1 — Effective Generation (capacity factor adjusted)</h4>
          <p className="text-sm">
            Each active power plant is assigned to its <strong>single nearest active
            substation</strong> (Euclidean distance). The plant&apos;s contribution is adjusted
            by a <strong>state-specific capacity factor</strong> fetched live from the EIA API:
          </p>
          <div className="bg-white rounded border border-[#D8D5D0] p-3 font-mono text-sm">
            EffectiveMW(plant) = NameplateMW &times; CapacityFactor(state, fuelType)
          </div>
          <p className="text-xs text-[#7A756E]">
            Capacity factor = actual generation / (nameplate &times; 8,760 hours).
            Computed from EIA annual generation and nameplate capacity data per state and fuel type.
            Example: Solar in Arizona ~0.27, Solar in Michigan ~0.15, Nuclear nationwide ~0.93.
            Falls back to national averages if EIA API is unavailable.
          </p>

          <h4 className="font-heading font-semibold text-sm">Step 2 — Voltage-Weighted Demand Distribution</h4>
          <p className="text-sm">
            The state&apos;s total average demand (from EIA monthly retail sales data) is
            distributed across active substations using a <strong>voltage-weighted</strong> method:
          </p>
          <div className="bg-white rounded border border-[#D8D5D0] p-3 font-mono text-sm space-y-1">
            <div>Weight(sub) = MAX_VOLT&sup2; &times; LINES</div>
            <div>Demand(sub) = StateDemandMW &times; Weight(sub) / TotalWeight</div>
          </div>
          <p className="text-xs text-[#7A756E]">
            Transmission line thermal capacity scales roughly with voltage squared
            (P &asymp; V&sup2; / Z). A 500 kV substation with 4 lines (weight = 1,000,000)
            absorbs far more demand than a 115 kV substation with 10 lines (weight = 132,250).
            State demand is computed from last 12 months of EIA retail sales:
            avgDemandMW = (totalGWh &times; 1,000) / 8,760.
          </p>

          <h4 className="font-heading font-semibold text-sm">Step 3 — Net Available Capacity</h4>
          <div className="bg-white rounded border border-[#D8D5D0] p-3 font-mono text-sm">
            Available(sub) = &Sigma; EffectiveMW(assigned plants) &minus; Demand(sub)
          </div>
        </div>

        {/* Worked example */}
        <div className="bg-white border border-[#D8D5D0] rounded-lg p-4 space-y-3">
          <h4 className="font-heading font-semibold text-sm">Worked Example</h4>
          <div className="text-sm space-y-2">
            <p>
              <strong>State:</strong> Texas. EIA live demand: ~49,000 MW average.
            </p>
            <p>
              <strong>Substation A:</strong> 500 kV, 4 lines. A 600 MW gas plant (capacity factor 0.44)
              and a 150 MW solar farm (capacity factor 0.28 for Texas) are nearest.
            </p>
            <div className="bg-stone-50 rounded border border-[#D8D5D0] p-2 font-mono text-xs space-y-1">
              <div>Generation(A) = (600 &times; 0.44) + (150 &times; 0.28) = 264 + 42 = 306 MW</div>
              <div>Weight(A) = 500&sup2; &times; 4 = 1,000,000</div>
              <div>Demand(A) = 49,000 &times; (1,000,000 / TotalWeight)</div>
              <div>Available(A) = 306 &minus; Demand(A)</div>
            </div>
            <p>
              <strong>Substation B:</strong> 115 kV, 10 lines. No nearby generators.
            </p>
            <div className="bg-stone-50 rounded border border-[#D8D5D0] p-2 font-mono text-xs space-y-1">
              <div>Generation(B) = 0 MW</div>
              <div>Weight(B) = 115&sup2; &times; 10 = 132,250</div>
              <div>Demand(B) = 49,000 &times; (132,250 / TotalWeight)</div>
              <div>Available(B) = 0 &minus; Demand(B) &lt; 0 &rarr; Red (no capacity)</div>
            </div>
            <p className="text-[#7A756E]">
              The 500 kV substation receives ~7.5&times; more demand share than the 115 kV one
              (ratio of 1,000,000 to 132,250), which is physically realistic — high-voltage
              substations serve as major transmission hubs.
            </p>
          </div>
        </div>
      </section>

      {/* ── Color Classification ── */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">5. Substation Color Classification</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-[#D8D5D0] rounded-lg overflow-hidden">
            <thead className="bg-stone-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-[#7A756E]">Color</th>
                <th className="text-left px-4 py-2.5 font-medium text-[#7A756E]">Condition</th>
                <th className="text-left px-4 py-2.5 font-medium text-[#7A756E]">Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8D5D0]">
              <tr>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-[#EF4444] inline-block" />
                    Red
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">Available &le; 0 MW</td>
                <td className="px-4 py-2.5">No spare capacity. Substation is at or over estimated load.</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-[#F97316] inline-block" />
                    Orange
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">0 &lt; Available &lt; 200 MW</td>
                <td className="px-4 py-2.5">Some spare capacity. Smaller projects may be feasible.</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-[#3B82F6] inline-block" />
                    Blue
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">Available &ge; 200 MW</td>
                <td className="px-4 py-2.5">Significant surplus. Priority target for site interconnection.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 10-Mile Interconnection Zones ── */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">6. Interconnection Zones (10-Mile Radius)</h3>
        <p className="text-sm leading-relaxed">
          Blue substations (200+ MW available) are surrounded by a{' '}
          <strong>10-mile radius circle</strong> representing the practical
          interconnection zone — the area within which a new site could
          feasibly connect via a gen-tie line.
        </p>
        <div className="bg-stone-50 border border-[#D8D5D0] rounded-lg p-4 space-y-2">
          <h4 className="font-heading font-semibold text-sm">Why 10 miles?</h4>
          <ul className="list-disc list-inside text-sm space-y-1 ml-2">
            <li>
              <strong>LBNL &quot;Queued Up&quot; report</strong> — Median gen-tie
              distances: 2&ndash;5 miles (solar), 5&ndash;10 miles (wind).
            </li>
            <li>
              <strong>NREL Technical Potentials</strong> (NREL/TP-6A20-51946) —
              Uses 1&ndash;10 mile proximity as a GIS screening threshold.
            </li>
            <li>
              <strong>FERC Order 2023</strong> — Gen-tie costs ($1&ndash;3M/mile)
              make distance the primary economic constraint.
            </li>
            <li>
              <strong>ISO/RTO queue data</strong> — Vast majority of successful
              interconnections are within 10 miles.
            </li>
          </ul>
        </div>
      </section>

      {/* ── Known Limitations ── */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">7. Known Limitations</h3>
        <ul className="list-disc list-inside text-sm space-y-2 ml-2">
          <li>
            <strong>Demand distribution is voltage-weighted, not exact.</strong>{' '}
            Real power flow depends on load centers, industrial customers, and
            grid topology. Voltage-weighted distribution (V&sup2; &times; lines) is
            physically grounded but still a proxy.
          </li>
          <li>
            <strong>No thermal limits modeled.</strong> Real substations have
            transformer MVA ratings and bus limits. A substation may show
            surplus capacity but be thermally constrained.
          </li>
          <li>
            <strong>Interstate flows ignored.</strong> States import/export
            power. Border substations may show surplus committed to
            neighboring states.
          </li>
          <li>
            <strong>Nearest-substation assignment is geometric.</strong> A plant
            may physically connect to a different substation than the
            geographically nearest one.
          </li>
          <li>
            <strong>Bounding box includes neighboring states.</strong> The
            spatial query uses a rectangular bounding box, so plants, lines,
            and substations slightly outside the state boundary may appear.
          </li>
          <li>
            <strong>Power plant status unavailable.</strong> The EIA power plant
            dataset only includes operable plants. Retired/planned generators
            are not shown.
          </li>
        </ul>
        <p className="text-sm text-[#7A756E]">
          This tool is designed for <strong>initial site screening and
          prospecting</strong>. Any identified site should be validated
          through a formal interconnection request and engineering study
          (FERC LGIP/SGIP process).
        </p>
      </section>

      {/* ── How to Use ── */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">8. How to Use This Map</h3>
        <ol className="list-decimal list-inside text-sm space-y-2 ml-2">
          <li>
            <strong>Select a state</strong> to load all power infrastructure data.
          </li>
          <li>
            <strong>Identify blue substations</strong> (200+ MW surplus) as primary targets.
            Use the substation list panel to sort by available capacity.
          </li>
          <li>
            <strong>Click a substation</strong> to see its details: voltage, line count,
            and estimated available MW.
          </li>
          <li>
            <strong>Look within the 10-mile radius zone</strong> around blue substations
            for potential site locations.
          </li>
          <li>
            <strong>Verify with the utility</strong> that interconnection capacity exists
            at the target substation before committing to a site.
          </li>
          <li>
            <strong>Use the filters</strong> to toggle generators, transmission lines, and
            substation capacity bins to focus your analysis.
          </li>
        </ol>
      </section>
    </div>
  );
}
