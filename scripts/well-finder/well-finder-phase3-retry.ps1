# Redeploy well-finder-pdq with the file-order fix and retrigger ingestion.

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== Phase 3 retry: file-order-independent processing ===" -ForegroundColor Yellow
Write-Host ""

Write-Host "[1] Redeploying well-finder-pdq..." -ForegroundColor Cyan
gcloud run deploy well-finder-pdq `
  --source cloudrun-pdq `
  --region us-central1 `
  --memory 8Gi `
  --cpu 4 `
  --timeout 3600 `
  --no-allow-unauthenticated

Write-Host ""
Write-Host "[2] Re-triggering ingestion..." -ForegroundColor Cyan
gcloud scheduler jobs run firebase-schedule-triggerPdqIngest-us-east1 --location=us-east1

Write-Host ""
Write-Host "=== Triggered. Wallclock ~30-45 min. ===" -ForegroundColor Green
Write-Host ""
Write-Host "Tail logs (refresh every few min):" -ForegroundColor Yellow
Write-Host "  gcloud run services logs read well-finder-pdq --region=us-central1 --limit=30" -ForegroundColor Yellow
Write-Host ""
Write-Host "Look for:" -ForegroundColor Cyan
Write-Host "  [server] entry OG_LEASE_CYCLE_DATA_TABLE.dsv ..." -ForegroundColor DarkGray
Write-Host "  [aggregate] 5,000,000 rows, 100,000 leases" -ForegroundColor DarkGray
Write-Host "  [aggregate] done: 100M+ rows" -ForegroundColor DarkGray
Write-Host "  [server] entry OG_WELL_COMPLETION_DATA_TABLE.dsv ..." -ForegroundColor DarkGray
Write-Host "  [completion] indexed N leases" -ForegroundColor DarkGray
Write-Host "  [firestore] wrote N of N" -ForegroundColor DarkGray
Write-Host "  [server] all done in Ns" -ForegroundColor DarkGray
