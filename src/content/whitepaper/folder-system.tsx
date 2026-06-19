import {
  DocTitle,
  DocH2,
  DocP,
  DocList,
  DocTable,
  Code,
} from '../../components/whitepaper/DocBlocks';

export default function FolderSystemSection() {
  return (
    <article>
      <DocTitle lead="The customer-rooted folder & document system shared by the Directory, project trackers, and LLR.">
        Folder &amp; Document System
      </DocTitle>

      <DocP>
        The folder system replaced the legacy six-category flat document model with a
        customer-rooted folder tree. It is mounted as the <strong>Folders</strong> section on the
        customer profile and as <strong>Project folders</strong> (scoped to the project's subtree)
        on both project trackers and on LLR sites. It is built on three Firestore collections —{' '}
        <Code>folders</Code>, <Code>documents</Code>, <Code>customer-projects</Code> — and one
        shared component, <Code>FolderBrowser</Code>.
      </DocP>

      <DocH2 id="capabilities">Capabilities</DocH2>
      <DocList
        items={[
          <>
            <strong>Browse</strong> — tile grid + breadcrumb; folders drill in, documents open via
            Storage signed URLs.
          </>,
          <>
            <strong>Mutate</strong> — new folder, multi-file upload into the current folder, rename
            and archive via kebab menu.
          </>,
          <>
            <strong>No deletion</strong> — "delete" is archive: Storage blobs are never removed.
            Archived items live in a Trash view with per-item Restore.
          </>,
          <>
            <strong>Per-folder access</strong> — Manage Access modal with two axes (view, edit) ×
            three modes (inherit / admin-only / specific people). Admins always pass. Enforcement is
            client-side in v1; server-side rule walks of <Code>ancestorFolderIds</Code> are a
            deferred follow-up.
          </>,
          <>
            <strong>Auto-provisioning</strong> — creating a construction project or an LLR site
            idempotently creates the customer root folder, the project folder, and the{' '}
            <Code>customer-projects</Code> record, so new work lands with a working folder browser
            instead of empty state.
          </>,
        ]}
      />

      <DocH2 id="naming">Deterministic naming</DocH2>
      <DocP>
        Folder and document ids are deterministic, which makes provisioning and migration idempotent
        — re-running either is a safe no-op:
      </DocP>
      <DocTable
        head={['Pattern', 'Meaning']}
        rows={[
          [
            <Code>cat_&#123;companyId&#125;_&#123;category&#125;</Code>,
            'Migrated legacy category folder.',
          ],
          [
            <Code>cust_&#123;companyId&#125;_construction-root</Code>,
            "Customer's construction root folder.",
          ],
          [
            <Code>cust_&#123;companyId&#125;_precon-root</Code>,
            "Customer's LLR (pre-con) root folder.",
          ],
          [<Code>proj_&#123;jobId&#125;_root</Code>, "Project's root folder."],
          [<Code>precon_&#123;siteId&#125;_root</Code>, "LLR site's root folder."],
          [
            <Code>crmDoc_/jobDoc_/jobPhoto_…</Code>,
            'Documents migrated from the legacy collections.',
          ],
        ]}
      />

      <DocH2 id="migration">Migration &amp; rollback</DocH2>
      <DocP>
        A one-shot idempotent script (<Code>scripts/migrate-to-folder-system.mjs</Code>, dry-run by
        default) moved every legacy CRM and construction document into the new schema without
        touching Storage blobs. The CRM <Code>DocumentsSection</Code> UI was retired 2026-05-27; the
        construction-side <Code>JobDocumentsSection</Code> (its component, hook, and{' '}
        <Code>constructionDocuments.ts</Code> lib) was retired 2026-06-19, leaving{' '}
        <Code>FolderBrowser</Code> as the only document surface platform-wide. The rollback window on
        the legacy <Code>crm-documents</Code> and per-job <Code>documents</Code> subcollections
        closed <strong>2026-06-13</strong>, so client access to them is now default-denied in{' '}
        <Code>firestore.rules</Code> — the dormant docs remain in Firestore for an eventual Admin-SDK
        purge, and their Storage blobs stay live because migrated folder-system records still point
        at the original <Code>construction-documents/</Code> paths. Full design history:{' '}
        <Code>docs/architecture/folder-system-plan.md</Code>.
      </DocP>
    </article>
  );
}
