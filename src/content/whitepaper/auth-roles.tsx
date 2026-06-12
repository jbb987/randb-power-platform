import {
  DocTitle,
  DocH2,
  DocP,
  DocList,
  DocTable,
  Code,
  Callout,
} from '../../components/whitepaper/DocBlocks';

export default function AuthRolesSection() {
  return (
    <article>
      <DocTitle lead="How users sign in, what roles exist, and how per-tool and per-record access is granted and enforced.">
        Authentication &amp; Roles
      </DocTitle>

      <DocH2 id="authentication">Authentication</DocH2>
      <DocP>
        Sign-in is handled by Firebase Auth (accounts on the <Code>@randbpowerinc.us</Code> domain).
        The <Code>useAuth</Code> hook (<Code>src/hooks/useAuth.ts</Code>) exposes the current{' '}
        <Code>user</Code>, their <Code>role</Code>, and their <Code>allowedTools</Code> list,
        resolved from the user's Firestore document. Unauthenticated visitors are redirected to{' '}
        <Code>/login</Code>. Every fresh sign-in writes a <Code>login</Code> entry to the Activity
        Log.
      </DocP>

      <DocH2 id="roles">Roles</DocH2>
      <DocTable
        head={['Role', 'Meaning']}
        rows={[
          ['admin', 'Global access: every tool, every record, plus the admin-only tools.'],
          ['manager', 'Standard team member; sees the tools granted in User Management.'],
          [
            'labor',
            'Field worker; in project trackers sees only assigned projects, can update own task status and upload photos.',
          ],
        ]}
      />
      <DocP>
        Legacy role values (<Code>employee</Code> → <Code>manager</Code>, <Code>worker</Code> →{' '}
        <Code>labor</Code>) are translated on read by <Code>normalizeRole()</Code> so no hard
        user-doc migration was needed.
      </DocP>

      <DocH2 id="authorization">Authorization layers</DocH2>
      <DocList
        items={[
          <>
            <strong>Per-user tool allowlist</strong> — routes carry a <Code>toolId</Code>; non-admin
            users can open a tool only if it appears in their <Code>allowedTools</Code> array,
            managed in User Management. Admins bypass tool-level checks.
          </>,
          <>
            <strong>Role-gated routes</strong> — admin-only tools (User Management, Activity Log,
            Sales Dashboard, Well Finder) require the <Code>admin</Code> role via{' '}
            <Code>allowedRoles</Code>.
          </>,
          <>
            <strong>All-roles tools</strong> — Documents and To-Do List are available to every
            authenticated user regardless of allowlist.
          </>,
          <>
            <strong>Per-project membership</strong> — inside Bailey Project / Construction Projects,
            permission level (admin / supervisor / labor) derives from each project's team
            membership, not from a global grant (<Code>useJobPermissions</Code>).
          </>,
          <>
            <strong>Per-folder access</strong> — the folder system has a Manage Access modal per
            folder/doc (view + edit × inherit / admin-only / specific people). Enforcement is
            client-side in v1.
          </>,
          <>
            <strong>Owner-scoped data</strong> — To-Do tasks live in the <Code>user-tasks</Code>{' '}
            collection where Firestore rules restrict reads/writes to the row's{' '}
            <Code>ownerUid</Code>.
          </>,
        ]}
      />
      <DocP>
        The Dashboard derives tool visibility from the same data, so users only see cards for tools
        they can actually open. Tool ids are registered centrally in <Code>src/types/index.ts</Code>
        ; renamed ids are migrated on read via <Code>normalizeToolId()</Code>.
      </DocP>

      <DocH2 id="enforcement">Server-side enforcement</DocH2>
      <DocP>
        Client-side gating is user experience; the security boundary is Firestore security rules and
        Storage rules. Known rules are documented in <Code>docs/firestore-rules.md</Code> (e.g. the
        owner-scoped <Code>user-tasks</Code> rule, activity-log rules per{' '}
        <Code>docs/activity-firestore-setup.md</Code>); composite indexes are versioned in{' '}
        <Code>firestore.indexes.json</Code>.
      </DocP>
      <Callout variant="warn">
        The full ruleset still lives in the Firebase Console rather than the repository. Versioning
        the complete <Code>firestore.rules</Code> file and documenting the per-collection access
        matrix here is an open task — until then, treat <Code>docs/firestore-rules.md</Code> as
        partial.
      </Callout>

      <DocH2 id="audit">Audit trail</DocH2>
      <DocP>
        Cloud Functions Firestore triggers write every create/update/delete on the core collections
        to the <Code>activity</Code> collection, with actor, changed fields, before/after slices,
        and a rendered summary. The client adds <Code>login</Code>, <Code>view</Code> (60-second
        per-route dedupe), tool-run, and export entries with a session fingerprint (IP, user agent,
        timezone). Admins browse it at <Code>/admin/activity</Code>, which also surfaces suspicious
        patterns (multi-IP within an hour; active without a fresh sign-in for 7+ days).
      </DocP>
    </article>
  );
}
