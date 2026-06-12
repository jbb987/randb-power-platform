import {
  DocTitle,
  DocH2,
  DocP,
  DocTable,
  Code,
  DocPlaceholder,
} from '../../components/whitepaper/DocBlocks';

export default function DataModelSection() {
  return (
    <article>
      <DocTitle lead="The Firestore collections behind the platform and how they reference each other.">
        Data Model
      </DocTitle>

      <DocP>
        All persistent data lives in Firestore, accessed exclusively through the service modules in{' '}
        <Code>src/lib/</Code>. Domain types for every document shape are centralized in{' '}
        <Code>src/types/index.ts</Code>. Binary assets (documents, photos, Well Finder tiles) live
        in Firebase Storage and are never deleted — "delete" everywhere means a recoverable archive
        flag. Entity relationships are also diagrammed in <Code>docs/architecture/ERD.md</Code>.
      </DocP>

      <DocH2 id="collections">Collections</DocH2>
      <DocTable
        head={['Collection', 'Owned by', 'Notes']}
        rows={[
          [
            <Code>users</Code>,
            'User Management',
            'Role + allowedTools per user; drives all client-side gating.',
          ],
          [
            <Code>crm-companies</Code>,
            'Directory',
            'Customers, tagged REP / Construction / Pre Construction / Utility.',
          ],
          [
            <Code>crm-contacts</Code>,
            'Directory',
            'People; one person links to multiple customers via affiliations[], each with its own title.',
          ],
          [
            <>
              <Code>folders</Code> + <Code>documents</Code>
            </>,
            'Folder system',
            'Customer-rooted folder tree with deterministic ids and per-folder access lists.',
          ],
          [
            <Code>customer-projects</Code>,
            'Folder system',
            "Project records (type 'pre-con' | 'construction' | 'rep') binding folders to workflows.",
          ],
          [
            <Code>sites-registry</Code>,
            'Site Analyzer',
            'Saved analyses: inputs, per-section results, section locks, custom ramp, quota metadata.',
          ],
          [
            <Code>preconstruction-sites</Code>,
            'Large Load Request',
            'LLR sites: grade, engineer review, LOA timeline, document checklist; links to sites-registry.',
          ],
          [
            <>
              <Code>construction-jobs</Code> (+ <Code>tasks</Code> subcollection)
            </>,
            'Bailey Project',
            "The CEO's project tracker instance.",
          ],
          [
            <Code>construction-projects-jobs</Code>,
            'Construction Projects',
            "The construction team's instance (same shape, separate data).",
          ],
          [
            <Code>leads</Code>,
            'Leads (Sales CRM)',
            'Pipeline: New → Call 1 → Email → Call 2 → Final Call → Won/Lost.',
          ],
          [
            <Code>user-tasks</Code>,
            'To-Do List',
            'Owner-scoped private tasks (first owner-scoped collection; rule in docs/firestore-rules.md).',
          ],
          [
            <Code>one-line-diagrams</Code>,
            'One-Line Generator',
            'Saved OneLineDocument specs — drawings are regenerated from spec, never stored.',
          ],
          [
            <>
              <Code>market-intel-feed</Code> + <Code>market-intel-meta</Code>
            </>,
            'Market Intelligence',
            'Ingested deal news (doc id = sha256 of URL); status is the only client-mutable field.',
          ],
          [
            <>
              <Code>political-radar-tracked-bills</Code> / <Code>-federal-officials</Code>
            </>,
            'Political Radar',
            'Server-ingested Congress.gov data read by the Site Analyzer section.',
          ],
          [
            <>
              <Code>substation_queue_load</Code> / <Code>county_queue_load</Code>
            </>,
            'Queue ingestion',
            'Weekly ISO interconnection-queue aggregates keyed by HIFLD id / (state, county).',
          ],
          [
            <>
              <Code>activity</Code> + <Code>user-history</Code>
            </>,
            'Activity Log',
            'Audit entries (trigger-mirrored + client-reported).',
          ],
        ]}
      />

      <DocH2 id="relationships">Relationships</DocH2>
      <DocP>
        The Directory is the hub: sites, LLR sites, and projects reference a <Code>companyId</Code>;
        contacts reference customers through <Code>affiliations[]</Code>. An LLR site references the{' '}
        <Code>sites-registry</Code> entry it was created from with a deterministic id (
        <Code>precon_&#123;siteRegistryId&#125;</Code>) so duplicate-create races collapse onto one
        document. Folder ids are deterministic too (<Code>cust_&#123;companyId&#125;_…</Code>,{' '}
        <Code>proj_&#123;jobId&#125;_…</Code>), which makes provisioning and migration idempotent.
        References are by document id; label resolution happens client-side via the shared hooks.
      </DocP>

      <DocH2 id="collections-reference">Field-level reference</DocH2>
      <DocPlaceholder>
        Exhaustive schema reference: per-collection document fields with types, subcollections, and
        the composite indexes each query relies on (see <Code>firestore.indexes.json</Code>). To be
        generated from <Code>src/types/index.ts</Code> and the <Code>src/lib/</Code> service
        modules.
      </DocPlaceholder>
    </article>
  );
}
