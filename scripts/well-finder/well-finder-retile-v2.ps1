# Re-tile v2 — adds -r1 to tippecanoe args (the missing flag that disables
# default rate-based feature sampling). All ~1.39M wells survive at all zooms.

$ErrorActionPreference = "Continue"

$BUCKET = "randb-site-valuator.firebasestorage.app"
$GEOJSON_PATH = "well-finder/wells.geojson.gz"

Write-Host ""
Write-Host "=== Re-tile v2: -r1 (drop-rate 1, keep every feature) ===" -ForegroundColor Yellow
Write-Host ""

Write-Host "[1] Redeploying tippecanoe with -r1..." -ForegroundColor Cyan
gcloud run deploy well-finder-tippecanoe `
  --source cloudrun-tippecanoe `
  --region us-central1 `
  --memory 4Gi `
  --cpu 2 `
  --timeout 600 `
  --no-allow-unauthenticated

Write-Host ""
Write-Host "[2] Re-triggering PMTiles generation..." -ForegroundColor Cyan
$tmpLocal = New-TemporaryFile
gcloud storage cp "gs://$BUCKET/$GEOJSON_PATH" "$($tmpLocal.FullName)" --quiet
gcloud storage cp "$($tmpLocal.FullName)" "gs://$BUCKET/$GEOJSON_PATH" --quiet
Remove-Item $tmpLocal.FullName -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Re-tile v2 triggered. ===" -ForegroundColor Green
Write-Host ""
Write-Host "  -r1 keeps every feature at every zoom level. The new wells.pmtiles" -ForegroundColor Cyan
Write-Host "  will be MUCH larger (probably 300-500 MB instead of ~45 MB) because" -ForegroundColor Cyan
Write-Host "  all 1.39M wells appear in every zoom level's tiles. Browser still" -ForegroundColor Cyan
Write-Host "  fetches range bytes only for visible tiles, so user-side load is fine." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Wallclock: ~5-10 min (denser tiles take longer to compute)." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Tail logs to confirm:" -ForegroundColor Yellow
Write-Host "    gcloud run services logs read well-finder-tippecanoe --region=us-central1 --limit=20" -ForegroundColor Yellow
Write-Host ""
Write-Host "  When done, hard-refresh /well-finder (Ctrl+Shift+R)." -ForegroundColor Cyan
Write-Host "  At statewide zoom you should see EVERY shut-in dot, not a sample." -ForegroundColor Cyan
