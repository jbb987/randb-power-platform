# Check the state of the Well Finder pipeline.
# Tells you which stage is done, in-progress, or failed.

$ErrorActionPreference = "Continue"

$BUCKET = "randb-site-valuator.firebasestorage.app"

Write-Host ""
Write-Host "=== Well Finder pipeline status ===" -ForegroundColor Yellow
Write-Host ""

Write-Host "[1] Files in gs://$BUCKET/well-finder/ :" -ForegroundColor Cyan
gcloud storage ls "gs://$BUCKET/well-finder/" --long 2>&1
Write-Host ""

Write-Host "[2] Last 20 log lines from fetchRrcWells:" -ForegroundColor Cyan
gcloud functions logs read fetchRrcWells --region=us-east1 --gen2 --limit=20 2>&1
Write-Host ""

Write-Host "[3] Last 20 log lines from triggerPmtilesBuild:" -ForegroundColor Cyan
gcloud functions logs read triggerPmtilesBuild --region=us-east1 --gen2 --limit=20 2>&1
Write-Host ""

Write-Host "[4] Last 20 log lines from well-finder-tippecanoe Cloud Run:" -ForegroundColor Cyan
gcloud run services logs read well-finder-tippecanoe --region=us-central1 --limit=20 2>&1
Write-Host ""

Write-Host "=== End of status ===" -ForegroundColor Yellow
