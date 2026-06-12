import {
  DocTitle,
  DocH2,
  DocP,
  DocTable,
  DocPlaceholder,
  Callout,
  Code,
} from '../../components/whitepaper/DocBlocks';

export default function DataSourcesSection() {
  return (
    <article>
      <DocTitle lead="The external public-data APIs the platform draws on, and which tools consume each.">
        External Data Sources
      </DocTitle>

      <DocP>
        The platform deliberately builds on free, public U.S. government and regulatory data. Light
        lookups are called at analysis time (directly from the browser or through the platform's
        Cloudflare Worker proxies); heavyweight datasets (Texas RRC wells, ISO interconnection
        queues, Congress.gov data, deal news) are ingested by backend pipelines and served
        pre-processed from Firestore or Storage.
      </DocP>

      <DocH2 id="by-domain">Sources by analysis domain</DocH2>
      <DocTable
        head={['Domain', 'Sources', 'Notes']}
        rows={[
          [
            'Power',
            'HIFLD-derived cached infrastructure (plants, substations, lines), EIA',
            'Cached in Firestore via the admin ingestion pipeline; EIA for prices/consumption.',
          ],
          [
            'Broadband',
            'FCC Census Block API, FCC BDC (ArcGIS)',
            'County-aware fiber cascade feeding both the section and the Executive Summary.',
          ],
          [
            'Water',
            'FEMA, USGS, NWI wetlands, groundwater, drought, NPDES',
            'Orchestrated by src/lib/waterAnalysis.ts.',
          ],
          [
            'Gas',
            'Pipeline + pricing sources',
            'Demand calculation, lateral cost estimate, LDC assessment (src/lib/gasAnalysis.ts).',
          ],
          ['Transport', 'geo.dot.gov', 'Airports, interstates, ports, railroads.'],
          [
            'Labor',
            'FCC Area API, Census ACS 5-yr, BLS QCEW + OEWS',
            'Census ACS + Geocoder proxied through the Cloudflare Worker (CORS + server-side key). Optional VITE_BLS_API_KEY raises the BLS quota 25 → 500 req/day.',
          ],
          [
            'Political Radar',
            'Congress.gov, Federal Register, TIGERweb',
            'Bills + officials ingested server-side by Cloud Functions — no Congress.gov key in the browser bundle.',
          ],
          [
            'Interconnection queues',
            'All 7 ISO queues (PJM, MISO, ERCOT, SPP, CAISO, NYISO, ISO-NE)',
            'Weekly Python pipeline matches projects to HIFLD substations and writes Firestore aggregates.',
          ],
          [
            'Market Intelligence',
            'GDELT DOC 2.0, trade-press RSS, Google News RSS',
            'Keyless sources, two-stage keyword filter, 6-hourly Cloud Function ingest.',
          ],
          [
            'Wells',
            'Texas RRC (ArcGIS layer + bulk downloads)',
            'Monthly pipeline builds wells.pmtiles; dev falls back to the live paginated layer.',
          ],
        ]}
      />

      <DocH2 id="key-handling">API-key handling</DocH2>
      <DocP>
        The pattern that has emerged: <strong>keys stay server-side.</strong> The Census key is
        injected by the Cloudflare Worker proxy, the Congress.gov key lives in Cloud Functions, and
        Market Intelligence uses only keyless sources. The optional <Code>VITE_BLS_API_KEY</Code> is
        the remaining browser-bundled key (free tier, quota-raising only).
      </DocP>
      <Callout>
        Firebase web config in the bundle is public by design — the security boundary is Firestore
        rules, not the API key.
      </Callout>

      <DocH2 id="full-inventory">Full per-endpoint inventory</DocH2>
      <DocPlaceholder>
        Endpoint-level inventory — exact URLs, query shapes, rate limits, failure handling, and
        caching behavior per analysis module (including the requestCache TTLs and the
        Firestore-cached infrastructure refresh flow). To be extracted from <Code>src/lib/</Code>.
      </DocPlaceholder>
    </article>
  );
}
