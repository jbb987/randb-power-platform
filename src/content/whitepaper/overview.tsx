import { DocTitle, DocH2, DocP, DocList, DocTable } from '../../components/whitepaper/DocBlocks';

export default function OverviewSection() {
  return (
    <article>
      <DocTitle lead="What the R&B Power Platform is, who it serves, and how its tools fit together.">
        Platform Overview
      </DocTitle>

      <DocP>
        The R&B Power Platform is the internal tool suite for R&B Power. It centralizes the data and
        analysis work behind site selection, power infrastructure due diligence, the Large Load
        Request process with utilities, construction tracking, retail energy (REP) sales, and oil
        &amp; gas acquisition — work that previously lived in spreadsheets, one-off reports, and
        individual inboxes.
      </DocP>
      <DocP>
        Two ideas anchor the platform. The <strong>Directory (CRM)</strong> is the central database:
        customers, people, folders, and documents, shared across every other tool. The{' '}
        <strong>Site Analyzer</strong> is the analysis engine: given coordinates, it runs land
        valuation, power, broadband, transport, water, gas, labor, and political-radar analyses in
        parallel, saves the result to the site registry, links it to a customer, and exports both a
        full 12-page due diligence PDF and a single-page customer-facing Executive Summary.
      </DocP>

      <DocH2 id="tool-inventory">Tool inventory</DocH2>
      <DocP>The dashboard groups tools by business line:</DocP>
      <DocTable
        head={['Tool', 'Dashboard section', 'One-liner']}
        rows={[
          [
            'Directory (CRM)',
            'Company',
            'Customers and people, with the customer-rooted folder & document system.',
          ],
          [
            'Documents',
            'Company',
            'Role-filtered shortcuts into the internal Google Drive (templates, shared files).',
          ],
          [
            'To-Do List',
            'Company',
            'Per-user private task list with categories, priorities, and dates.',
          ],
          [
            'Bailey Project',
            'Company',
            "Project tracker instance reserved for the CEO's projects.",
          ],
          [
            'Large Load Request',
            'Pre-Construction',
            'Raw site → graded site → engineer review → utility LOA timeline.',
          ],
          [
            'Site Analyzer',
            'Pre-Construction',
            'Coordinate-driven multi-source site analysis with PDF exports.',
          ],
          [
            'Grid Power Analyzer',
            'Pre-Construction',
            'Interactive map of generators, transmission, substations, and capacity.',
          ],
          [
            'Market Intelligence',
            'Pre-Construction',
            'Auto-collected live feed of US data-center deal news.',
          ],
          [
            'One-Line Generator',
            'Pre-Construction',
            'Utility-grade electrical one-line diagrams generated from a site spec.',
          ],
          [
            'Construction Projects',
            'Construction',
            "Project tracker instance for the construction team's active jobs.",
          ],
          ['Leads', 'REP', 'Sales pipeline from first call through won/lost.'],
          ['Sales Dashboard', 'REP', 'Admin-only aggregated sales performance and leaderboard.'],
          [
            'Well Finder',
            'Oil and Gas',
            'Admin-only map of Texas RRC wells ranked as reactivation/acquisition candidates.',
          ],
          [
            'Activity Log',
            'Settings',
            'Admin-only audit trail of every create, edit, upload, login, and tool run.',
          ],
          ['User Management', 'Settings', 'Admin-only user roles and per-user tool access.'],
          [
            'Whitepaper',
            'Documentation',
            'This document — the living reference for the whole platform.',
          ],
        ]}
      />

      <DocH2 id="how-tools-relate">How the tools relate</DocH2>
      <DocList
        items={[
          <>
            <strong>The Directory is the hub.</strong> Site Analyzer sites, LLR sites, and
            construction projects all link to customers; folders, documents, and people live on the
            customer record.
          </>,
          <>
            <strong>The Site Analyzer feeds the workflow tools.</strong> An analyzed site can be
            converted into a Large Load Request without re-running the analysis, and the One-Line
            Generator can prefill its spec (name, MW, coordinates) from an analyzed site.
          </>,
          <>
            <strong>One project tracker, two instances.</strong> Bailey Project and Construction
            Projects share the same components and hooks but read/write separate Firestore
            collections and Storage prefixes, so the CEO's data and the construction team's data
            never mix.
          </>,
          <>
            <strong>Everything is audited.</strong> Firestore triggers mirror every
            create/update/delete — plus client-reported logins, page views, tool runs, and exports —
            into the Activity Log.
          </>,
          <>
            <strong>Access is per-user, per-tool.</strong> Admins see everything; other users see
            the tools granted to them in User Management, plus the handful of all-roles tools
            (Documents, To-Do List).
          </>,
        ]}
      />
    </article>
  );
}
