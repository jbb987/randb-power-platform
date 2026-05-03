# Re-tile PMTiles to include all wells (no LOD drop) so the map shows the
# same dot population at all zooms. Doesn't touch the RRC data — just
# reprocesses the existing wells.geojson.gz with the updated tippecanoe args.

$ErrorActionPreference = "Continue"

$BUCKET = "randb-site-valuator.firebasestorage.app"
$GEOJSON_PATH = "well-finder/wells.geojson.gz"

Write-Host ""
Write-Host "=== Re-tile: full-density PMTiles (no LOD drop) ===" -ForegroundColor Yellow
Write-Host ""

# 1. Redeploy the tippecanoe Cloud Run service with the new args
Write-Host "[1] Redeploying well-finder-tippecanoe with updated tippecanoe args..." -ForegroundColor Cyan
gcloud run deploy well-finder-tippecanoe `
  --source cloudrun-tippecanoe `
  --region us-central1 `
  --memory 2Gi `
  --cpu 2 `
  --timeout 600 `
  --no-allow-unauthenticated

# 2. Re-trigger PMTiles build by re-saving wells.geojson.gz to itself.
#    This fires the Storage onObjectFinalize event, which runs
#    triggerPmtilesBuild → Cloud Run tippecanoe.
Write-Host ""
Write-Host "[2] Re-triggering PMTiles generation (rewriting wells.geojson.gz to itself)..." -ForegroundColor Cyan
$tmpLocal = New-TemporaryFile
gcloud storage cp "gs://$BUCKET/$GEOJSON_PATH" "$($tmpLocal.FullName)" --quiet
gcloud storage cp "$($tmpLocal.FullName)" "gs://$BUCKET/$GEOJSON_PATH" --quiet
Remove-Item $tmpLocal.FullName -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Re-tile triggered. ===" -ForegroundColor Green
Write-Host ""
Write-Host "Cloud Run tippecanoe is now regenerating wells.pmtiles with all features at all zooms." -ForegroundColor Cyan
Write-Host "Wallclock: ~3-5 min." -ForegroundColor Cyan
Write-Host ""
Write-Host "Watch Cloud Run logs:" -ForegroundColor Yellow
Write-Host "  https://console.cloud.google.com/run/detail/us-central1/well-finder-tippecanoe/logs?project=randb-site-valuator" -ForegroundColor Yellow
Write-Host ""
Write-Host "When done, hard-refresh /well-finder (Ctrl+Shift+R)." -ForegroundColor Cyan
Write-Host "  - At statewide zoom: red/orange heat blobs over the active basins" -ForegroundColor Cyan
Write-Host "  - Zoom 7-9: heat fades, individual circles fade in" -ForegroundColor Cyan
Write-Host "  - High zoom: every well visible everywhere" -ForegroundColor Cyan
