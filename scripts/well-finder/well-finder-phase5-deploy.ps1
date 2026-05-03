# Phase 5 deploy — monthly status-change detection.
#
# Steps:
#   1. Deploy the new detectStatusChanges scheduled Cloud Function
#   2. Print the Firestore rule the user must add manually (admin-only read
#      on the new tx-well-changes collection)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== Phase 5 deploy: status-change detection ===" -ForegroundColor Yellow
Write-Host ""

Write-Host "[1] Deploying detectStatusChanges scheduled function..." -ForegroundColor Cyan
firebase deploy --only "functions:detectStatusChanges"

Write-Host ""
Write-Host "=== Deploy complete. ===" -ForegroundColor Green
Write-Host ""
Write-Host "  *** REQUIRED: add Firestore rule for the new collection ***" -ForegroundColor Magenta
Write-Host "  Open https://console.firebase.google.com/project/randb-site-valuator/firestore/databases/-default-/rules" -ForegroundColor Magenta
Write-Host "  Add this match block alongside your existing rules:" -ForegroundColor Magenta
Write-Host ""
Write-Host "    // Status-change events (Phase 5). Writes are server-only." -ForegroundColor DarkGray
Write-Host "    match /tx-well-changes/{eventId} {" -ForegroundColor DarkGray
Write-Host "      allow read:  if isAdmin();" -ForegroundColor DarkGray
Write-Host "      allow write: if false;" -ForegroundColor DarkGray
Write-Host "    }" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Then click Publish." -ForegroundColor Magenta
Write-Host ""
Write-Host "  When does this start working?" -ForegroundColor Cyan
Write-Host "    - The scheduled function runs the 3rd of each month." -ForegroundColor Cyan
Write-Host "    - It compares the two latest monthly snapshots in:" -ForegroundColor Cyan
Write-Host "        gs://randb-site-valuator.firebasestorage.app/well-finder/snapshots/" -ForegroundColor DarkGray
Write-Host "    - You currently have 1 snapshot (2026-05). Need 2 to diff." -ForegroundColor Cyan
Write-Host "    - First real run: June 3rd, 2026 (after fetchRrcWells writes 2026-06)." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Want to test before then? Manually trigger after the next monthly fetch:" -ForegroundColor Yellow
Write-Host "    gcloud scheduler jobs run firebase-schedule-detectStatusChanges-us-east1 --location=us-east1" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Today the sidebar's 'Recent activity' card will show 'No recent changes'" -ForegroundColor Cyan
Write-Host "  until at least one diff has run." -ForegroundColor Cyan
