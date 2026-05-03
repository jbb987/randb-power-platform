# Fix the public-read ACL for wells.pmtiles.
# Default Firebase Storage buckets have UBLA (Uniform Bucket-Level Access)
# enabled, which prevents per-object ACLs. Disable UBLA, then re-grant the
# public-read ACL on just wells.pmtiles.

$ErrorActionPreference = "Continue"

$BUCKET = "randb-site-valuator.firebasestorage.app"
$OBJECT = "well-finder/wells.pmtiles"

Write-Host ""
Write-Host "=== Step 7 fix: Disable UBLA + grant public read ===" -ForegroundColor Yellow
Write-Host ""

Write-Host "[1] Disabling Uniform Bucket-Level Access on gs://$BUCKET..." -ForegroundColor Cyan
gcloud storage buckets update "gs://$BUCKET" --no-uniform-bucket-level-access

Write-Host ""
Write-Host "[2] Granting public read on $OBJECT..." -ForegroundColor Cyan
gcloud storage objects update "gs://$BUCKET/$OBJECT" --add-acl-grant=entity=AllUsers,role=READER

Write-Host ""
Write-Host "[3] Verifying public URL responds..." -ForegroundColor Cyan
$publicUrl = "https://storage.googleapis.com/$BUCKET/$OBJECT"
try {
  $resp = Invoke-WebRequest -Uri $publicUrl -Method Head -UseBasicParsing -ErrorAction Stop
  Write-Host "  HTTP $($resp.StatusCode) - $($resp.Headers['Content-Length']) bytes" -ForegroundColor Green
} catch {
  Write-Host "  Public HEAD failed: $_" -ForegroundColor Yellow
  Write-Host "  Sometimes ACL takes a few seconds to propagate. Try the URL in a browser:" -ForegroundColor Yellow
  Write-Host "  $publicUrl" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Step 7 fix complete. ===" -ForegroundColor Green
Write-Host "Restart the dev server (Ctrl+C, then npm run dev) and reload /well-finder." -ForegroundColor Cyan
