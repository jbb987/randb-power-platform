/**
 * Well Finder — RRC bulk ingestion Cloud Run service.
 *
 * POST /  with optional JSON body:
 *   { sources: ["iwar","orphan", ...] }
 *
 * If `sources` is omitted, all sources are run.
 * Each source's records are merged into Firestore tx-wells-enriched/{api}.
 *
 * Phase 2 implements: iwar, orphan
 * Phase 2.5 will add: wellbore (RRC Wellbore Query), p5 (P-5 Organization)
 */
import express from 'express';
import { ingestIwar } from './parsers/iwar.js';
import { ingestOrphan } from './parsers/orphan.js';
import { upsertEnrichmentMap } from './firestore.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

const SOURCE_REGISTRY = {
  iwar:   { fn: ingestIwar,   label: 'iwar' },
  orphan: { fn: ingestOrphan, label: 'orphan' },
};

app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'well-finder-rrc-bulks',
    sources: Object.keys(SOURCE_REGISTRY),
  });
});

app.post('/', async (req, res) => {
  const requested = Array.isArray(req.body?.sources) && req.body.sources.length > 0
    ? req.body.sources
    : Object.keys(SOURCE_REGISTRY);

  const startedAt = Date.now();
  const results = {};

  for (const name of requested) {
    const entry = SOURCE_REGISTRY[name];
    if (!entry) {
      results[name] = { error: 'unknown source' };
      continue;
    }
    const sourceStarted = Date.now();
    try {
      console.log(`[server] === ingesting ${name} ===`);
      const records = await entry.fn();
      const stats = await upsertEnrichmentMap(records, entry.label);
      results[name] = {
        records: records.size,
        ...stats,
        elapsedSec: Math.round((Date.now() - sourceStarted) / 1000),
      };
      console.log(`[server] ${name} done in ${results[name].elapsedSec}s`);
    } catch (err) {
      console.error(`[server] ${name} FAILED`, err);
      results[name] = {
        error: err instanceof Error ? err.message : 'unknown',
        elapsedSec: Math.round((Date.now() - sourceStarted) / 1000),
      };
    }
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.log(`[server] all done in ${elapsedSec}s`);
  res.status(200).json({ ok: true, elapsedSec, results });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`well-finder-rrc-bulks listening on :${PORT}`);
});
