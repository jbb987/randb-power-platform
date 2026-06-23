import {
  DocTitle,
  DocH2,
  DocP,
  DocTable,
  Code,
  DocPlaceholder,
} from '../../components/whitepaper/DocBlocks';

export default function BackendSection() {
  return (
    <article>
      <DocTitle lead="Cloud Functions, Cloud Run services, the Cloudflare Worker, and the scheduled pipelines behind the tools.">
        Backend Services &amp; Pipelines
      </DocTitle>

      <DocH2 id="topology">Topology</DocH2>
      <DocP>
        The frontend talks to Firestore directly for CRUD; everything else is asynchronous. Firebase
        Cloud Functions (v2, Node 22, TypeScript, in <Code>functions/</Code>) handle scheduled
        ingestion, Firestore/Storage triggers, and audit mirroring. A Cloudflare Pages Worker (
        <Code>functions/worker.ts</Code>) serves the SPA, proxies CORS-blocked or key-bearing APIs
        (Census ACS / Geocoder), and hosts the MCP server. Three Cloud Run services do
        container-grade heavy lifting for the Well Finder.
      </DocP>

      <DocH2 id="scheduled">Scheduled ingestion</DocH2>
      <DocTable
        head={['Job', 'Cadence', 'What it does']}
        rows={[
          [
            <Code>refreshMarketIntel</Code>,
            'Every 6 h',
            'Pulls GDELT + trade RSS + Google News, two-stage keyword filter, regex tags, dedupes into market-intel-feed.',
          ],
          [
            <Code>refreshFederalBills</Code>,
            'Daily',
            'Congress.gov bills + joint resolutions filtered by threat keywords → political-radar-tracked-bills.',
          ],
          [
            <Code>refreshFederalOfficials</Code>,
            'Weekly',
            'All 535 current Congress members → political-radar-federal-officials.',
          ],
          [
            <Code>fetchRrcWells</Code>,
            'Monthly',
            'Pulls Texas RRC well data into Storage, kicking off the PMTiles build.',
          ],
          [
            'Queue ingestion',
            'Weekly',
            'GitHub Actions runs the Python pipeline in scripts/queue-ingestion/: all 7 ISO queues → HIFLD substation matching → substation_queue_load + county_queue_load.',
          ],
        ]}
      />

      <DocH2 id="well-finder-pipeline">Well Finder pipeline</DocH2>
      <DocTable
        head={['Step', 'Component', 'What happens']}
        rows={[
          [
            '1. Fetch',
            <Code>fetchRrcWells</Code>,
            'Monthly scheduled function pulls well data from the Texas RRC.',
          ],
          [
            '2. Trigger',
            <Code>triggerPmtilesBuild</Code>,
            'Storage trigger fires when fresh well data lands.',
          ],
          [
            '3. Tile',
            <Code>cloudrun-tippecanoe</Code>,
            'Cloud Run service builds wells.pmtiles vector tiles.',
          ],
          [
            '4. Enrich',
            <Code>cloudrun-rrc-bulks</Code>,
            'Ingests RRC bulk data (production histories) joined by API number.',
          ],
          [
            '5. Serve',
            'Firebase Storage',
            'The map reads pre-tiled wells.pmtiles; dev falls back to the live RRC ArcGIS layer.',
          ],
        ]}
      />
      <DocP>
        Detailed pipeline docs live in <Code>functions/src/wellFinder/README.md</Code>.
      </DocP>

      <DocH2 id="triggers">Audit triggers</DocH2>
      <DocP>
        Firestore triggers (<Code>onDocumentWrittenWithAuthContext</Code>) on every core collection
        mirror writes into the <Code>activity</Code> collection with actor, changed fields, and
        before/after slices — idempotent on the Functions v2 event id. Setup requirements are
        documented in <Code>docs/activity-firestore-setup.md</Code>.
      </DocP>

      <DocH2 id="worker">Cloudflare Worker proxies</DocH2>
      <DocP>
        The Pages Worker fronts APIs the browser can't call directly: Census ACS and the Census
        Geocoder are CORS-blocked, so the worker proxies them and injects the Census API key
        server-side (the key never ships in the bundle). The worker also hosts <Code>/mcp</Code> —
        see the MCP Server page.
      </DocP>

      <DocH2 id="site-score">Public site-score endpoint</DocH2>
      <DocP>
        <Code>POST /api/public/site-score</Code> (in <Code>functions/quickScore.ts</Code>) backs the
        public &ldquo;Is my land powerable?&rdquo; form on the marketing site. It is called
        server-to-server by that site&rsquo;s own Worker and gated by a shared bearer secret (
        <Code>SITE_SCORE_TOKEN</Code>) plus a native rate-limit binding (<Code>SITE_SCORE_RL</Code>) —
        the bearer is the real trust boundary since the caller shares one egress IP. Given a
        coordinate, acreage, and an existing-power flag it reuses the Site Analyzer grid engine (
        <Code>lookupGridInfra</Code> → <Code>analyzeGrid</Code> → <Code>scoreInfraVerdict</Code>) to
        return a deliberately coarse verdict (<Code>GO</Code> / <Code>CONDITIONAL</Code> /{' '}
        <Code>NO_GO</Code>) plus an MW range, and stores every submission as a{' '}
        <Code>site-leads</Code> document via the service account (the one Firestore write surface;
        clients are denied create). The verdict thresholds in <Code>quickScoreVerdict.ts</Code> are
        screening heuristics pending calibration with Bailey — the public answer is a beta estimate.
        Internal staff review and promote serious <Code>site-leads</Code> into <Code>leads</Code>{' '}
        (Phase 2 tool).
      </DocP>

      <DocH2 id="other-services">Operational runbooks</DocH2>
      <DocPlaceholder>
        Full Cloud Functions inventory (names, triggers, regions), the <Code>cloudrun-pdq</Code>{' '}
        service, deploy commands per service, and how to re-run a failed ingestion / where logs
        live.
      </DocPlaceholder>
    </article>
  );
}
