# Phase 2 deploy script — RRC bulk ingestion (Enrichment ETL).
#
# 1. Deploy the well-finder-rrc-bulks Cloud Run service (~3 min first build)
# 2. Grant Functions runtime SA invoker access on the new service
# 3. Store its URL in Secret Manager (WELL_FINDER_RRC_BULKS_URL)
# 4. Deploy the new Cloud Functions (triggerRrcBulksIngest + runRrcBulksIngestNow)
# 5. Manually trigger one ingestion run

$ErrorActionPreference = "Continue"

$PROJECT_NUMBER = "882533648595"
$RUN_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

Write-Host ""
Write-Host "=== Phase 2 deploy: RRC bulk ingestion ===" -ForegroundColor Yellow
Write-Host ""

# ── 1. Deploy Cloud Run service ──────────────────────────────────────────────
Write-Host "[1] Deploying well-finder-rrc-bulks Cloud Run service (~3 min first build)..." -ForegroundColor Cyan
gcloud run deploy well-finder-rrc-bulks `
  --source cloudrun-rrc-bulks `
  --region us-central1 `
  --memory 4Gi `
  --cpu 2 `
  --timeout 1800 `
  --no-allow-unauthenticated

# ── 2. IAM ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[2] Granting Functions SA invoker access..." -ForegroundColor Cyan
gcloud run services add-iam-policy-binding well-finder-rrc-bulks `
  --region us-central1 `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/run.invoker"

# ── 3. Secret with the Cloud Run URL ────────────────────────────────────────
Write-Host ""
Write-Host "[3] Storing Cloud Run URL in Secret Manager..." -ForegroundColor Cyan
$RUN_URL = gcloud run services describe well-finder-rrc-bulks `
  --region us-central1 --format='value(status.url)'
Write-Host "    URL: $RUN_URL" -ForegroundColor DarkGray

$tmp = New-TemporaryFile
[System.IO.File]::WriteAllText($tmp.FullName, $RUN_URL)
gcloud secrets create WELL_FINDER_RRC_BULKS_URL --data-file=$($tmp.FullName) --replication-policy=automatic
Remove-Item $tmp.FullName -ErrorAction SilentlyContinue

gcloud secrets add-iam-policy-binding WELL_FINDER_RRC_BULKS_URL `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/secretmanager.secretAccessor"

# ── 4. Deploy the new Cloud Functions ───────────────────────────────────────
Write-Host ""
Write-Host "[4] Deploying triggerRrcBulksIngest + runRrcBulksIngestNow..." -ForegroundColor Cyan
firebase deploy --only "functions:triggerRrcBulksIngest,functions:runRrcBulksIngestNow"

# ── 5. Trigger one ingestion run manually ───────────────────────────────────
Write-Host ""
Write-Host "[5] Triggering first ingestion run via the scheduler job..." -ForegroundColor Cyan
gcloud scheduler jobs run firebase-schedule-triggerRrcBulksIngest-us-east1 --location=us-east1

Write-Host ""
Write-Host "=== Phase 2 deploy done. ===" -ForegroundColor Green
Write-Host ""
Write-Host "  The ingestion is running NOW. It will:" -ForegroundColor Cyan
Write-Host "    - Scrape IWAR landing page, fetch the .txt, parse, write Firestore" -ForegroundColor Cyan
Write-Host "    - Scrape Orphan Wells, fetch ZIP, extract xlsx, parse, write Firestore" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Expected wallclock: ~5-10 min for IWAR, ~2 min for Orphan." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Watch logs:" -ForegroundColor Yellow
Write-Host "    https://console.cloud.google.com/run/detail/us-central1/well-finder-rrc-bulks/logs?project=randb-site-valuator" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Watch Firestore docs:" -ForegroundColor Yellow
Write-Host "    https://console.firebase.google.com/project/randb-site-valuator/firestore/databases/-default-/data/tx-wells-enriched" -ForegroundColor Yellow
Write-Host ""
Write-Host "  *** REQUIRED: add Firestore rule for the new collection ***" -ForegroundColor Magenta
Write-Host "  Open https://console.firebase.google.com/project/randb-site-valuator/firestore/databases/-default-/rules" -ForegroundColor Magenta
Write-Host "  and add this match block (admin-only read):" -ForegroundColor Magenta
Write-Host ""
Write-Host "    match /tx-wells-enriched/{api} {" -ForegroundColor Magenta
Write-Host "      allow read: if request.auth != null &&" -ForegroundColor Magenta
Write-Host "                     get(/databases/`$(database)/documents/users/`$(request.auth.uid)).data.role == 'admin';" -ForegroundColor Magenta
Write-Host "    }" -ForegroundColor Magenta
Write-Host "" -ForegroundColor Magenta
Write-Host "  (Same pattern as your existing Storage rules userRole() helper)" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Once the rule is published, refresh /well-finder and click any well." -ForegroundColor Cyan
Write-Host "  Shut-in wells should show operator, depth, completion date, etc." -ForegroundColor Cyan
