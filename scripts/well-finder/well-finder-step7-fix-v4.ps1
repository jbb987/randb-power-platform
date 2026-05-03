# Step 7 fix v4 — UBLA is org-enforced, so use bucket IAM with a condition
# scoped to the well-finder/ prefix. If the org also blocks allUsers IAM
# bindings, we'll know and pivot to the Firebase SDK approach.

$ErrorActionPreference = "Continue"

$BUCKET = "randb-site-valuator.firebasestorage.app"
$OBJECT = "well-finder/wells.pmtiles"
$PUBLIC_URL = "https://storage.googleapis.com/$BUCKET/$OBJECT"

Write-Host ""
Write-Host "=== Step 7 fix v4: bucket IAM with object-name condition ===" -ForegroundColor Yellow
Write-Host ""

# IAM condition that only matches our well-finder/ prefix.
# resource.name format for Cloud Storage objects is
#   projects/_/buckets/<bucket>/objects/<path>
$conditionExpression = 'resource.name.startsWith("projects/_/buckets/' + $BUCKET + '/objects/well-finder/")'

Write-Host "[1] Granting allUsers->objectViewer with prefix condition on well-finder/" -ForegroundColor Cyan
Write-Host "    Condition: $conditionExpression" -ForegroundColor DarkGray

gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" `
  --member=allUsers `
  --role=roles/storage.objectViewer `
  --condition="expression=$conditionExpression,title=public-well-finder,description=Public read for Well Finder PMTiles"

Write-Host ""
Write-Host "[2] Verifying public URL..." -ForegroundColor Cyan
Start-Sleep -Seconds 5
try {
  $resp = Invoke-WebRequest -Uri $PUBLIC_URL -Method Head -UseBasicParsing -ErrorAction Stop
  Write-Host "  HTTP $($resp.StatusCode) - $($resp.Headers['Content-Length']) bytes" -ForegroundColor Green
  Write-Host ""
  Write-Host "=== Public read works! Refresh /well-finder in the browser. ===" -ForegroundColor Green
  Write-Host "    The badge should flip to '● PMTiles' once the request lands." -ForegroundColor Green
} catch {
  Write-Host "  Public HEAD failed: $_" -ForegroundColor Red
  Write-Host ""
  Write-Host "  If [1] above also failed (likely org policy blocks allUsers bindings), tell" -ForegroundColor Yellow
  Write-Host "  Claude — we pivot to Firebase Storage SDK download URLs (frontend change," -ForegroundColor Yellow
  Write-Host "  no public access needed). That's the clean Firebase-native path anyway." -ForegroundColor Yellow
}
