# Phase 1, Step 4 — Deploy the two Well Finder Cloud Functions.
#
# Builds the TypeScript locally (predeploy hook from firebase.json runs
# `npm --prefix functions run build`), then uploads + deploys to Firebase.

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== Step 4: Deploying Cloud Functions ===" -ForegroundColor Yellow
Write-Host "Functions:" -ForegroundColor Cyan
Write-Host "  - fetchRrcWells       (scheduled monthly)"
Write-Host "  - triggerPmtilesBuild (Storage trigger on wells.geojson.gz)"
Write-Host ""
Write-Host "Expected wallclock: ~2 minutes." -ForegroundColor Cyan
Write-Host ""

firebase deploy --only "functions:fetchRrcWells,functions:triggerPmtilesBuild"

Write-Host ""
Write-Host "=== Step 4 complete (if no errors above). ===" -ForegroundColor Green
Write-Host "Next: run well-finder-step5.ps1 or tell Claude you're ready for Step 5 (CORS + bucket)." -ForegroundColor Green
