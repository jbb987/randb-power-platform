# Phase 2 ingestion status check.

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== Phase 2 ingestion status ===" -ForegroundColor Yellow
Write-Host ""

Write-Host "[1] Last 30 log lines from well-finder-rrc-bulks Cloud Run:" -ForegroundColor Cyan
gcloud run services logs read well-finder-rrc-bulks --region=us-central1 --limit=30 2>&1
Write-Host ""

Write-Host "[2] Last 10 log lines from triggerRrcBulksIngest Cloud Function:" -ForegroundColor Cyan
gcloud functions logs read triggerRrcBulksIngest --region=us-east1 --gen2 --limit=10 2>&1
Write-Host ""

Write-Host "[3] Firestore tx-wells-enriched document count:" -ForegroundColor Cyan
Write-Host "  Open the console:" -ForegroundColor DarkGray
Write-Host "    https://console.firebase.google.com/project/randb-site-valuator/firestore/databases/-default-/data/~2Ftx-wells-enriched" -ForegroundColor DarkGray
Write-Host ""

Write-Host "=== End of status ===" -ForegroundColor Yellow
