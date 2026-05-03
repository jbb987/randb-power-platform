# Apply CORS to the correct bucket: randb-site-valuator.firebasestorage.app

$ErrorActionPreference = "Continue"

$BUCKET = "randb-site-valuator.firebasestorage.app"

Write-Host ""
Write-Host "=== Step 5 fix: Apply CORS to the correct bucket ===" -ForegroundColor Yellow
Write-Host "Bucket: gs://$BUCKET" -ForegroundColor Cyan
Write-Host ""

$corsJson = @'
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Content-Range", "Range", "Accept-Ranges", "Cache-Control"],
    "maxAgeSeconds": 3600
  }
]
'@

$corsFile = "$pwd\_cors.json"
[System.IO.File]::WriteAllText($corsFile, $corsJson)

Write-Host "Applying CORS..." -ForegroundColor Yellow
gcloud storage buckets update "gs://$BUCKET" --cors-file=$corsFile

Remove-Item $corsFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Verifying region (Storage trigger function is in us-east1; bucket should match):" -ForegroundColor Yellow
gcloud storage buckets describe "gs://$BUCKET" --format='value(location,locationType)'

Write-Host ""
Write-Host "=== Step 5 fix complete. ===" -ForegroundColor Green
Write-Host ""
Write-Host "Real Firebase bucket: $BUCKET" -ForegroundColor Cyan
Write-Host "Next: run .\well-finder-step6.ps1 (trigger first ingestion)." -ForegroundColor Green
