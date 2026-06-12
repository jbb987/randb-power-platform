import {
  DocTitle,
  DocH2,
  DocP,
  DocList,
  DocTable,
  Code,
  Callout,
} from '../../components/whitepaper/DocBlocks';

export default function McpServerSection() {
  return (
    <article>
      <DocTitle lead="The read-only Model Context Protocol endpoint that lets AI agents query platform data directly.">
        MCP Server
      </DocTitle>

      <DocP>
        The same Cloudflare Pages Worker that serves the SPA hosts an MCP (Model Context Protocol)
        server at <Code>/mcp</Code>. Any MCP client — Claude Code, Cursor, or any agent platform via
        a generic authenticated POST — can query sites, LLRs, CRM records, and the activity log
        without going through the SPA UI. The code lives in <Code>mcp/</Code>, separate from the
        React <Code>src/</Code>.
      </DocP>

      <DocH2 id="design">Design</DocH2>
      <DocList
        items={[
          <>
            <strong>Transport</strong> — stateless streamable-HTTP using the official SDK's
            Workers-compatible <Code>WebStandardStreamableHTTPServerTransport</Code>; a fresh server
            + transport is instantiated per request (sub-millisecond).
          </>,
          <>
            <strong>Inbound auth</strong> — single shared bearer token (
            <Code>MCP_BEARER_TOKEN</Code>), constant-time compare.
          </>,
          <>
            <strong>Outbound auth</strong> — a service-account JWT signed with Web Crypto is
            exchanged for a Google OAuth token and used against the Firestore REST API. No{' '}
            <Code>firebase-admin</Code> dependency (Node-only, unreliable on Workers).
          </>,
          <>
            <strong>Read-only by design</strong> — writes are deferred behind a future{' '}
            <Code>MCP_WRITE_ENABLED</Code> flag with audit entries.
          </>,
        ]}
      />

      <DocH2 id="tools">Exposed tools</DocH2>
      <DocTable
        head={['Tool', 'Reads', 'Notes']}
        rows={[
          [
            <Code>list_sites / get_site</Code>,
            'sites-registry',
            'get_site supports section projection — a full entry can exceed 50 KB.',
          ],
          [
            <Code>list_llrs / get_llr</Code>,
            'preconstruction-sites',
            'Filterable by utility and grade.',
          ],
          [
            <Code>list_companies / get_company / list_contacts</Code>,
            'crm-companies, crm-contacts',
            'get_company returns the customer plus all linked contacts.',
          ],
          [
            <Code>get_recent_activity</Code>,
            'activity',
            'Newest first; filterable by actor email and resource type.',
          ],
        ]}
      />

      <DocH2 id="client-setup">Client setup</DocH2>
      <DocP>
        Register the endpoint in Claude Code (same URL + header works in Cursor, Windsurf, Zed):
      </DocP>
      <Callout>
        <Code>
          claude mcp add randb --transport http --url https://&lt;pages-domain&gt;/mcp --header
          "Authorization: Bearer $RANDB_MCP_TOKEN"
        </Code>
      </Callout>
      <DocP>
        Composite indexes backing the filterable queries are versioned in{' '}
        <Code>firestore.indexes.json</Code> and deployed with{' '}
        <Code>firebase deploy --only firestore:indexes</Code>. Secrets (
        <Code>MCP_BEARER_TOKEN</Code>, <Code>FIREBASE_SERVICE_ACCOUNT_JSON</Code>) are set via{' '}
        <Code>wrangler secret put</Code>; local dev reads them from <Code>.dev.vars</Code>.
      </DocP>
    </article>
  );
}
