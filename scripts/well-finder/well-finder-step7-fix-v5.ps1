# Step 7 fix v5 — pivot to Firebase Storage SDK download URLs.
#
# Org policy enforces UBLA + blocks public access. Instead of public ACLs we
# attach a firebaseStorageDownloadTokens metadata at upload time so the
# frontend (admin-authenticated via Firebase) can call getDownloadURL() to
# get a token-bearing URL that supports HTTP range requests.

$ErrorActionPreference = "Continue"

$BUCKET = "randb-site-valuator.firebasestorage.app"
$PMTILES_PATH = "well-finder/wells.pmtiles"

Write-Host ""
Write-Host "=== Step 7 fix v5: Firebase SDK download URLs ===" -ForegroundColor Yellow
Write-Host ""

# 1. Update .env to use the storage path instead of a public URL.
$envFile = "$pwd\.env"
$envLine = "VITE_WELL_FINDER_PMTILES_URL=$PMTILES_PATH"

Write-Host "[1] Updating .env so VITE_WELL_FINDER_PMTILES_URL holds the storage path..." -ForegroundColor Cyan
if (Test-Path $envFile) {
  $envContent = Get-Content $envFile -Raw
  if ($envContent -match '(?m)^VITE_WELL_FINDER_PMTILES_URL=') {
    $newContent = $envContent -replace '(?m)^VITE_WELL_FINDER_PMTILES_URL=.*$', $envLine
    [System.IO.File]::WriteAllText($envFile, $newContent)
  } else {
    $separator = if ($envContent.EndsWith("`n")) { '' } else { "`n" }
    [System.IO.File]::AppendAllText($envFile, "$separator$envLine`n")
  }
  Write-Host "  Set VITE_WELL_FINDER_PMTILES_URL=$PMTILES_PATH" -ForegroundColor Green
} else {
  Write-Host "  .env not found at $envFile — create one." -ForegroundColor Red
  exit 1
}

# 2. Redeploy the Cloud Run tippecanoe service (now sets download token metadata).
Write-Host ""
Write-Host "[2] Redeploying Cloud Run tippecanoe service (~1-2 min, mostly cached)..." -ForegroundColor Cyan
gcloud run deploy well-finder-tippecanoe `
  --source cloudrun-tippecanoe `
  --region us-central1 `
  --memory 2Gi `
  --cpu 2 `
  --timeout 600 `
  --no-allow-unauthenticated

# 3. Re-trigger the ingestion so wells.pmtiles gets a new upload with the token.
Write-Host ""
Write-Host "[3] Re-triggering fetchRrcWells (so wells.pmtiles gets uploaded with the download token)..." -ForegroundColor Cyan
gcloud scheduler jobs run firebase-schedule-fetchRrcWells-us-east1 --location=us-east1

Write-Host ""
Write-Host "=== Done. ===" -ForegroundColor Green
Write-Host ""
Write-Host "  fetchRrcWells will run for ~15 min, then triggerPmtilesBuild fires," -ForegroundColor Cyan
Write-Host "  Cloud Run regenerates wells.pmtiles WITH the firebaseStorageDownloadTokens" -ForegroundColor Cyan
Write-Host "  metadata. Watch with:  .\well-finder-status.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "  When wells.pmtiles is back, restart the dev server (Ctrl+C, npm run dev)." -ForegroundColor Cyan
Write-Host "  The frontend will call getDownloadURL via Firebase SDK and the badge will" -ForegroundColor Cyan
Write-Host "  flip to '● PMTiles'." -ForegroundColor Cyan
