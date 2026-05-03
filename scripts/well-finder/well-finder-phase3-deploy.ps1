# Phase 3 deploy — PDQ ingestion (production data) Cloud Run service +
# scheduled Cloud Function trigger.
#
# Architecture mirrors Phase 2:
#   1. Cloud Run service well-finder-pdq (8 GiB, 60-min timeout)
#   2. Functions runtime SA gets invoker role on the service
#   3. Service URL stored in Secret Manager as WELL_FINDER_PDQ_URL
#   4. Scheduled function triggerPdqIngest deployed (monthly cron, 13th @ 12:00 UTC)
#   5. Trigger one ingestion run manually to populate Firestore now

$ErrorActionPreference = "Continue"

$PROJECT_NUMBER = "882533648595"
$RUN_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

Write-Host ""
Write-Host "=== Phase 3 deploy: PDQ production ingestion ===" -ForegroundColor Yellow
Write-Host ""

# ── 1. Deploy Cloud Run service ──────────────────────────────────────────────
Write-Host "[1] Deploying well-finder-pdq Cloud Run service (~3 min first build)..." -ForegroundColor Cyan
gcloud run deploy well-finder-pdq `
  --source cloudrun-pdq `
  --region us-central1 `
  --memory 8Gi `
  --cpu 4 `
  --timeout 3600 `
  --no-allow-unauthenticated

# ── 2. IAM ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[2] Granting Functions SA invoker access..." -ForegroundColor Cyan
gcloud run services add-iam-policy-binding well-finder-pdq `
  --region us-central1 `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/run.invoker"

# ── 3. Secret with the Cloud Run URL ────────────────────────────────────────
Write-Host ""
Write-Host "[3] Storing Cloud Run URL in Secret Manager..." -ForegroundColor Cyan
$RUN_URL = gcloud run services describe well-finder-pdq `
  --region us-central1 --format='value(status.url)'
Write-Host "    URL: $RUN_URL" -ForegroundColor DarkGray

$tmp = New-TemporaryFile
[System.IO.File]::WriteAllText($tmp.FullName, $RUN_URL)
gcloud secrets create WELL_FINDER_PDQ_URL --data-file=$($tmp.FullName) --replication-policy=automatic
Remove-Item $tmp.FullName -ErrorAction SilentlyContinue

gcloud secrets add-iam-policy-binding WELL_FINDER_PDQ_URL `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/secretmanager.secretAccessor"

# ── 4. Deploy the scheduled Cloud Function ──────────────────────────────────
Write-Host ""
Write-Host "[4] Deploying triggerPdqIngest scheduled function..." -ForegroundColor Cyan
firebase deploy --only "functions:triggerPdqIngest"

# ── 5. Trigger one ingestion run manually ───────────────────────────────────
Write-Host ""
Write-Host "[5] Triggering first ingestion via the scheduler job..." -ForegroundColor Cyan
gcloud scheduler jobs run firebase-schedule-triggerPdqIngest-us-east1 --location=us-east1

Write-Host ""
Write-Host "=== Phase 3 deploy done. ===" -ForegroundColor Green
Write-Host ""
Write-Host "  The ingestion is running NOW. Wallclock ~30-45 min." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Watch logs:" -ForegroundColor Yellow
Write-Host "    https://console.cloud.google.com/run/detail/us-central1/well-finder-pdq/logs?project=randb-site-valuator" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Watch Firestore:" -ForegroundColor Yellow
Write-Host "    https://console.firebase.google.com/project/randb-site-valuator/firestore/databases/-default-/data/~2Ftx-wells-enriched" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Watch the time series JSON files in Storage:" -ForegroundColor Yellow
Write-Host "    https://console.cloud.google.com/storage/browser/randb-site-valuator.firebasestorage.app/well-finder/production?project=randb-site-valuator" -ForegroundColor Yellow
Write-Host ""
Write-Host "  When [server] all done appears in Cloud Run logs, refresh /well-finder" -ForegroundColor Cyan
Write-Host "  and click any well that has production history. The popup will show:" -ForegroundColor Cyan
Write-Host "    - Active period (first → last YYYY-MM)" -ForegroundColor Cyan
Write-Host "    - Lifetime cum oil/gas" -ForegroundColor Cyan
Write-Host "    - Last 12-mo rate (bbl/d or mcf/d)" -ForegroundColor Cyan
Write-Host "    - IP rate" -ForegroundColor Cyan
Write-Host "    - Arps EUR estimate" -ForegroundColor Cyan
