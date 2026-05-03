# well-finder-tippecanoe (Cloud Run service)

Converts a gzipped GeoJSON in Firebase Storage into a PMTiles archive in the
same bucket. Invoked by the `triggerPmtilesBuild` Cloud Function whenever the
`fetchRrcWells` scheduled function uploads a new RRC wells snapshot.

## Deploy

From the repo root:

```bash
gcloud run deploy well-finder-tippecanoe \
  --source cloudrun-tippecanoe \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 600 \
  --no-allow-unauthenticated
```

Cloud Build will build the Docker image (compiles tippecanoe from the Felt
fork — first build takes ~5 min) and deploy it.

## IAM wiring

After deploy, grant the **Functions runtime service account** invoker access:

```bash
PROJECT_ID="<your-project-id>"
RUN_SA="$PROJECT_ID@appspot.gserviceaccount.com"   # default Functions runtime SA

gcloud run services add-iam-policy-binding well-finder-tippecanoe \
  --region us-central1 \
  --member="serviceAccount:$RUN_SA" \
  --role="roles/run.invoker"
```

Then store the Cloud Run URL as a secret accessible to Functions:

```bash
RUN_URL=$(gcloud run services describe well-finder-tippecanoe \
  --region us-central1 --format='value(status.url)')

echo -n "$RUN_URL" | gcloud secrets create WELL_FINDER_TIPPECANOE_URL --data-file=-
gcloud secrets add-iam-policy-binding WELL_FINDER_TIPPECANOE_URL \
  --member="serviceAccount:$RUN_SA" \
  --role="roles/secretmanager.secretAccessor"
```

The `triggerPmtilesBuild` function reads the secret at runtime via
`defineSecret('WELL_FINDER_TIPPECANOE_URL')`.

## Test manually

After deploy, you can prime the pipeline by running `fetchRrcWells` once
manually from the Functions console (or by uploading a small GeoJSON to
`well-finder/wells.geojson.gz` in your bucket). The trigger should fire,
the Cloud Run service should produce `wells.pmtiles`, and the frontend
will pick it up via the `VITE_WELL_FINDER_PMTILES_URL` env var.

## Cost

For a 400K-feature input: ~30–60 sec wallclock per run, monthly cadence.
Cloud Run charges only for the seconds the container is processing requests,
so this is cents per month.
