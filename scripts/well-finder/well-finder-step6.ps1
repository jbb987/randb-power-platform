# Phase 1, Step 6 — Manually trigger the first RRC ingestion run.
#
# Pipeline that fires from this:
#   1. fetchRrcWells (5-15 min)        — pulls ~1.4M wells from RRC, gzipped GeoJSON
#                                        uploaded to gs://...firebasestorage.app/well-finder/wells.geojson.gz
#   2. triggerPmtilesBuild (instant)    — Storage trigger fires, POSTs to Cloud Run
#   3. well-finder-tippecanoe (~3 min)  — runs tippecanoe, writes wells.pmtiles back to Storage
#
# Total wallclock: ~10-20 min.

$ErrorActionPreference = "Continue"

$JOB_NAME = "firebase-schedule-fetchRrcWells-us-east1"
$REGION = "us-east1"

Write-Host ""
Write-Host "=== Step 6: Manually triggering the monthly RRC ingestion ===" -ForegroundColor Yellow
Write-Host ""
Write-Host "About to run Cloud Scheduler job:" -ForegroundColor Cyan
Write-Host "  Job   : $JOB_NAME"
Write-Host "  Region: $REGION"
Write-Host ""

gcloud scheduler jobs run $JOB_NAME --location=$REGION

Write-Host ""
Write-Host "=== Job kicked off! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Monitor progress (open in browser or run gcloud commands):" -ForegroundColor Cyan
Write-Host ""
Write-Host "  fetchRrcWells logs:" -ForegroundColor Yellow
Write-Host "    https://console.cloud.google.com/functions/details/us-east1/fetchRrcWells?project=randb-site-valuator&tab=logs"
Write-Host ""
Write-Host "  triggerPmtilesBuild logs:" -ForegroundColor Yellow
Write-Host "    https://console.cloud.google.com/functions/details/us-east1/triggerPmtilesBuild?project=randb-site-valuator&tab=logs"
Write-Host ""
Write-Host "  Cloud Run tippecanoe logs:" -ForegroundColor Yellow
Write-Host "    https://console.cloud.google.com/run/detail/us-central1/well-finder-tippecanoe/logs?project=randb-site-valuator"
Write-Host ""
Write-Host "  Storage bucket (watch for wells.geojson.gz then wells.pmtiles):" -ForegroundColor Yellow
Write-Host "    https://console.cloud.google.com/storage/browser/randb-site-valuator.firebasestorage.app/well-finder?project=randb-site-valuator"
Write-Host ""
Write-Host "Expected wallclock: 10-20 min total." -ForegroundColor Cyan
Write-Host "When wells.pmtiles appears in the bucket, run .\well-finder-step7.ps1 to make it publicly readable + set the env var." -ForegroundColor Cyan
