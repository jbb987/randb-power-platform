# Re-tile v3 — defensive flag set per all three review agents.
#   -B3   base-zoom = minzoom (disables below-base drop math entirely)
#   -r1   drop-rate 1 (no sampling)
#   -g0   gamma 0 (no sub-pixel feature dropping)
#   --no-feature-limit + --no-tile-size-limit
#
# Frontend was also updated separately to use a 2.5+ px circle radius floor
# (sub-pixel rendering collapse was the other half of the bug).

$ErrorActionPreference = "Continue"

$BUCKET = "randb-site-valuator.firebasestorage.app"
$GEOJSON_PATH = "well-finder/wells.geojson.gz"

Write-Host ""
Write-Host "=== Re-tile v3: full defensive flag set ===" -ForegroundColor Yellow
Write-Host ""

Write-Host "[1] Redeploying tippecanoe with -B3 -r1 -g0..." -ForegroundColor Cyan
gcloud run deploy well-finder-tippecanoe `
  --source cloudrun-tippecanoe `
  --region us-central1 `
  --memory 4Gi `
  --cpu 2 `
  --timeout 600 `
  --no-allow-unauthenticated

Write-Host ""
Write-Host "[2] Re-triggering PMTiles regeneration..." -ForegroundColor Cyan
$tmpLocal = New-TemporaryFile
gcloud storage cp "gs://$BUCKET/$GEOJSON_PATH" "$($tmpLocal.FullName)" --quiet
gcloud storage cp "$($tmpLocal.FullName)" "gs://$BUCKET/$GEOJSON_PATH" --quiet
Remove-Item $tmpLocal.FullName -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Triggered. Wallclock ~5-10 min. ===" -ForegroundColor Green
Write-Host ""
Write-Host "While waiting, hard-refresh /well-finder once and open DevTools console." -ForegroundColor Cyan
Write-Host "You'll see lines like:" -ForegroundColor Cyan
Write-Host "  [well-finder] source features in viewport: 8044, rendered: 7912 @ zoom 5.2" -ForegroundColor DarkGray
Write-Host ""
Write-Host "If 'source features' is high (>1000) but 'rendered' is low (~100):" -ForegroundColor Cyan
Write-Host "  → bug is the radius/opacity (already fixed in this commit)." -ForegroundColor Cyan
Write-Host ""
Write-Host "If 'source features' is also low (~100):" -ForegroundColor Cyan
Write-Host "  → tippecanoe IS still dropping. Re-run this script after a few minutes" -ForegroundColor Cyan
Write-Host "    to ensure new tile build has overwritten the old wells.pmtiles." -ForegroundColor Cyan
Write-Host ""
Write-Host "Tail Cloud Run logs to verify tippecanoe ran with new args:" -ForegroundColor Yellow
Write-Host "  gcloud run services logs read well-finder-tippecanoe --region=us-central1 --limit=30" -ForegroundColor Yellow
