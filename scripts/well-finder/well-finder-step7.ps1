# Phase 1, Step 7 — Make wells.pmtiles publicly readable + set the Vite env var.
#
# Run this AFTER wells.pmtiles appears in the bucket
# (check via the Storage console URL printed by step 6).

$ErrorActionPreference = "Continue"

$BUCKET = "randb-site-valuator.firebasestorage.app"
$OBJECT = "well-finder/wells.pmtiles"
$PUBLIC_URL = "https://storage.googleapis.com/$BUCKET/$OBJECT"

Write-Host ""
Write-Host "=== Step 7: Make wells.pmtiles public + wire env var ===" -ForegroundColor Yellow
Write-Host ""

# 1. Verify the file exists
Write-Host "Checking that wells.pmtiles exists..." -ForegroundColor Cyan
$exists = gcloud storage objects describe "gs://$BUCKET/$OBJECT" --format='value(name)' 2>$null
if (-not $exists) {
  Write-Host ""
  Write-Host "ERROR: gs://$BUCKET/$OBJECT does not exist yet." -ForegroundColor Red
  Write-Host "The pipeline may still be running. Check the logs:" -ForegroundColor Red
  Write-Host "  https://console.cloud.google.com/storage/browser/$BUCKET/well-finder?project=randb-site-valuator" -ForegroundColor Red
  Write-Host "Re-run this script when wells.pmtiles has appeared." -ForegroundColor Red
  exit 1
}
Write-Host "  Found: $exists" -ForegroundColor Green
Write-Host ""

# 2. Grant public read on the object
Write-Host "Granting public read access..." -ForegroundColor Cyan
gcloud storage objects update "gs://$BUCKET/$OBJECT" --add-acl-grant=entity=AllUsers,role=READER

# 3. Verify the URL responds (HEAD request)
Write-Host ""
Write-Host "Verifying public URL responds..." -ForegroundColor Cyan
try {
  $resp = Invoke-WebRequest -Uri $PUBLIC_URL -Method Head -UseBasicParsing -ErrorAction Stop
  Write-Host "  HTTP $($resp.StatusCode) - $($resp.Headers['Content-Length']) bytes" -ForegroundColor Green
} catch {
  Write-Host "  Public HEAD request failed: $_" -ForegroundColor Yellow
  Write-Host "  ACL may take a few seconds to propagate. The Vite env var is still safe to set." -ForegroundColor Yellow
}

# 4. Set the Vite env var
$envFile = "$pwd\.env"
$envLine = "VITE_WELL_FINDER_PMTILES_URL=$PUBLIC_URL"

Write-Host ""
Write-Host "Updating .env with VITE_WELL_FINDER_PMTILES_URL..." -ForegroundColor Cyan

if (Test-Path $envFile) {
  $envContent = Get-Content $envFile -Raw
  if ($envContent -match '(?m)^VITE_WELL_FINDER_PMTILES_URL=') {
    # Replace existing line
    $newContent = $envContent -replace '(?m)^VITE_WELL_FINDER_PMTILES_URL=.*$', $envLine
    [System.IO.File]::WriteAllText($envFile, $newContent)
    Write-Host "  Updated existing VITE_WELL_FINDER_PMTILES_URL line." -ForegroundColor Green
  } else {
    # Append (with trailing newline if needed)
    $separator = if ($envContent.EndsWith("`n")) { '' } else { "`n" }
    [System.IO.File]::AppendAllText($envFile, "$separator$envLine`n")
    Write-Host "  Appended VITE_WELL_FINDER_PMTILES_URL to .env." -ForegroundColor Green
  }
} else {
  [System.IO.File]::WriteAllText($envFile, "$envLine`n")
  Write-Host "  Created .env with VITE_WELL_FINDER_PMTILES_URL." -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Step 7 complete. Pipeline fully wired. ===" -ForegroundColor Green
Write-Host ""
Write-Host "Public PMTiles URL:" -ForegroundColor Cyan
Write-Host "  $PUBLIC_URL"
Write-Host ""
Write-Host "Next: restart your dev server to pick up the new env var." -ForegroundColor Yellow
Write-Host "  Ctrl+C in the dev server terminal, then:  npm run dev" -ForegroundColor Yellow
Write-Host ""
Write-Host "Reload /well-finder in the browser. The badge should flip from 'Live RRC' to 'PMTiles'." -ForegroundColor Yellow
