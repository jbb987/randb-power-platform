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
        notes: 'Auto-provisioned folder skeleton + Project record on create.',
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
          (Oncor / AEP / Coop / Other). A per-request document submission checklist tracks what the
          utility still needs.
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
          <strong>Executive Summary</strong> — a customer-facing pitch sheet with a hero MW target
          (up to 10 GW via a log-scaled slider), a year-by-year ramp schedule (auto-computed to stay
          within ~12 years, or hand-edited per year), and a mini-summary block per analysis domain.
          It exports as a single-page PDF; the full 12-page report targets the land owner.
        </DocP>
        <DocP>
          <strong>Exhibit A alignment (v1.60.0):</strong> the full report follows the Phase A
          deliverables contract structure — General Project Information (jurisdiction, coordinates,
          grid/TO/TSP/LSE), Capacity &amp; Load Viability (deliverability indicators, energization
          window from county-queue median time-to-COD, ramp schedule), an ERCOT- or SPP-specific
          section selected automatically by RTO (capacity-flagged substations, county queue, ROM
          interconnection cost with stated assumptions, LFL assessment), Data Center Metrics,
          auto-derived Constraints &amp; Fatal Flaws, and a GO / CONDITIONAL GO / NO-GO
          Recommendation pulled from the linked LLR grade (or auto-suggested from the appraisal).
          Everything is synthesized in <Code>src/lib/exhibitA.ts</Code> from data the sections
          already produce — no manual inputs. The Power section embeds a grid context map (screen:
          MapLibre; PDF: canvas-rendered satellite + substation overlay), and HIFLD placeholder
          names (UNKNOWN*/TAP*) are rewritten for customer-facing output.
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
        description: 'Detail: overview, team, tasks, photos, documents, folders, timeline.',
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
        their own task status and upload photos. Documents support rename and recoverable archive —
        never deletion.
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
        description: 'Detail: overview, team, tasks, photos, documents, folders, timeline.',
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
      'Lead management for the REP sales team, tracking leads through the call/email outreach sequence.',
    access: 'Tool-gated (sales-crm)',
    routes: [
      {
        path: '/sales-crm',
        description: 'Lead table, detail modal, stats, archive, CSV bulk upload.',
      },
    ],
    dataSources: [
      {
        name: 'leads',
        kind: 'Firestore',
        notes: 'Pipeline: New → Call 1 → Email → Call 2 → Final Call → Won/Lost.',
      },
    ],
    keyFiles: [
      { path: 'src/tools/SalesCrmTool.tsx', role: 'Tool page.' },
      {
        path: 'src/components/crm/',
        role: 'Sidebar, lead table/detail/form, bulk upload, stats, archive.',
      },
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
      'Per-user private task list: add, edit, and complete tasks with category, priority, and due / "do on" dates.',
    access: 'All authenticated users',
    routes: [{ path: '/todo-list', description: 'Active/done toggle, category filter.' }],
    dataSources: [
      {
        name: 'user-tasks',
        kind: 'Firestore',
        notes:
          "Owner-scoped: each doc carries ownerUid and Firestore rules restrict access to the owner (the platform's first owner-scoped collection).",
      },
    ],
    keyFiles: [
      { path: 'src/tools/TodoListTool.tsx', role: 'Tool page.' },
      { path: 'src/lib/userTasks.ts', role: 'CRUD service.' },
    ],
    howItWorks: (
      <DocP>
        Active tasks sort overdue → priority (high → normal → low) → soonest date → newest-created;
        done tasks show most-recently-completed first.
      </DocP>
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
