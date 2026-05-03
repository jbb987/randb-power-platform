# Step 7 fix v3 — correct gcloud syntax for PAP/UBLA, with gsutil fallback.

$ErrorActionPreference = "Continue"

$BUCKET = "randb-site-valuator.firebasestorage.app"
$OBJECT = "well-finder/wells.pmtiles"
$PUBLIC_URL = "https://storage.googleapis.com/$BUCKET/$OBJECT"

Write-Host ""
Write-Host "=== Step 7 fix v3 ===" -ForegroundColor Yellow
Write-Host ""

Write-Host "[0] Full bucket config (look for iamConfiguration.publicAccessPrevention and uniformBucketLevelAccess):" -ForegroundColor Cyan
gcloud storage buckets describe "gs://$BUCKET" --format=yaml | Select-String -Pattern "iamConfiguration|publicAccessPrevention|uniformBucketLevelAccess|enabled|lockedTime" -Context 0,1
Write-Host ""

Write-Host "[1] Clearing Public Access Prevention (--clear-pap)..." -ForegroundColor Cyan
gcloud storage buckets update "gs://$BUCKET" --clear-pap

Write-Host ""
Write-Host "[2] Disabling UBLA via gsutil (more reliable than gcloud here)..." -ForegroundColor Cyan
gsutil ubla set off "gs://$BUCKET"

Write-Host ""
Write-Host "[3] Re-checking config after fixes:" -ForegroundColor Cyan
gcloud storage buckets describe "gs://$BUCKET" --format=yaml | Select-String -Pattern "iamConfiguration|publicAccessPrevention|uniformBucketLevelAccess|enabled" -Context 0,1
Write-Host ""

Write-Host "[4] Granting public read on $OBJECT..." -ForegroundColor Cyan
gcloud storage objects update "gs://$BUCKET/$OBJECT" --add-acl-grant=entity=AllUsers,role=READER

Write-Host ""
Write-Host "[5] Verifying public URL..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
try {
  $resp = Invoke-WebRequest -Uri $PUBLIC_URL -Method Head -UseBasicParsing -ErrorAction Stop
  Write-Host "  HTTP $($resp.StatusCode) - $($resp.Headers['Content-Length']) bytes" -ForegroundColor Green
  Write-Host ""
  Write-Host "=== Public read works! Restart the dev server now. ===" -ForegroundColor Green
} catch {
  Write-Host "  Public HEAD failed: $_" -ForegroundColor Red
  Write-Host ""
  Write-Host "  Paste the [0] output above to Claude — we'll see what's actually blocking." -ForegroundColor Yellow
}
