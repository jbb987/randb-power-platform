/**
 * Well Finder — tippecanoe Cloud Run service.
 *
 * POST /  with JSON body:
 *   { bucket: string, sourcePath: string, destPath: string }
 *
 *   Downloads <bucket>/<sourcePath> (gzipped GeoJSON), runs tippecanoe to
 *   produce a PMTiles archive, uploads to <bucket>/<destPath>.
 *
 * Tippecanoe options chosen for ~400K well points across Texas:
 *   -zg          — guess max zoom (typical: 11–13 for points)
 *   --drop-densest-as-needed — keep tile sizes manageable in dense clusters
 *   --extend-zooms-if-still-dropping — push max zoom up if z=12 still drops
 *   -l wells     — source-layer name = "wells" (matches frontend)
 *   --read-parallel — speed up large input
 *
 * Env: GOOGLE_APPLICATION_CREDENTIALS is set automatically by Cloud Run.
 */
import express from 'express';
import { Storage } from '@google-cloud/storage';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';

const app = express();
app.use(express.json({ limit: '10mb' }));

const storage = new Storage();

app.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'well-finder-tippecanoe' });
});

app.post('/', async (req, res) => {
  const { bucket, sourcePath, destPath } = req.body ?? {};
  if (!bucket || !sourcePath || !destPath) {
    res.status(400).json({ error: 'bucket, sourcePath, destPath required' });
    return;
  }

  const startedAt = Date.now();
  const work = await mkdtemp(join(tmpdir(), 'wf-tippecanoe-'));
  const gzPath = join(work, 'wells.geojson.gz');
  const geojsonPath = join(work, 'wells.geojson');
  const pmtilesPath = join(work, 'wells.pmtiles');

  try {
    console.log(`[tippecanoe] downloading gs://${bucket}/${sourcePath}`);
    await storage.bucket(bucket).file(sourcePath).download({ destination: gzPath });

    console.log('[tippecanoe] decompressing');
    await pipeline(
      createReadStream(gzPath),
      createGunzip(),
      createWriteStream(geojsonPath),
    );

    console.log('[tippecanoe] running tippecanoe');
    await runTippecanoe(geojsonPath, pmtilesPath);

    // Set a Firebase Storage download token in metadata so the frontend can
    // fetch the file via the Firebase Storage SDK's getDownloadURL.
    // Without this, the file is uploaded via the GCS SDK and lacks the
    // firebaseStorageDownloadTokens metadata that getDownloadURL requires.
    const downloadToken = randomUUID();
    console.log(`[tippecanoe] uploading gs://${bucket}/${destPath} (token=${downloadToken.slice(0, 8)}…)`);
    await storage.bucket(bucket).upload(pmtilesPath, {
      destination: destPath,
      metadata: {
        contentType: 'application/vnd.pmtiles',
        cacheControl: 'public, max-age=86400',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[tippecanoe] done in ${elapsedSec}s`);
    res.status(200).json({ ok: true, elapsedSec, destPath });
  } catch (err) {
    console.error('[tippecanoe] error', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'unknown' });
  } finally {
    rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
});

function runTippecanoe(input, output) {
  return new Promise((resolve, reject) => {
    // Keep ALL ~1.39M wells at every zoom (no LOD dropping) so the map
    // shows the same dot population statewide as it does zoomed-in.
    //
    // Critical flags:
    //   -r1                      drop-rate=1 → don't sample-drop features at low zoom
    //                            (default is 2.5, which silently drops ~40%/zoom step)
    //   --no-feature-limit       don't drop because of per-tile feature count
    //   --no-tile-size-limit     allow tiles to grow as large as needed
    const args = [
      '-o', output,
      '-Z3', '-z11',
      '-B3',                               // base-zoom = minzoom — disables below-base drop math entirely
      '-r1',                               // drop-rate 1 — keep every point at every zoom (no sampling)
      '-g0',                               // gamma 0 — don't drop features within sub-pixel of each other
      '--no-feature-limit',                // remove 200K-features-per-tile cap
      '--no-tile-size-limit',              // remove 500KB-per-tile cap
      '-l', 'wells',
      '--read-parallel',
      '--force',
      input,
    ];
    const child = spawn('tippecanoe', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tippecanoe exited with ${code}`));
    });
  });
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`well-finder-tippecanoe listening on :${PORT}`);
});
