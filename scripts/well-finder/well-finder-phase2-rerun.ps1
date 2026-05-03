# Re-run the RRC bulk ingestion via the scheduler (the path that has the
# right IAM). Runs all sources — IWAR is idempotent so the re-run is fine.

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== Re-running RRC bulk ingestion via scheduler ===" -ForegroundColor Yellow
Write-Host ""

gcloud scheduler jobs run firebase-schedule-triggerRrcBulksIngest-us-east1 --location=us-east1

Write-Host ""
Write-Host "Triggered. Wallclock ~10 min (IWAR ~7 min + Orphan ~1-2 min)." -ForegroundColor Cyan
Write-Host "Tail with: .\well-finder-phase2-status.ps1" -ForegroundColor Cyan
