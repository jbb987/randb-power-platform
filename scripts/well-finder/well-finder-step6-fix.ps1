# Redeploy fetchRrcWells with two fixes (page cap bumped to 1500,
# Content-Encoding metadata removed) and re-trigger the ingestion.

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== Step 6 fix: Redeploy + re-trigger fetchRrcWells ===" -ForegroundColor Yellow
Write-Host ""
Write-Host "Fix 1: maxPages 600 -> 1500 (covers RRC's full ~1.4M wells)" -ForegroundColor Cyan
Write-Host "Fix 2: drop Content-Encoding: gzip metadata (was triggering GCS auto-transcoding)" -ForegroundColor Cyan
Write-Host ""

Write-Host "Redeploying fetchRrcWells..." -ForegroundColor Yellow
firebase deploy --only "functions:fetchRrcWells"

Write-Host ""
Write-Host "Re-triggering the scheduler job..." -ForegroundColor Yellow
gcloud scheduler jobs run firebase-schedule-fetchRrcWells-us-east1 --location=us-east1

Write-Host ""
Write-Host "=== Re-triggered. ===" -ForegroundColor Green
Write-Host ""
Write-Host "Expected wallclock: 10-15 min for fetchRrcWells, then ~2-3 min for tippecanoe." -ForegroundColor Cyan
Write-Host "Run .\well-finder-status.ps1 in 15 min to check, then .\well-finder-step7.ps1." -ForegroundColor Cyan
