import {
  DocTitle,
  DocH2,
  DocP,
  DocList,
  DocTable,
  Code,
  Callout,
} from '../../components/whitepaper/DocBlocks';

export default function ArchitectureSection() {
  return (
    <article>
      <DocTitle lead="Tech stack, project structure, and how code moves from a commit to production.">
        Architecture &amp; Tech Stack
      </DocTitle>

      <DocH2 id="stack">Stack</DocH2>
      <DocTable
        head={['Layer', 'Technology']}
        rows={[
          ['Framework', 'React 19 + TypeScript'],
          ['Build', 'Vite (tsc -b + vite build, plus a worker typecheck via tsconfig.worker.json)'],
          ['Styling', 'Tailwind CSS v4 (+ Prettier for formatting)'],
          ['Routing', 'React Router DOM v7'],
          ['Backend', 'Firebase — Auth, Firestore, Storage, Cloud Functions (v2, Node 22)'],
          ['Edge', 'Cloudflare Pages Worker — API proxies (Census, FCC) + the /mcp MCP server'],
          ['Maps', 'MapLibre GL + react-map-gl (+ PMTiles for Well Finder)'],
          ['PDF', '@react-pdf/renderer (local TTF fonts in public/fonts/)'],
          ['Animation', 'Framer Motion'],
          ['Monitoring', 'Sentry (@sentry/react)'],
          ['Hosting', 'Cloudflare Pages — deploys automatically on push to main'],
        ]}
      />

      <DocH2 id="structure">Project structure</DocH2>
      <DocP>
        The repository is a single Vite app plus backend workspaces. Frontend code follows a
        consistent per-tool layout: each tool has a page component in <Code>src/tools/</Code>, its
        components in a named folder under <Code>src/components/</Code>, data access in{' '}
        <Code>src/lib/</Code>, and shared domain types in <Code>src/types/index.ts</Code>.
      </DocP>
      <DocTable
        head={['Path', 'Contents']}
        rows={[
          [<Code>src/tools/</Code>, 'One entry component per tool/route.'],
          [
            <Code>src/components/&lt;tool&gt;/</Code>,
            'Per-tool component folders (site-analyzer/, power-map/, precon/, construction/, …).',
          ],
          [
            <Code>src/lib/</Code>,
            'Data-access and analysis services — components never call Firestore or external APIs directly.',
          ],
          [
            <Code>src/hooks/</Code>,
            'Shared hooks (useAuth, useCompanies, useSiteRegistry, useJobPermissions, …).',
          ],
          [
            <Code>src/types/index.ts</Code>,
            'Domain types, the ToolId registry, role definitions, and id migrations.',
          ],
          [
            <Code>functions/</Code>,
            'Firebase Cloud Functions (v2, Node 22, TypeScript) + the Pages Worker (worker.ts).',
          ],
          [
            <Code>mcp/</Code>,
            'The read-only MCP server hosted on the Pages Worker (see Backend & Data).',
          ],
          [
            <Code>cloudrun-pdq/ cloudrun-rrc-bulks/ cloudrun-tippecanoe/</Code>,
            'Cloud Run services (Well Finder pipeline and bulk ingestion).',
          ],
          [
            <Code>scripts/</Code>,
            'Maintenance scripts + the weekly Python queue-ingestion pipeline.',
          ],
          [<Code>docs/</Code>, 'Repo-side docs: ADRs, ERD, PRD, firestore-rules.md, setup guides.'],
        ]}
      />

      <DocH2 id="conventions">Conventions &amp; working agreements</DocH2>
      <DocList
        items={[
          <>
            <strong>Service layer.</strong> All Firestore reads/writes go through modules in{' '}
            <Code>src/lib/</Code>; UI components subscribe via hooks.
          </>,
          <>
            <strong>Version stamping.</strong> <Code>src/version.ts</Code> holds{' '}
            <Code>APP_VERSION</Code>, displayed in the navbar and bumped on every release.
          </>,
          <>
            <strong>Route gating.</strong> Every route is wrapped in <Code>ProtectedRoute</Code>{' '}
            with a <Code>toolId</Code>, <Code>allowedRoles</Code>, or plain authentication (see
            Authentication &amp; Roles).
          </>,
          <>
            <strong>Branch discipline.</strong> A repo hook blocks direct edits on <Code>main</Code>
            ; work happens on feature branches and merges via PR.
          </>,
          <>
            <strong>Living docs.</strong> <Code>CLAUDE.md</Code> is the repo-side map of routes,
            tools, and files; <Code>HANDOFF.md</Code> carries the SBAR summary of the latest
            session; <Code>TODO.md</Code> is the live task list. This whitepaper is the
            human-readable counterpart.
          </>,
          <>
            <strong>Backward-compatible renames.</strong> Renamed tool ids and roles are normalized
            on read (<Code>normalizeToolId</Code>, <Code>normalizeRole</Code>) instead of hard data
            migrations.
          </>,
        ]}
      />

      <DocH2 id="deployment">Deployment pipeline</DocH2>
      <DocP>
        Pushing to <Code>main</Code> triggers a Cloudflare Pages build (<Code>npm run build</Code> ={' '}
        <Code>tsc -b &amp;&amp; vite build</Code> + the worker typecheck) and deploys the static
        bundle plus the Pages Worker. Cloud Functions deploy separately via the Firebase CLI;
        Firestore composite indexes deploy from <Code>firestore.indexes.json</Code>; the Cloud Run
        services have their own container deploys.
      </DocP>
      <Callout variant="warn">
        A push to <Code>main</Code> that compiles goes straight to production — reproduce the
        production build locally (<Code>npm run build</Code>) before pushing.
      </Callout>
    </article>
  );
}
