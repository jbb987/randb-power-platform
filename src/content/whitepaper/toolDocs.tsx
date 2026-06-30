import type { ToolDoc } from '../../components/whitepaper/ToolDocTemplate';
import { DocP, Code } from '../../components/whitepaper/DocBlocks';

/**
 * One entry per platform tool. Routes and access come from src/App.tsx;
 * purposes from the tool implementations. howItWorks is filled progressively —
 * omitting it renders an explicit placeholder on the page.
 */
export const toolDocs: ToolDoc[] = [
  {
    id: 'crm',
    title: 'Directory (CRM)',
    purpose:
      'The central database of customers and people, shared across Pre-Construction, Construction, and REP work. Every other tool links back to it.',
    access: 'Tool-gated (crm)',
    routes: [
      { path: '/crm', description: 'Customers/People toggle with search, add, edit, delete.' },
      {
        path: '/crm/companies/:id',
        description:
          'Customer profile: tags, folders, license numbers, linked sites, LLRs, and projects.',
      },
      {
        path: '/crm/people/:id',
        description: 'Person profile: multi-customer affiliations + duplicate-merge UI.',
      },
    ],
    dataSources: [
      {
        name: 'crm-companies / crm-contacts',
        kind: 'Firestore',
        notes:
          'Customers with fixed-enum tags; people with affiliations[] (one person, many customers, per-affiliation title).',
      },
      {
        name: 'folders / documents',
        kind: 'Firestore',
        notes: 'Customer-rooted folder tree (see Folder & Document System).',
      },
    ],
    keyFiles: [
      { path: 'src/tools/CrmTool.tsx', role: 'Index page (customers/people toggle).' },
      { path: 'src/tools/CompanyDetailTool.tsx', role: 'Customer profile page.' },
      {
        path: 'src/tools/ContactDetailTool.tsx',
        role: 'Person profile page (affiliations + merge).',
      },
      { path: 'src/lib/crmCompanies.ts / crmContacts.ts', role: 'Data services.' },
    ],
    howItWorks: (
      <DocP>
        Customers carry fixed-enum tags (<Code>REP</Code> / <Code>Construction</Code> /{' '}
        <Code>Pre Construction</Code> / <Code>Utility</Code>) describing the business activity, a
        Folders section backed by the folder system, and a collapsible License Numbers section for
        the five tracked states (OK, TX, AZ, NM, TN). A person can be affiliated with multiple
        customers, each affiliation carrying its own title; the person page supports
        add/remove/set-primary and merging duplicate people. The <Code>CompanyPicker</Code>{' '}
        component is reused by the Site Analyzer, LLR, and the project trackers to link records to a
        customer.
      </DocP>
    ),
  },
  {
    id: 'large-load-request',
    title: 'Large Load Request (LLR)',
    purpose:
      'End-to-end workflow for taking a coordinate from "raw site" to "LOA executed" with the utility: appraisal, GO/NO-GO grading, engineer review, and a utility-aware LOA timeline.',
    access: 'Tool-gated (large-load-request)',
    routes: [
      { path: '/llr', description: 'Sites grouped by grade + LOA status.' },
      {
        path: '/llr/new',
        description:
          'New site: pick/create customer, drop coordinates + acreage/MW/$ per acre — or start from an existing analyzed site.',
      },
      {
        path: '/llr/:siteId',
        description:
          'Site dashboard: appraisal, grade, engineer review, LOA timeline, document checklist, folders.',
      },
    ],
    dataSources: [
      {
        name: 'preconstruction-sites',
        kind: 'Firestore',
        notes: 'LLR sites (collection keeps the legacy precon name for migration safety).',
      },
      {
        name: 'sites-registry',
        kind: 'Firestore',
        notes:
          'The linked appraisal/analysis lives on the Site Analyzer registry entry — no duplicate analysis.',
      },
      {
        name: 'folders / customer-projects',
        kind: 'Firestore',
        notes:
          'Auto-provisioned folder skeleton + Project record on create. The site root is seeded with default folders (Load Interconnection / Client Intel / Land Related / Project Designs) on both new sites and Site-Analyzer transfers.',
      },
    ],
    keyFiles: [
      {
        path: 'src/tools/PreConDetail.tsx',
        role: 'Site dashboard (file names keep the PreCon prefix).',
      },
      {
        path: 'src/lib/preConSites.ts',
        role: 'CRUD + createPreConSiteFromRegistry (convert from Site Analyzer).',
      },
      {
        path: 'src/lib/preConWorkflow.ts',
        role: 'Grade suggestion, per-utility LOA_TIMELINES, document checklists.',
      },
      {
        path: 'src/components/precon/',
        role: 'Grade pill, status card, utility picker, LOA timeline, document checklist.',
      },
    ],
    howItWorks: (
      <>
        <DocP>
          A new LLR site runs the shared financial appraisal and auto-suggests a{' '}
          <Code>GO / CONDITIONAL GO / NO GO</Code> grade (overridable), opens a
          request-for-engineer-review with assignment, and drives a utility-aware LOA timeline
          (Oncor / AEP / Coop / Other). The timeline runs from "Contact utility" to the terminal{' '}
          <strong>Letter of Allocation</strong> milestone, which is two-state: clicking it once
          marks it the current step (red, awaiting the LOA), and clicking again flips it to a green
          check (<Code>loa-executed</Code> — LOA in hand); clicking once more reverts. A per-request
          document submission checklist tracks what the utility still needs.
        </DocP>
        <DocP>
          <strong>Convert from Site Analyzer:</strong> a "Track in LLR" button on an analyzed site
          reuses the existing registry entry — no re-run, no quota burn. The LLR site id is
          deterministic (<Code>precon_&#123;siteRegistryId&#125;</Code>), so duplicate-create races
          collapse onto the same document. Legacy <Code>/precon</Code> URLs redirect to{' '}
          <Code>/llr</Code>.
        </DocP>
      </>
    ),
  },
  {
    id: 'site-analyzer',
    title: 'Site Analyzer',
    purpose:
      'The flagship analysis tool: input coordinates, run land valuation, power, broadband, transport, water, gas, labor, and political-radar analyses in parallel, then export PDFs for two audiences.',
    access: 'Tool-gated (site-analyzer); non-admins have a monthly analysis quota (default 5)',
    routes: [
      { path: '/site-analyzer', description: 'Site registry index with search.' },
      {
        path: '/site-analyzer/new',
        description: 'Entry form (accepts ?companyId, ?lat, ?lng pre-fills).',
      },
      {
        path: '/site-analyzer/:siteId',
        description: 'Tabbed detail: Executive Summary first, then one analysis section per tab.',
      },
    ],
    dataSources: [
      {
        name: 'sites-registry',
        kind: 'Firestore',
        notes: 'Saved sites: inputs, per-section results, section locks, custom ramp.',
      },
      {
        name: 'Power / broadband / water / gas / transport / labor / political APIs',
        kind: 'External API',
        notes: 'See External Data Sources for the per-domain inventory.',
      },
      {
        name: 'county_queue_load',
        kind: 'Firestore',
        notes: 'County interconnection-queue summary inside the Power section.',
      },
    ],
    keyFiles: [
      {
        path: 'src/tools/SiteAnalyzerDetail.tsx',
        role: 'Tabbed detail page orchestrating all sections.',
      },
      { path: 'src/hooks/useSiteAnalysis.ts', role: 'Runs all analysis sections in parallel.' },
      {
        path: 'src/lib/executiveSummary.ts',
        role: 'buildExecutiveSummaryModel — one synthesis layer feeding screen + PDF.',
      },
      {
        path: 'src/components/site-analyzer/SiteAnalysisPdfDocument.tsx',
        role: 'Full 12-page PDF (react-pdf).',
      },
      {
        path: 'src/components/site-analyzer/SiteExecutiveSummaryPdfDocument.tsx',
        role: 'Single-page customer PDF.',
      },
      {
        path: 'src/lib/exhibitA.ts',
        role: 'buildExhibitAModel — pure Exhibit A (Phase A deliverables) synthesis for the report.',
      },
      {
        path: 'src/components/power-calculator/GridContextMap.tsx',
        role: 'Embedded grid map in the Power section (site pin + substations by voltage class).',
      },
    ],
    howItWorks: (
      <>
        <DocP>
          The detail page is tabbed, one section visible at a time. The default tab is the{' '}
          <strong>Executive Summary</strong> — an investor-facing single-page <em>Site Briefing</em>{' '}
          (marked "Confidential · Investor Only", seller not named, no price). Its "The Verdict"
          layout leads with the deliverable MW (engineer-verified from the linked LLR when present,
          else the target) and a GO / CONDITIONAL GO / NO-GO badge, a power-context map band
          (satellite + voltage-colored transmission lines + substations), and a "Site Highlights"
          grid that reframes each spec as a de-risked benefit (FAB), and a <strong>Power Ramp</strong>{' '}
          cumulative-MW bar chart (re-added 2026-06-22; screen + PDF, fed by the same ramp model). It
          exports as a single-page PDF; the full 12-page report targets the land owner. The "Clear to
          build" tile shows acreage with the site's <strong>Zoning / Land Use</strong> stacked beneath
          it — a single combined land field (operator-entered, from LandID) that replaced the former
          separate "Prior Usage / Property Type" field (merged 2026-06-22; legacy values stay in
          Firestore but are no longer shown or editable).
        </DocP>
        <DocP>
          <strong>Customer report (v1.60.0):</strong> the PDF satisfies the Phase A deliverables
          contract <em>content</em> while never mentioning the exhibit or using contract phrasing
          (decision 2026-06-12: it must read as a report, not a checklist). Coordinates sit on the
          cover + Key Metrics, county on Key Metrics, and no data-source names or imagery credits
          appear anywhere. The single contract-derived page is{' '}
          <strong>Capacity &amp; Load Viability</strong>: Status (GO / CONDITIONAL GO / NO-GO from
          the linked LLR grade, else appraisal-suggested), Target Capacity, a static "Initial Load
          (20–50 MW): Supported" row, Feed Redundancy (independent 100 kV+ substations within 5 mi),
          Interconnection Cost (ROM) with its basis row, Electricity Price, and the Ramp Schedule
          table. The ramp invariant (2026-06-12): the schedule always lands exactly on the site's
          decided MW — custom per-year entries only redistribute the pace (overshoot clamps,
          shortfall auto-completes at the pace the entries established — the fastest entered year,
          floored by the 100 MW/yr base), enforced in <Code>rampFromIncrements</Code> for screen and
          both PDFs alike. Deliberately removed from the PDF across review passes: General Project
          Information, Grid Assessment, Data Center Metrics, Constraints &amp; Fatal Flaws, the
          Recommendation page, the County Power Queue page, the broadband OSP assessment, and the
          gas Local Distribution note. Everything is synthesized in <Code>src/lib/exhibitA.ts</Code>{' '}
          from data the sections already produce — no manual inputs. The Power section embeds a grid
          context map (screen: MapLibre, with an "Open in Grid Power Analyzer" deep link via{' '}
          <Code>?lat&amp;lng</Code>; PDF: canvas-rendered satellite + substation overlay), and HIFLD
          placeholder names (UNKNOWN*/TAP*) are rewritten for customer-facing output.
        </DocP>
        <DocP>
          <strong>Expanded-radius fallback (v1.79.0, tiered in v1.80.0):</strong> the substation and
          transmission-line lookups screen a ~10mi box. When that box is empty — common for remote
          parcels, since the layer carries transmission only (no distribution) — the lookup widens in
          tiers (10 → 25 → 50mi) and surfaces ALL grid within the first ring that has results, with a
          true point-to-polyline distance on every line and a "showing within X mi" banner on each
          table. On the Power tab, the nearest of those also fills the headline fields (Nearest Point
          of Interconnection, Distance to POI, transmission owner) and the Grid Analysis block, so
          they stop reading "Not Available" when grid exists just beyond 10mi. Results stay in
          dedicated <Code>expandedSubstations</Code>/<Code>expandedLines</Code> fields (separate from
          the in-box <Code>nearbySubstations</Code>); the shared <Code>InfraResult</Code> scalars
          (nearest-POI / utility) stay in-box-only, so the customer PDF / Exhibit A / Executive
          Summary never contradict their own (empty) tables for a remote site — the expanded view is
          a Power-tab-only affordance. The widen runs only when the 10mi screen returns nothing, so
          normal sites add no latency; results beyond the 50mi top tier are dropped, and the widened
          query box covers the full radius east-west (no cos-latitude shrink). Logic lives in{' '}
          <Code>findExpandedGridInfra</Code> (<Code>src/lib/gridInfraQuery.ts</Code>, keyless and
          Worker-safe).
        </DocP>
        <DocP>
          <strong>Retail utility resolver (v1.67.0):</strong> the Power section reports three
          distinct things instead of conflating them — the <strong>RTO/ISO</strong>, the{' '}
          <strong>transmission owner</strong> of nearby lines (the old "utility territory",
          relabeled to stop the confusion), and the actual{' '}
          <strong>serving retail/distribution utility</strong>. The retail utility comes from{' '}
          <Code>resolveRetailUtility</Code>: a point-in-polygon query against the Electric Retail
          Service Territories layer (ORNL/HIFLD/EIA), with the always-overlapping candidate
          territories disambiguated by <em>interiority</em>
          (distance-to-boundary). A <strong>conservative confidence rule</strong> auto-picks a
          single utility only when it cannot be the blanket-IOU-over-coop trap; otherwise it
          surfaces a 2–3 candidate shortlist for a human to confirm. This replaced the legacy
          heuristic that derived "utility" from the nearest transmission-line owner, which was
          structurally blind to rural electric co-ops (it mislabeled the Kenefic Pit site — see
          AUDIT H-10). A human confirmation persists in <Code>retailUtilityConfirmedName</Code> on
          the site and survives re-analysis. Validated on 8 known sites: 100% recall, zero wrong
          auto-picks (research in <Code>research/utility-territory/</Code>).
        </DocP>
        <DocP>
          <strong>Per-section locks:</strong> after a successful run a section auto-locks;
          "Re-analyze" skips locked sections and only re-runs unlocked ones. Non-admin analyses draw
          down a monthly quota (<Code>useUserQuota</Code>). Sites link to a customer and can be
          converted into an LLR or used to prefill a One-Line diagram.
        </DocP>
      </>
    ),
  },
  {
    id: 'grid-power-analyzer',
    title: 'Grid Power Analyzer',
    purpose:
      'Interactive MapLibre GL map of power generators, transmission lines, substations, and available capacity with a heat-map overlay and coordinate search.',
    access: 'Tool-gated (grid-power-analyzer)',
    routes: [{ path: '/grid-power-analyzer', description: 'Full-screen interactive map.' }],
    dataSources: [
      {
        name: 'Cached infrastructure (plants, substations, lines)',
        kind: 'Firestore',
        notes: 'Refreshed via the admin ingestion pipeline (InfraRefreshPanel).',
      },
      {
        name: 'substation_queue_load',
        kind: 'Firestore',
        notes: 'Interconnection-queue summary in substation popups (QueueCard).',
      },
    ],
    keyFiles: [
      {
        path: 'src/components/power-map/PowerMapView.tsx',
        role: 'Main map container (MapLibre GL).',
      },
      { path: 'src/hooks/usePowerMap.ts', role: 'Map data fetching and state.' },
      { path: 'src/lib/powerMapData.ts', role: 'Data + availability calculations.' },
    ],
  },
  {
    id: 'market-intel',
    title: 'Market Intelligence',
    purpose:
      'Live, capture-only feed of US data-center deal news, auto-collected every 6 hours so the team stops doing manual market research.',
    access: 'Tool-gated (market-intel)',
    routes: [
      {
        path: '/market-intel',
        description:
          'Searchable feed with source/state filters, near-dup clustering, read/archive.',
      },
    ],
    dataSources: [
      {
        name: 'market-intel-feed',
        kind: 'Firestore',
        notes:
          'Ingested articles; doc id = sha256 of normalized URL. status is the only client-mutable field.',
      },
      {
        name: 'GDELT + trade RSS + Google News',
        kind: 'External API',
        notes: 'Keyless sources, pulled server-side by the refreshMarketIntel Cloud Function.',
      },
    ],
    keyFiles: [
      { path: 'src/tools/MarketIntelTool.tsx', role: 'Feed UI.' },
      {
        path: 'functions/src/marketIntel/',
        role: 'Ingestion: sources config, keyword lists, two-stage classifier.',
      },
    ],
    howItWorks: (
      <DocP>
        Ingestion runs a two-stage topic+event keyword filter (the same engine as Political Radar's
        bill filter), applies light regex tags (US state, MW figure, $ amount — deliberately no LLM
        yet), and upserts with merge so re-ingesting a URL never resets read/archived status. LLM
        structured extraction and the land-identification layers are deferred phases.
      </DocP>
    ),
  },
  {
    id: 'site-leads',
    title: 'Site Leads',
    purpose:
      'Review inbound landowner submissions from the public "Is my land powerable?" form and promote the serious ones into the sales Leads pipeline — the supply side of the power-real-estate funnel.',
    access: 'Tool-gated (site-leads)',
    routes: [
      {
        path: '/site-leads',
        description:
          'List of submissions with verdict + MW range, owner contact, map link; status workflow and a one-click Promote to Lead.',
      },
    ],
    dataSources: [
      {
        name: 'site-leads',
        kind: 'Firestore',
        notes:
          'Server-created by the public /api/public/site-score Worker endpoint (clients cannot create). Staff read + update status; promotion writes a leads doc and stamps qualified + promotedToLeadId.',
      },
    ],
    keyFiles: [
      { path: 'src/tools/SiteLeadsTool.tsx', role: 'Review UI (list, filters, status, promote).' },
      {
        path: 'src/lib/siteLeads.ts',
        role: 'Subscribe + setSiteLeadStatus + promoteSiteLeadToLead (mirrors the leadPipeline promote mapping).',
      },
      { path: 'functions/quickScore.ts', role: 'The public scoring endpoint that creates site-leads.' },
    ],
    howItWorks: (
      <DocP>
        A landowner submits the unlisted marketing-site form; the platform scores the coordinate
        against the grid engine and stores a <code>site-leads</code> doc with a coarse verdict (GO /
        CONDITIONAL / NO_GO) + MW range. Staff triage here — mark under review, reject, or promote.
        Promotion creates a <code>leads</code> record assigned to the promoting user (source{' '}
        <code>site-lead</code>) and links it back, so a qualified parcel flows straight into the
        existing sales pipeline. Verdict thresholds are screening heuristics pending calibration.
      </DocP>
    ),
  },
  {
    id: 'one-line-generator',
    title: 'One-Line Generator',
    purpose:
      'Generates utility-grade electrical one-line diagrams from a structured site spec instead of hand-drawing them — study-stage, unstamped output.',
    access: 'Tool-gated (one-line-generator)',
    routes: [
      { path: '/one-line-generator', description: 'Saved diagrams index.' },
      {
        path: '/one-line-generator/new',
        description: 'New spec form; can prefill from an analyzed Site Analyzer site.',
      },
      {
        path: '/one-line-generator/:id',
        description: 'Diagram detail: live SVG preview + PDF export.',
      },
    ],
    dataSources: [
      {
        name: 'one-line-diagrams',
        kind: 'Firestore',
        notes:
          'OneLineDocument = spec + metadata. The drawing is regenerated from spec on demand, never stored.',
      },
    ],
    keyFiles: [
      {
        path: 'src/lib/oneLine/',
        role: 'Pure engine: spec → electrical design → parametric layout → SVG.',
      },
      { path: 'scripts/oneLineProof.ts', role: 'Engine proof harness (npx tsx).' },
    ],
    howItWorks: (
      <DocP>
        The engine takes an <Code>OneLineSpec</Code> (ultimate MW, phasing, feed type, voltages,
        MVA, power factor), derives the electrical design (transformer count via the N-1 firm rule,
        conductor by MW, per-feed amps, bus ratings), and lays it out on a computed parametric grid
        so labels and lines cannot overlap at any MW. Symbols follow IEEE 315 / ANSI Y32.2 with IEEE
        C37.2 device numbers. Topology is the fixed data-center pattern: dual/single 138 kV feed →
        main-tie-main bus → step-down transformers → split 13.8 kV bus → RMU cells → 480 V MDP →
        standby generators.
      </DocP>
    ),
  },
  {
    id: 'lead-builder',
    title: 'Lead Builder',
    purpose:
      'Builds a qualified, callable C&I sales-lead list for a county: ingest the tax roll → enrich (Perplexity + Apollo) → review/repair → promote into Leads. Admin-only.',
    access: 'Admin only (firestore.rules gate the lead-pipeline-* collections to admins)',
    routes: [
      {
        path: '/lead-builder',
        description: 'Builds index: pick state + county (dropdowns), start a build; Qualified count per build.',
      },
      {
        path: '/lead-builder/:jobId',
        description:
          'Run page: live progress bar while building; tabbed audit (Qualified / Needs review / Dropped / Promoted) with per-row reasons, repair + promote-to-rep, Re-run, CSV export (current tab or whole build), and Retry Apollo (re-runs only the Apollo step for rows that errored — e.g. a bad API key — without re-charging Perplexity).',
      },
    ],
    dataSources: [
      {
        name: 'lead-pipeline-jobs / lead-pipeline-companies',
        kind: 'Firestore',
        notes:
          'One job per county build; companies carry stage + enrichment fields. Job holds a per-stage counts tally and a processing lease (lockUntil/ingestLockUntil).',
      },
      {
        name: 'NY ORPTS assessment roll (data.ny.gov 7vem-aaz7)',
        kind: 'External API',
        notes: 'Tax-roll source adapter — covers all 57 NY counties in the open dataset. Other states need their own adapter.',
      },
      {
        name: 'Perplexity (sonar) + Apollo',
        kind: 'External API',
        notes:
          'Perplexity resolves operating company/website/description/status; Apollo finds the decision-maker + verified email. Mobile is revealed on-demand later via the Leads "Grab number" button.',
      },
    ],
    keyFiles: [
      { path: 'src/tools/LeadBuilderIndex.tsx', role: 'Builds index + new-build form (state/county dropdowns).' },
      { path: 'src/tools/LeadBuilderRun.tsx', role: 'Run page: progress bar + tabbed audit/recovery view.' },
      { path: 'src/lib/leadPipeline.ts', role: 'Firestore CRUD, subscriptions, promote, reasons, region config.' },
      {
        path: 'functions/src/leadBuilder/',
        role: 'Pipeline: ingest (tax-roll trigger), processor (scheduled enrichment), perplexity, apollo, phone (on-demand reveal), classify, sources/nySocrata.',
      },
    ],
    howItWorks: (
      <DocP>
        Writing a job at status <Code>ingesting</Code> fires the <Code>ingestCountyTaxRoll</Code>{' '}
        Firestore trigger, which pulls the county roll, classifies operating companies, and writes
        them at stage <Code>ingested</Code>. New York retail electricity is deregulated statewide
        across the six investor-owned utilities, so every county is targetable — except parcels
        served by one of the state&apos;s 48 municipal-electric systems (matched on{' '}
        <Code>municipality_name</Code>), whose customers can&apos;t choose a supplier and so
        can&apos;t be brokered; those are dropped at ingest with an <Code>ineligibleReason</Code>{' '}
        (the 4 rural co-ops need a per-address territory resolver, tracked as v2). The scheduled{' '}
        <Code>processLeadPipeline</Code> then
        advances companies through Perplexity and Apollo in leased, bounded chunks, pausing at two
        admin cost gates. Perplexity routing is deliberately soft: only a confidently-closed company
        is dropped; anything real-but-unverifiable (e.g. no website) goes to{' '}
        <Code>needs_review</Code> so a human can repair and promote it rather than silently losing a
        lead. Promotion writes into the <Code>leads</Code> collection; the decision-maker&apos;s
        mobile is revealed just-in-time per lead (one Apollo credit per click) via an async webhook.
        A county has one build; Re-run rebuilds it in place.
      </DocP>
    ),
  },
  {
    id: 'construction-tracker',
    title: 'Bailey Project',
    purpose:
      "Project tracker instance reserved for the CEO's projects — kept on its own Firestore collection so this data never mixes with the construction team's.",
    access: 'Tool-gated (construction-tracker); per-project visibility by membership',
    routes: [
      {
        path: '/construction-tracker',
        description: 'Project index (filtered to what the user may see).',
      },
      {
        path: '/construction-tracker/new',
        description:
          'Create project: owner/GC + subcontractors, supervisors + PMs, labor, dates, budget.',
      },
      {
        path: '/construction-tracker/:jobId',
        description: 'Detail: overview, team, tasks, photos, project folders, timeline.',
      },
    ],
    dataSources: [
      {
        name: 'construction-jobs (+ tasks subcollection)',
        kind: 'Firestore',
        notes: 'Storage prefixes construction-photos + construction-documents.',
      },
    ],
    keyFiles: [
      {
        path: 'src/lib/jobToolConfig.tsx',
        role: 'BAILEY_PROJECT_CONFIG — collection/storage/route injection at the route boundary.',
      },
      { path: 'src/components/construction/', role: 'Shared tracker components (both instances).' },
      {
        path: 'src/hooks/useJobPermissions.ts',
        role: 'Per-project permission level from membership.',
      },
    ],
    howItWorks: (
      <DocP>
        Bailey Project and Construction Projects share one component tree; the active collection,
        storage prefix, and route base are injected via <Code>&lt;JobToolConfigProvider&gt;</Code>{' '}
        in <Code>App.tsx</Code>. Permissions derive from membership: admins see everything,
        supervisors see and edit assigned projects, labor sees only assigned projects and can update
        their own task status and upload photos. Documents live in the scoped{' '}
        <Code>FolderBrowser</Code> ("Project folders") — the legacy category-based documents section
        was retired on 2026-06-19.
      </DocP>
    ),
  },
  {
    id: 'construction-projects',
    title: 'Construction Projects',
    purpose:
      "Project tracker instance for the construction team's active jobs — same components as Bailey Project, fully separate data.",
    access: 'Tool-gated (construction-projects); per-project visibility by membership',
    routes: [
      { path: '/construction-projects', description: 'Project index.' },
      { path: '/construction-projects/new', description: 'Create project.' },
      {
        path: '/construction-projects/:jobId',
        description: 'Detail: overview, team, tasks, photos, project folders, timeline.',
      },
    ],
    dataSources: [
      {
        name: 'construction-projects-jobs',
        kind: 'Firestore',
        notes: 'Storage prefixes construction-projects-photos + construction-projects-documents.',
      },
    ],
    keyFiles: [
      {
        path: 'src/lib/jobToolConfig.tsx',
        role: 'CONSTRUCTION_PROJECTS_CONFIG. Adding a third instance = new config + ToolId + route block.',
      },
    ],
    howItWorks: (
      <DocP>
        See Bailey Project — the two tools are the same software with different{' '}
        <Code>JobToolConfig</Code> injections. This split keeps the CEO's personal project data and
        the construction team's data in separate collections by construction, not by filtering.
      </DocP>
    ),
  },
  {
    id: 'sales-crm',
    title: 'Leads (Sales CRM)',
    purpose:
      'Lead pipeline for the REP sales team. Two views: My Pipeline (leads assigned to the rep) and Pool (the shared, unassigned bucket any rep can Grab from). A rep can also Drop one of their own leads back to the pool. Admins see every assigned lead. Tracked through the call outreach sequence. Pool model added v1.82.0.',
    access: 'Tool-gated (sales-crm); a pure rep lands on /sales-crm directly',
    routes: [
      {
        path: '/sales-crm',
        description:
          'My Pipeline + Pool views; status filter chips (All · New · Call 1 · Call 2 · Call 3 · Won · Lost) + State/County territory filters; lead detail modal (read + explicit Edit/Save — all lead fields editable, owner/admin) with Grab / Drop, Grab-number mobile reveal, additional contacts, and document cards. Checkbox multi-select with bulk Grab / Drop / Reassign (admin). (Stats removed v1.82.0.)',
      },
    ],
    dataSources: [
      {
        name: 'leads',
        kind: 'Firestore',
        notes:
          'Pipeline New → Call 1 → Call 2 → Call 3 → Won/Lost (+ Reopen). assignedTo === \'\' means the lead is in the shared grab pool; reps Grab (\'\' → me) / Drop (me → \'\'). Legacy email_sent leads normalize to Call 1 on read. Carries county (bare name) from Lead Builder → the list shows County, State; the Contact column stacks phone + email with one-click copy. Rep-appended additionalContacts[]/altPhones[]/documents[] via atomic arrayUnion/arrayRemove; enriched Apollo fields stay read-only.',
      },
      {
        name: 'leads/{leadId}/…',
        kind: 'Storage',
        notes: 'Named-slot lead documents (Utility Bill / Signed Contract / Other).',
      },
    ],
    keyFiles: [
      { path: 'src/tools/SalesCrmTool.tsx', role: 'Tool page.' },
      {
        path: 'src/components/crm/',
        role: 'Sidebar (Pipeline + Stats), lead table/detail/form, per-rep + admin stats.',
      },
      { path: 'src/lib/leadDocuments.ts', role: 'Lead document upload/remove/download (Storage).' },
    ],
  },
  {
    id: 'sales-admin',
    title: 'Sales Dashboard',
    purpose:
      'Admin-only aggregated view of sales performance: leaderboard, pipeline breakdown, conversion rates.',
    access: 'Tool-gated (sales-admin), surfaced admin-only on the Dashboard',
    routes: [{ path: '/sales-admin', description: 'Aggregated stats across all salespeople.' }],
    dataSources: [
      { name: 'leads', kind: 'Firestore', notes: 'Aggregated client-side across all users.' },
    ],
    keyFiles: [{ path: 'src/components/crm/AdminStats.tsx', role: 'Admin sales stats.' }],
  },
  {
    id: 'well-finder',
    title: 'Well Finder',
    purpose:
      'Admin-only map of Texas oil & gas wells from the RRC, identifying reactivation candidates (shut-in wells) and acquisition candidates (active wells), ranked by opportunity.',
    access: 'Admin-only (allowedRoles)',
    routes: [{ path: '/well-finder', description: 'Statewide well map with status filters.' }],
    dataSources: [
      {
        name: 'wells.pmtiles',
        kind: 'Storage',
        notes: 'Pre-tiled statewide well layer (production mode).',
      },
      { name: 'Texas RRC ArcGIS', kind: 'External API', notes: 'Live paginated fallback in dev.' },
      {
        name: 'RRC bulk data',
        kind: 'External API',
        notes: 'Per-well enrichment joined by API number (cloudrun-rrc-bulks).',
      },
    ],
    keyFiles: [
      {
        path: 'src/components/well-finder/WellFinderMap.tsx',
        role: 'MapLibre map with PMTiles + live fallback.',
      },
      { path: 'functions/src/wellFinder/README.md', role: 'Backend pipeline documentation.' },
    ],
    howItWorks: (
      <DocP>
        Production reads pre-tiled <Code>wells.pmtiles</Code> from Firebase Storage, rebuilt monthly
        by the pipeline described in Backend Services &amp; Pipelines (<Code>fetchRrcWells</Code> →{' '}
        <Code>triggerPmtilesBuild</Code> → <Code>cloudrun-tippecanoe</Code>).
      </DocP>
    ),
  },
  {
    id: 'documents',
    title: 'Documents',
    purpose:
      'Internal document hub: role-filtered shortcut cards into the company Google Drive (My Documents, Templates, …).',
    access: 'All authenticated users (cards filtered by role)',
    routes: [
      { path: '/documents', description: 'Shortcut cards; each opens a Drive URL in a new tab.' },
    ],
    dataSources: [
      {
        name: 'Google Drive',
        kind: 'External API',
        notes: 'No API or OAuth — Drive enforces access at click time.',
      },
    ],
    keyFiles: [
      {
        path: 'src/lib/documents.ts',
        role: 'DOCUMENT_SHORTCUTS array (role-gated); append to add HR, Legal, etc.',
      },
    ],
    howItWorks: (
      <DocP>
        Deliberately minimal: no Drive API integration, just curated links. A planned follow-up (PR
        4.2) repurposes this tool into a cross-customer search over the folder system's{' '}
        <Code>documents</Code> collection.
      </DocP>
    ),
  },
  {
    id: 'todo-list',
    title: 'To-Do List',
    purpose:
      'Collaborative company task list: add, edit, complete, assign, and delegate tasks with category, priority, and a due date. Anyone can assign a task to anyone; company-visible tasks are a shared team board.',
    access: 'All authenticated users',
    routes: [
      {
        path: '/todo-list',
        description:
          'Two scope tabs — Personal / Company — each with three views: List, Calendar (Week or Month span), and Board (Kanban by status). List and Board share the search/category/person filters; List adds the to-do/done/archived toggle; Company Calendar (Week span) has a fullscreen Present mode.',
      },
    ],
    dataSources: [
      {
        name: 'user-tasks',
        kind: 'Firestore',
        notes:
          "Each doc carries ownerUid (creator, immutable after create — rule-enforced so no edit can lock the creator out), assigneeUid, visibility ('company' | 'private'; absent ⇒ private for legacy docs), and a queryable archived boolean. Full-trust rule: any authenticated user reads and edits company-visible tasks; private tasks are creator + assignee only. No hard deletes. Legacy backfill: scripts/migrate-user-tasks.mjs.",
      },
      {
        name: 'users',
        kind: 'Firestore',
        notes:
          'User directory for the assignee picker; names resolve live via userLabel (never cached on the task doc, so renames cannot strand stale labels).',
      },
      {
        name: 'notifications',
        kind: 'Firestore',
        notes:
          'Per-user notification docs (recipientUid, title, body, link, read flag). Written server-only by the onUserTaskAssigned Cloud Function when a task is assigned to someone other than the assigner; surfaced by the navbar NotificationBell (all roles) and emailed via Resend.',
      },
    ],
    keyFiles: [
      {
        path: 'src/tools/TodoListTool.tsx',
        role: 'Tool page — List / Calendar (week + month) / Board views, shared chip + drag primitives, task window.',
      },
      { path: 'src/lib/userTasks.ts', role: 'CRUD + bounded or()-query subscriptions.' },
      { path: 'src/hooks/useUserTasks.ts', role: 'Live + on-demand-archived subscriptions.' },
      {
        path: 'functions/src/notifications/onTaskAssigned.ts',
        role: 'Assignment-notification trigger — writes a notification doc + sends a Resend email.',
      },
      {
        path: 'src/components/notifications/NotificationBell.tsx',
        role: 'Navbar notification bell (all roles) — unread badge, mark-read, deep-links to /todo-list.',
      },
      { path: 'scripts/migrate-user-tasks.mjs', role: 'Legacy visibility/archived backfill.' },
    ],
    howItWorks: (
      <>
        <DocP>
          Collaborative since v1.61.0 (full-trust model decided 2026-06-12). Every task has a
          creator (ownerUid) and a single assignee — one responsible person, clear accountability.
          New tasks default to company visibility, except the Personal category which defaults to
          private; legacy pre-collaboration docs are treated as private until the backfill script
          stamps them. The UI is two scope <strong>tabs</strong> (default Personal) —{' '}
          <strong>Personal</strong> shows tasks assigned to me, <strong>Company</strong> shows all
          company-visible tasks plus the viewer's own delegations whatever their visibility — each
          offering three views. <strong>List</strong>: Personal groups into week sections (Overdue /
          Today / This week / Next week / No date; done by completion week); Company groups per
          person with initials avatars (person + "Assigned by me" filters). <strong>Calendar</strong>{' '}
          toggles a <strong>Week</strong> or <strong>Month</strong> span: the Week span is the
          days-as-columns grid (Personal) or the people × days meeting board with fullscreen Present
          mode (Company); the Month span is one shared Mon-anchored 6×7 grid (Company chips carry an
          assignee avatar). <strong>Board</strong> is a Kanban — To do / In progress / Done columns;
          dragging a card sets its status (stamping/clearing completedAt), giving the otherwise
          headless "In progress" state a home. Calendars show only dated tasks; chips drag to
          reschedule (Week-Company also reassigns), and the Board is built from the same scoped +
          filtered task set as the List.
        </DocP>
        <DocP>
          Creation goes through the + New task window; clicking a task opens a visual read view
          (category-tinted header, status pill, people row, signal chips) with editing as an
          explicit step that writes only the fields the user changed (concurrent edits by teammates
          are not clobbered). The client subscribes with an or() query — company-visible OR mine OR
          assigned to me — whose disjuncts mirror the Firestore read rule, narrowed to archived ==
          false so the always-on listener stays bounded; archived tasks load in a separate on-demand
          subscription. The onUserTaskWrite activity trigger audits every create / edit /
          reassignment / completion of <em>company-visible</em> tasks only — private-task content
          never reaches the admin-readable activity log.
        </DocP>
        <DocP>
          <strong>Assignment notifications (v1.78.0):</strong> a separate{' '}
          <Code>onUserTaskAssigned</Code> Cloud Function fires on every{' '}
          <Code>user-tasks</Code> write and, when the explicit <Code>assigneeUid</Code> changes to
          someone other than the person making the change (no self-assign noise; an explicit
          delegation only, never an owner fallback), writes a per-user <Code>notifications</Code>{' '}
          doc and sends the assignee an email via Resend. The write is idempotent on the Functions
          event id (<Code>create()</Code> + ALREADY_EXISTS skip), so an at-least-once redelivery
          never duplicates the email or resets read state. Unlike the audit trigger it also notifies
          on private tasks — a direct assignee must always be told. The recipient sees it in the
          navbar <Code>NotificationBell</Code> (available to every role, with an unread badge and
          mark-read), which deep-links back to the To-Do list.
        </DocP>
      </>
    ),
  },
  {
    id: 'user-management',
    title: 'User Management',
    purpose:
      'Admin-only tool to view platform users, manage their roles, and grant per-tool access.',
    access: 'Admin-only (allowedRoles)',
    routes: [
      { path: '/user-management', description: 'User list with role + tool allowlist editing.' },
    ],
    dataSources: [
      {
        name: 'users',
        kind: 'Firestore',
        notes: 'Role and allowedTools per user; consumed by useAuth and ProtectedRoute.',
      },
    ],
    keyFiles: [{ path: 'src/pages/UserManagement.tsx', role: 'Tool page.' }],
  },
  {
    id: 'activity-log',
    title: 'Activity Log',
    purpose:
      'Admin-only audit trail: every create, edit, delete, upload, login, page view, tool run, and export across the platform.',
    access: 'Admin-only (allowedRoles)',
    routes: [
      {
        path: '/admin/activity',
        description: 'Filterable audit feed + suspicious-pattern banner.',
      },
    ],
    dataSources: [
      {
        name: 'activity',
        kind: 'Firestore',
        notes:
          'Trigger-mirrored writes + client-reported events with session fingerprint (IP, user agent, timezone).',
      },
    ],
    keyFiles: [
      { path: 'src/pages/AdminActivity.tsx', role: 'Audit feed page.' },
      { path: 'functions/src/activity/', role: 'Firestore triggers + diff rendering.' },
      { path: 'docs/activity-firestore-setup.md', role: 'Required rules and indexes.' },
    ],
    howItWorks: (
      <DocP>
        Cloud Functions triggers mirror writes on every core collection into <Code>activity</Code>{' '}
        with actor, changed fields, and before/after slices. The client adds
        login/view/tool-run/export entries (page views deduped to one per user/route per 60 s). The
        page surfaces suspicious patterns: multi-IP within an hour, or accounts active without a
        fresh sign-in for 7+ days.
      </DocP>
    ),
  },
];
