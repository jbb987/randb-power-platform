export default function Methodology() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-10 text-[#201F1E]">
      <div>
        <h2 className="font-heading text-xl font-semibold mb-2">Methodology</h2>
        <p className="text-sm text-[#7A756E]">
          How this map works, the data sources it uses, the math behind the
          availability calculation, and the design choices we made. This section
          exists so anyone can reproduce, verify, or challenge the results.
        </p>
      </div>

      {/* ── Data Sources ── */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">1. Data Sources</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-[#D8D5D0] rounded-lg overflow-hidden">
            <thead className="bg-stone-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-[#7A756E]">Data</th>
                <th className="text-left px-4 py-2.5 font-medium text-[#7A756E]">Source</th>
                <th className="text-left px-4 py-2.5 font-medium text-[#7A756E]">Provider</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8D5D0]">
              <tr>
                <td className="px-4 py-2.5">Power Plants (location, capacity, fuel type)</td>
                <td className="px-4 py-2.5 text-xs font-mono text-[#7A756E]">
                  Power_Plants_in_the_US / FeatureServer
                </td>
                <td className="px-4 py-2.5">GeoPlataform ArcGIS (US DOE / EIA)</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Transmission Lines (voltage, owner, connected substations)</td>
                <td className="px-4 py-2.5 text-xs font-mono text-[#7A756E]">
                  US_Electric_Power_Transmission_Lines / FeatureServer
                </td>
                <td className="px-4 py-2.5">GeoPlataform ArcGIS (US DOE / HIFLD)</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">State Electricity Consumption (annual GWh)</td>
                <td className="px-4 py-2.5 text-xs font-mono text-[#7A756E]">
                  EIA Electric Power Monthly — Table 5.1 (2024)
                </td>
                <td className="px-4 py-2.5">U.S. Energy Information Administration</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">State Boundaries (GeoJSON polygons)</td>
                <td className="px-4 py-2.5 text-xs font-mono text-[#7A756E]">
                  TIGERweb State_County / MapServer
                </td>
                <td className="px-4 py-2.5">U.S. Census Bureau</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Base Map Tiles</td>
                <td className="px-4 py-2.5 text-xs font-mono text-[#7A756E]">
                  OpenFreeMap — Liberty style
                </td>
                <td className="px-4 py-2.5">OpenStreetMap contributors</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-[#7A756E]">
          All data is fetched live via public REST APIs. Power plant and
          transmission line queries are paginated (2,000 records per request)
          and bounded to the selected state&apos;s geographic envelope. Results
          are cached in-memory per state to avoid redundant API calls.
        </p>
      </section>

      {/* ── How Substations Are Derived ── */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">2. How Substations Are Derived</h3>
        <p className="text-sm leading-relaxed">
          The ArcGIS transmission line dataset does not include a dedicated
          substations layer. Instead, each transmission line record has{' '}
          <code className="bg-stone-100 px-1 rounded text-xs">SUB_1</code> and{' '}
          <code className="bg-stone-100 px-1 rounded text-xs">SUB_2</code>{' '}
          fields naming the substations at each end of the line. We extract
          substations by:
        </p>
        <ol className="list-decimal list-inside text-sm space-y-1.5 ml-2">
          <li>
            Collecting every unique substation name from{' '}
            <code className="bg-stone-100 px-1 rounded text-xs">SUB_1</code> /{' '}
            <code className="bg-stone-100 px-1 rounded text-xs">SUB_2</code>{' '}
            across all transmission lines (excluding &quot;NOT AVAILABLE&quot;).
          </li>
          <li>
            Setting each substation&apos;s location to the <strong>average</strong>{' '}
            of the line endpoints that reference it (first point of the path for
            SUB_1, last point for SUB_2).
          </li>
          <li>
            Tracking the <strong>line count</strong> (number of transmission
            lines connected) and <strong>max voltage</strong> for each substation.
          </li>
        </ol>
        <p className="text-sm text-[#7A756E]">
          This is an approximation — real substation coordinates may differ
          slightly from the averaged line endpoints.
        </p>
      </section>

      {/* ── Availability Formula ── */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">3. Availability Calculation</h3>
        <p className="text-sm leading-relaxed">
          The goal is to estimate how much <strong>spare power capacity</strong>{' '}
          exists at each substation — i.e., how much more generation or load
          could realistically connect there.
        </p>

        <div className="bg-stone-50 border border-[#D8D5D0] rounded-lg p-4 space-y-4">
          <h4 className="font-heading font-semibold text-sm">Step 1 — Assign plants to substations (no double-counting)</h4>
          <p className="text-sm">
            Each power plant is assigned to its <strong>single nearest
            substation</strong> based on geographic distance (Euclidean on
            lat/lng). A plant is never counted by more than one substation.
            The sum of all assigned plant capacities becomes that
            substation&apos;s <strong>connected generation</strong>.
          </p>
          <div className="bg-white rounded border border-[#D8D5D0] p-3 font-mono text-sm">
            Generation(sub) = &Sigma; capacityMW of plants nearest to sub
          </div>

          <h4 className="font-heading font-semibold text-sm">Step 2 — Estimate local demand</h4>
          <p className="text-sm">
            The state&apos;s total average electricity demand (from EIA data)
            is distributed across substations <strong>proportionally by
            transmission line count</strong>. More connected lines implies more
            demand flowing through that substation.
          </p>
          <div className="bg-white rounded border border-[#D8D5D0] p-3 font-mono text-sm">
            Demand(sub) = StateDemandMW &times; (sub.lineCount / totalLineCount)
          </div>
          <p className="text-xs text-[#7A756E]">
            State demand is converted from annual GWh:{' '}
            <code className="bg-stone-100 px-1 rounded">avgDemandMW = (annualGWh &times; 1000) / 8760</code>
          </p>

          <h4 className="font-heading font-semibold text-sm">Step 3 — Net available capacity</h4>
          <div className="bg-white rounded border border-[#D8D5D0] p-3 font-mono text-sm">
            Available(sub) = Generation(sub) &minus; Demand(sub)
          </div>
          <p className="text-sm">
            If positive, the substation has surplus capacity. If zero or
            negative, the substation is fully loaded.
          </p>
        </div>

        {/* Worked example */}
        <div className="bg-white border border-[#D8D5D0] rounded-lg p-4 space-y-3">
          <h4 className="font-heading font-semibold text-sm">Worked Example — Texas</h4>
          <div className="text-sm space-y-2">
            <p>
              <strong>Given:</strong> Texas annual consumption = 430,000 GWh
              (EIA 2024). Total transmission lines = 10,233. Total substations
              = 5,075.
            </p>
            <p>
              State average demand:
            </p>
            <div className="bg-stone-50 rounded border border-[#D8D5D0] p-2 font-mono text-xs">
              avgDemandMW = (430,000 &times; 1,000) / 8,760 = 49,087 MW
            </div>
            <p>
              Consider <strong>Substation A</strong> with 8 connected
              transmission lines. Two nearby power plants (a 600 MW gas plant
              and a 150 MW solar farm) are closest to this substation.
            </p>
            <div className="bg-stone-50 rounded border border-[#D8D5D0] p-2 font-mono text-xs space-y-1">
              <div>Generation(A) = 600 + 150 = 750 MW</div>
              <div>Demand(A) = 49,087 &times; (8 / 10,233) = 38.4 MW</div>
              <div>Available(A) = 750 &minus; 38.4 = <strong>711.6 MW</strong></div>
            </div>
            <p>
              Result: 711.6 MW &gt; 200 MW &rarr; <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] inline-block" />
                <strong className="text-[#3B82F6]">Blue</strong>
              </span> — significant available capacity.
            </p>
            <p>
              Now consider <strong>Substation B</strong> with 4 lines and no
              nearby power plants assigned to it.
            </p>
            <div className="bg-stone-50 rounded border border-[#D8D5D0] p-2 font-mono text-xs space-y-1">
              <div>Generation(B) = 0 MW</div>
              <div>Demand(B) = 49,087 &times; (4 / 10,233) = 19.2 MW</div>
              <div>Available(B) = 0 &minus; 19.2 = <strong>&minus;19.2 MW</strong></div>
            </div>
            <p>
              Result: &minus;19.2 MW &le; 0 &rarr; <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] inline-block" />
                <strong className="text-[#EF4444]">Red</strong>
              </span> — no available capacity.
            </p>
          </div>
        </div>
      </section>

      {/* ── Color Classification ── */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">4. Color Classification</h3>
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
                <td className="px-4 py-2.5">Substation is at or over capacity. No spare room for new connections.</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-[#F97316] inline-block" />
                    Orange
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">0 &lt; Available &lt; 200 MW</td>
                <td className="px-4 py-2.5">Some spare capacity exists. Smaller projects may be feasible.</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-[#3B82F6] inline-block" />
                    Blue
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">Available &ge; 200 MW</td>
                <td className="px-4 py-2.5">Significant surplus. Priority target for new site interconnection.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-[#7A756E]">
          The 200 MW threshold was chosen as the boundary between &quot;some&quot;
          and &quot;significant&quot; capacity. This is a configurable design
          decision, not a regulatory standard.
        </p>
      </section>

      {/* ── 10-Mile Interconnection Zones ── */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">5. Interconnection Zones (10-Mile Radius)</h3>
        <p className="text-sm leading-relaxed">
          Blue substations (200+ MW available) are surrounded by a{' '}
          <strong>10-mile radius circle</strong> representing the practical
          interconnection zone — the area within which a new site could
          feasibly connect to that substation via a gen-tie line.
        </p>
        <div className="bg-stone-50 border border-[#D8D5D0] rounded-lg p-4 space-y-2">
          <h4 className="font-heading font-semibold text-sm">Why 10 miles?</h4>
          <p className="text-sm">Based on primary sources:</p>
          <ul className="list-disc list-inside text-sm space-y-1 ml-2">
            <li>
              <strong>LBNL &quot;Queued Up&quot; report</strong> — Median gen-tie
              distances are 2&ndash;5 miles for solar, 5&ndash;10 miles for wind
              across US interconnection queues.
            </li>
            <li>
              <strong>NREL &quot;U.S. Renewable Energy Technical Potentials&quot;</strong>{' '}
              (NREL/TP-6A20-51946) — Uses 1&ndash;10 mile proximity to
              transmission as a GIS screening threshold.
            </li>
            <li>
              <strong>FERC Order 2023</strong> (RM22-14-000) — No regulatory
              maximum distance, but gen-tie costs ($1&ndash;3M per mile) are
              assigned to the developer, making distance the economic constraint.
            </li>
            <li>
              <strong>ISO/RTO queue data</strong> (PJM, MISO, CAISO) — The vast
              majority of successful interconnection projects are within 10
              miles of a substation.
            </li>
          </ul>
          <p className="text-sm text-[#7A756E]">
            10 miles is a practical screening default. Distribution-level
            connections are typically limited to 1&ndash;3 miles, while very
            large projects (500+ MW) at EHV substations can extend to
            15&ndash;30 miles.
          </p>
        </div>
      </section>

      {/* ── Known Limitations ── */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">6. Known Limitations</h3>
        <ul className="list-disc list-inside text-sm space-y-2 ml-2">
          <li>
            <strong>Demand distribution is a proxy.</strong> Real power flow
            depends on load centers, industrial customers, and grid topology —
            not just line count. Distributing state demand by line count is a
            rough approximation.
          </li>
          <li>
            <strong>Capacity factor is not applied.</strong> We use installed
            capacity (nameplate MW), not actual output. Solar plants typically
            produce 20&ndash;25% of nameplate, wind 30&ndash;40%, gas
            60&ndash;90%. This means generation is overstated relative to real
            output.
          </li>
          <li>
            <strong>Substation locations are averaged.</strong> Since substations
            are derived from transmission line endpoints (not a dedicated
            dataset), their coordinates are approximate.
          </li>
          <li>
            <strong>No thermal limits.</strong> Real substations have equipment
            ratings (transformer MVA, bus ratings) that limit throughput. We do
            not model these.
          </li>
          <li>
            <strong>Interstate flows ignored.</strong> States import/export
            power. A border substation may show surplus that is actually
            committed to a neighboring state.
          </li>
          <li>
            <strong>Nearest-substation assignment is geometric.</strong> A plant
            may physically connect to a different substation than the
            geographically nearest one.
          </li>
        </ul>
        <p className="text-sm text-[#7A756E]">
          This tool is designed for <strong>initial screening and
          prospecting</strong>, not for interconnection feasibility studies.
          Any site identified here should be validated through a formal
          interconnection request and engineering study (FERC LGIP/SGIP
          process).
        </p>
      </section>

      {/* ── Tech Stack ── */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">7. Technical Implementation</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-[#D8D5D0] rounded-lg overflow-hidden">
            <thead className="bg-stone-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-[#7A756E]">Component</th>
                <th className="text-left px-4 py-2.5 font-medium text-[#7A756E]">Technology</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8D5D0]">
              <tr>
                <td className="px-4 py-2.5">Map rendering</td>
                <td className="px-4 py-2.5">MapLibre GL JS via react-map-gl</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Data fetching</td>
                <td className="px-4 py-2.5">ArcGIS REST API (paginated, bbox-filtered)</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Availability math</td>
                <td className="px-4 py-2.5">Client-side TypeScript (nearest-neighbor assignment + proportional demand)</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Interconnection zones</td>
                <td className="px-4 py-2.5">GeoJSON circle polygons (48-segment approximation, lat/lng-corrected)</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Caching</td>
                <td className="px-4 py-2.5">In-memory per state (useRef Map), per-session only</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
