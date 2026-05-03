# Shortcut — patch the existing wells.pmtiles file in Storage to add a
# firebaseStorageDownloadTokens metadata value, so the frontend can resolve
# it via Firebase SDK getDownloadURL. No pipeline run needed.

$ErrorActionPreference = "Continue"

$BUCKET = "randb-site-valuator.firebasestorage.app"
$OBJECT = "well-finder/wells.pmtiles"

# Generate a stable UUID-ish token (PowerShell built-in)
$token = [guid]::NewGuid().ToString()

Write-Host ""
Write-Host "=== Patching existing wells.pmtiles with download token ===" -ForegroundColor Yellow
Write-Host "Token: $token" -ForegroundColor DarkGray
Write-Host ""

gcloud storage objects update "gs://$BUCKET/$OBJECT" `
  --custom-metadata="firebaseStorageDownloadTokens=$token"

Write-Host ""
Write-Host "=== Done. ===" -ForegroundColor Green
Write-Host ""
Write-Host "Restart the dev server to pick up the new .env path:" -ForegroundColor Cyan
Write-Host "  Ctrl+C in the dev server terminal, then: npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "Then refresh /well-finder. The badge should flip to '● PMTiles'." -ForegroundColor Cyan
