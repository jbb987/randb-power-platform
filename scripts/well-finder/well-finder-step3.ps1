# Phase 1, Step 3 — IAM + Secret Manager wiring for Well Finder.
#
# Idempotent: safe to re-run if a step fails. The "AlreadyExists" / "already
# bound" errors are caught and treated as success.

$ErrorActionPreference = "Continue"

$PROJECT_NUMBER = "882533648595"
$RUN_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
$RUN_URL = "https://well-finder-tippecanoe-$PROJECT_NUMBER.us-central1.run.app"

Write-Host ""
Write-Host "Project number : $PROJECT_NUMBER" -ForegroundColor Cyan
Write-Host "Functions SA   : $RUN_SA"          -ForegroundColor Cyan
Write-Host "Cloud Run URL  : $RUN_URL"          -ForegroundColor Cyan
Write-Host ""

Write-Host "=== 3a. Granting Functions SA invoker on Cloud Run service ===" -ForegroundColor Yellow
gcloud run services add-iam-policy-binding well-finder-tippecanoe `
  --region us-central1 `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/run.invoker"

Write-Host ""
Write-Host "=== 3b. Creating Secret Manager secret WELL_FINDER_TIPPECANOE_URL ===" -ForegroundColor Yellow
$tmp = New-TemporaryFile
[System.IO.File]::WriteAllText($tmp.FullName, $RUN_URL)
gcloud secrets create WELL_FINDER_TIPPECANOE_URL --data-file=$($tmp.FullName) --replication-policy=automatic
Remove-Item $tmp.FullName -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== 3c. Granting Functions SA accessor on the secret ===" -ForegroundColor Yellow
gcloud secrets add-iam-policy-binding WELL_FINDER_TIPPECANOE_URL `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/secretmanager.secretAccessor"

Write-Host ""
Write-Host "=== Step 3 complete. ===" -ForegroundColor Green
Write-Host "Next: run well-finder-step4.ps1 (or tell Claude you're ready for Step 4)." -ForegroundColor Green
