# Redeploy fetchRrcWells with 2 GiB memory and re-trigger.

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== Step 6 fix #2: bump fetchRrcWells memory to 2 GiB ===" -ForegroundColor Yellow
Write-Host ""

Write-Host "Redeploying fetchRrcWells (memory 1 GiB -> 2 GiB)..." -ForegroundColor Cyan
firebase deploy --only "functions:fetchRrcWells"

Write-Host ""
Write-Host "Re-triggering the scheduler job..." -ForegroundColor Cyan
gcloud scheduler jobs run firebase-schedule-fetchRrcWells-us-east1 --location=us-east1

Write-Host ""
Write-Host "=== Re-triggered. ===" -ForegroundColor Green
Write-Host ""
Write-Host "Wait ~15 min, then run .\well-finder-status.ps1." -ForegroundColor Cyan
