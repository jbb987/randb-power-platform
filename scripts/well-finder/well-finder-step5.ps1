# Phase 1, Step 5 — Configure CORS on the Firebase Storage bucket so the
# browser can do PMTiles range requests.

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== Step 5: Storage CORS ===" -ForegroundColor Yellow
Write-Host ""
Write-Host "Detecting Storage buckets in randb-site-valuator..." -ForegroundColor Cyan
Write-Host ""

# List buckets — we expect 1 (the default) but show them all
$buckets = gcloud storage buckets list --project=randb-site-valuator --format='value(name)'
$bucketArray = @($buckets -split "`r?`n" | Where-Object { $_.Trim() -ne '' })

Write-Host "Buckets found:"
foreach ($b in $bucketArray) {
  Write-Host "  - gs://$b"
}
Write-Host ""

# Pick the first Firebase-style bucket. Newer projects use *.firebasestorage.app,
# older ones use *.appspot.com. Both are valid.
$bucket = $bucketArray | Where-Object { $_ -match 'firebasestorage\.app$|appspot\.com$' } | Select-Object -First 1

if (-not $bucket) {
  Write-Host "Could not auto-detect a Firebase storage bucket." -ForegroundColor Red
  Write-Host "Edit this script and set `$bucket manually to the right one above." -ForegroundColor Red
  exit 1
}

Write-Host "Using bucket: gs://$bucket" -ForegroundColor Green
Write-Host ""

# Write CORS spec — allow GET/HEAD with range request headers, any origin.
# Range/Content-Range/Accept-Ranges are essential for PMTiles to fetch
# specific byte ranges instead of downloading the whole file.
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

Write-Host "Applying CORS configuration..." -ForegroundColor Yellow
gcloud storage buckets update "gs://$bucket" --cors-file=$corsFile

Remove-Item $corsFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Step 5 complete. ===" -ForegroundColor Green
Write-Host ""
Write-Host "Bucket name (you'll need this for the .env in Step 7): " -NoNewline
Write-Host "$bucket" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next: run well-finder-step6.ps1 (trigger first ingestion)." -ForegroundColor Green
