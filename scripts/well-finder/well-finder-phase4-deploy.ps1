# Phase 4 deploy — backend score persistence + standalone backfill endpoint.
#
# Steps:
#   1. Redeploy well-finder-pdq with the score compute + backfill module
#   2. Grant your user account run.invoker on the service (one-time)
#   3. Call /backfill-scores to populate score fields on the existing 110K docs
#   4. Print Firestore index URL — open it in browser if a query error appears

$ErrorActionPreference = "Continue"

$BASE_URL = "https://well-finder-pdq-882533648595.us-central1.run.app"
$USER_EMAIL = "jb@randbpowersolutions.com"  # the gcloud-auth'd user

Write-Host ""
Write-Host "=== Phase 4 deploy: score persistence + backfill ===" -ForegroundColor Yellow
Write-Host ""

Write-Host "[1] Redeploying well-finder-pdq with scoreCompute + scoreBackfill..." -ForegroundColor Cyan
gcloud run deploy well-finder-pdq `
  --source cloudrun-pdq `
  --region us-central1 `
  --memory 8Gi `
  --cpu 4 `
  --timeout 3600 `
  --no-allow-unauthenticated

Write-Host ""
Write-Host "[2] Granting your user account run.invoker on the service (idempotent)..." -ForegroundColor Cyan
gcloud run services add-iam-policy-binding well-finder-pdq `
  --region us-central1 `
  --member="user:$USER_EMAIL" `
  --role="roles/run.invoker"

Write-Host ""
Write-Host "[3] Calling /backfill-scores (~2-3 min for 110K docs)..." -ForegroundColor Cyan
$ID_TOKEN = gcloud auth print-identity-token
try {
  $resp = Invoke-WebRequest `
    -Uri "$BASE_URL/backfill-scores" `
    -Method POST `
    -Headers @{ Authorization = "Bearer $ID_TOKEN"; 'Content-Type' = 'application/json' } `
    -Body '{}' `
    -UseBasicParsing `
    -TimeoutSec 600
  Write-Host ""
  Write-Host "  HTTP $($resp.StatusCode)" -ForegroundColor Green
  Write-Host "  Response: $($resp.Content)" -ForegroundColor DarkGray
} catch {
  Write-Host "  Backfill request failed: $_" -ForegroundColor Red
  Write-Host "  Tail Cloud Run logs to see what happened:" -ForegroundColor Yellow
  Write-Host "    gcloud run services logs read well-finder-pdq --region=us-central1 --limit=20" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Phase 4 deploy done. ===" -ForegroundColor Green
Write-Host ""
Write-Host "  Now refresh /well-finder. Sidebar will query Firestore for top" -ForegroundColor Cyan
Write-Host "  reactivation candidates statewide. The first query may produce a" -ForegroundColor Cyan
Write-Host "  Firestore error in the browser console with a clickable URL to" -ForegroundColor Cyan
Write-Host "  auto-create the required composite index — click the URL and" -ForegroundColor Cyan
Write-Host "  hit 'Create' in the Firebase Console. Index builds in 1-2 min." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Required composite indexes (auto-created on first failed query):" -ForegroundColor Yellow
Write-Host "    Collection: tx-wells-enriched" -ForegroundColor DarkGray
Write-Host "    Fields:     scoreDisqualified ASC, score DESC" -ForegroundColor DarkGray
Write-Host "    Fields:     scoreDisqualified ASC, orphanListed ASC, score DESC" -ForegroundColor DarkGray
Write-Host "    Fields:     scoreDisqualified ASC, score ASC, score DESC  (range + orderBy)" -ForegroundColor DarkGray
