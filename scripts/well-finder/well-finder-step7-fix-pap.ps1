# Fix the public-read setup for wells.pmtiles, dealing with both
# Public Access Prevention (PAP) and Uniform Bucket-Level Access (UBLA).

$ErrorActionPreference = "Continue"

$BUCKET = "randb-site-valuator.firebasestorage.app"
$OBJECT = "well-finder/wells.pmtiles"
$PUBLIC_URL = "https://storage.googleapis.com/$BUCKET/$OBJECT"

Write-Host ""
Write-Host "=== Step 7 fix v2: Disable PAP + UBLA, then make object public ===" -ForegroundColor Yellow
Write-Host ""

Write-Host "[0] Current bucket security settings:" -ForegroundColor Cyan
gcloud storage buckets describe "gs://$BUCKET" --format="value(iamConfiguration.publicAccessPrevention,iamConfiguration.uniformBucketLevelAccess.enabled,location)"
Write-Host ""

Write-Host "[1] Disabling Public Access Prevention..." -ForegroundColor Cyan
gcloud storage buckets update "gs://$BUCKET" --public-access-prevention=inherited

Write-Host ""
Write-Host "[2] Disabling Uniform Bucket-Level Access..." -ForegroundColor Cyan
gcloud storage buckets update "gs://$BUCKET" --no-uniform-bucket-level-access

Write-Host ""
Write-Host "[3] Granting public read on $OBJECT..." -ForegroundColor Cyan
gcloud storage objects update "gs://$BUCKET/$OBJECT" --add-acl-grant=entity=AllUsers,role=READER

Write-Host ""
Write-Host "[4] Verifying public URL..." -ForegroundColor Cyan
Start-Sleep -Seconds 2
try {
  $resp = Invoke-WebRequest -Uri $PUBLIC_URL -Method Head -UseBasicParsing -ErrorAction Stop
  Write-Host "  HTTP $($resp.StatusCode) - $($resp.Headers['Content-Length']) bytes" -ForegroundColor Green
  Write-Host ""
  Write-Host "=== Public read works. ===" -ForegroundColor Green
} catch {
  Write-Host "  Public HEAD failed: $_" -ForegroundColor Red
  Write-Host ""
  Write-Host "  If PAP says 'enforced' above, the project (or Org) has a policy" -ForegroundColor Yellow
  Write-Host "  blocking public objects. We'd need an alternative strategy" -ForegroundColor Yellow
  Write-Host "  (Firebase Hosting rewrite or signed URL) — let me know." -ForegroundColor Yellow
}
