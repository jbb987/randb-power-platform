/**
 * Well Finder — PDQ ingestion Cloud Run service.
 *
 * POST / starts a full ingest. Streams the 3.4 GB ZIP from RRC MFT, extracts
 * OG_WELL_COMPLETION_DATA_TABLE.dsv (well→lease index) and
 * OG_LEASE_CYCLE_DATA_TABLE.dsv (monthly volumes), aggregates per lease,
 * fits Arps decline curves, allocates to wells, writes rollups to Firestore
 * and per-lease time series JSON to Cloud Storage.
 *
 * Wallclock target: ~30-45 min per run. Memory peak: ~4-5 GB.
 */
import express from 'express';
import unzipper from 'unzipper';
import { Readable } from 'node:stream';
import { startPdqDownload } from './download.js';
import { loadCompletionMap } from './completion.js';
import { aggregateLeaseCycles } from './aggregate.js';
import { computeLeaseRollup, allocateToWells } from './rollups.js';
import { writeProductionRollups } from './firestore.js';
import { writeLeaseTimeSeries } from './storage.js';
import { loadTargetSets } from './targets.js';
import { backfillScores } from './scoreBackfill.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

const FILES_OF_INTEREST = [
  'OG_WELL_COMPLETION_DATA_TABLE.dsv',
  'OG_LEASE_CYCLE_DATA_TABLE.dsv',
];

app.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'well-finder-pdq' });
});

/** Standalone score backfill — walk tx-wells-enriched and write score fields. */
app.post('/backfill-scores', async (_req, res) => {
  try {
    const result = await backfillScores();
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[server] backfill-scores FAILED', err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
});

app.post('/', async (req, res) => {
  const startedAt = Date.now();
  const opts = req.body ?? {};
  const skipTimeSeries = opts.skipTimeSeries === true;
  const maxLeases = Number.isFinite(opts.maxLeases) ? Number(opts.maxLeases) : 0;

  try {
    console.log('[server] starting full PDQ ingest');

    // Step 0: load the target API + lease-key sets from Firestore. We use
    // these to FILTER the 100M-row PDQ lease cycle stream at parse time
    // (without filtering, in-memory aggregation OOMs around 7 GB heap).
    const ignoreTargets = opts.ignoreTargets === true;
    const targets = ignoreTargets ? null : await loadTargetSets();
    if (targets && targets.apis.size === 0) {
      throw new Error('Target API set is empty — has Phase 2 (IWAR/Orphan) been run?');
    }
    const targetApis = targets?.apis ?? null;
    const targetLeaseKeys = targets?.leaseKeys ?? null;

    // Step 1: download ZIP stream
    const { stream, contentLength } = await startPdqDownload();
    const nodeStream = stream instanceof Readable
      ? stream
      : Readable.fromWeb(stream);

    // Step 2: stream the ZIP, processing each file we care about as it
    // arrives. The ZIP emits files alphabetically, so OG_LEASE_CYCLE
    // (12.7 GB) comes before OG_WELL_COMPLETION (58 MB) — but the
    // completion map and the lease aggregator are independent, so we
    // just process whichever comes first and do the join after both
    // are done. unzipper.Parse requires us to consume each entry stream
    // before the next entry can be read, so awaiting in-loop is correct.
    let completion = null;
    let leaseCycles = null;
    let zipEntries = 0;

    const zipStream = nodeStream.pipe(unzipper.Parse({ forceStream: true }));
    for await (const entry of zipStream) {
      const fileName = entry.path;
      zipEntries++;
      if (!FILES_OF_INTEREST.includes(fileName)) {
        entry.autodrain();
        continue;
      }
      console.log(`[server] entry ${fileName} (${entry.vars.uncompressedSize?.toLocaleString?.() ?? '?'} bytes uncompressed)`);
      if (fileName === 'OG_WELL_COMPLETION_DATA_TABLE.dsv') {
        completion = await loadCompletionMap(entry);
      } else if (fileName === 'OG_LEASE_CYCLE_DATA_TABLE.dsv') {
        leaseCycles = await aggregateLeaseCycles(entry, targetLeaseKeys);
      } else {
        entry.autodrain();
      }
    }
    console.log(`[server] processed ${zipEntries} zip entries`);

    if (!completion) {
      throw new Error('OG_WELL_COMPLETION_DATA_TABLE.dsv not found in ZIP');
    }
    if (!leaseCycles) {
      throw new Error('OG_LEASE_CYCLE_DATA_TABLE.dsv not found in ZIP');
    }

    // Step 3: per-lease rollup + allocate to wells + accumulate Firestore writes
    console.log('[server] computing rollups, allocating, writing…');
    const wellRecords = new Map();
    const tsWritePromises = [];
    let leasesProcessed = 0;
    let leasesWithoutWells = 0;
    let nullRollups = 0;

    for (const [leaseKey, months] of leaseCycles) {
      if (maxLeases && leasesProcessed >= maxLeases) break;
      leasesProcessed++;

      const wells = completion.get(leaseKey);
      if (!wells || wells.length === 0) {
        leasesWithoutWells++;
        continue;
      }

      const rollup = computeLeaseRollup(leaseKey, months);
      if (!rollup) {
        nullRollups++;
        continue;
      }

      const allocations = allocateToWells(rollup, wells);
      let leaseHasTarget = false;
      for (const a of allocations) {
        // If we have a target set, filter — only write rollups for wells we care about.
        if (targetApis && !targetApis.has(a.api)) continue;
        leaseHasTarget = true;
        wellRecords.set(a.api, a.record);
      }

      // Time series JSON: only for leases that contributed at least one
      // target well (no point storing time series for leases we won't surface).
      if (!skipTimeSeries && (targetApis ? leaseHasTarget : true)) {
        tsWritePromises.push(writeLeaseTimeSeries(leaseKey, months));
        if (tsWritePromises.length >= 100) {
          await Promise.allSettled(tsWritePromises.splice(0));
        }
      }

      if (leasesProcessed % 50_000 === 0) {
        console.log(`[server] processed ${leasesProcessed.toLocaleString()} leases, queued ${wellRecords.size.toLocaleString()} well records`);
      }
    }
    if (tsWritePromises.length > 0) {
      await Promise.allSettled(tsWritePromises);
    }
    console.log(`[server] done aggregating: ${leasesProcessed.toLocaleString()} leases, ${wellRecords.size.toLocaleString()} wells, ${leasesWithoutWells} leases with no completion match, ${nullRollups} null rollups`);

    // Step 4: write Firestore rollups
    const fsResult = await writeProductionRollups(wellRecords);

    // Step 5: compute and persist reactivation scores across the whole
    // collection (covers wells written in this run + any pre-existing
    // IWAR/Orphan-only docs that didn't get production data).
    const scoreResult = await backfillScores();

    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[server] all done in ${elapsedSec}s; ${fsResult.written.toLocaleString()} production wells, ${scoreResult.written.toLocaleString()} scores written`);
    res.status(200).json({
      ok: true,
      elapsedSec,
      contentLength,
      leasesProcessed,
      wellsWritten: fsResult.written,
      scoreResult,
      targetApiCount: targetApis ? targetApis.size : 'unfiltered',
      timeSeriesWritten: skipTimeSeries ? 0 : leasesProcessed - leasesWithoutWells - nullRollups,
    });
  } catch (err) {
    console.error('[server] FAILED', err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'unknown',
      stack: err instanceof Error ? err.stack : undefined,
      elapsedSec: Math.round((Date.now() - startedAt) / 1000),
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`well-finder-pdq listening on :${PORT}`);
});
