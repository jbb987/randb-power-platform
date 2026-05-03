# Phase 2 — fix the Orphan parser column mapping and re-run just the orphan
# ingest (IWAR was already successful, no need to re-run it).

$ErrorActionPreference = "Continue"

$PROJECT_NUMBER = "882533648595"
$RUN_URL = "https://well-finder-rrc-bulks-$PROJECT_NUMBER.us-central1.run.app"

Write-Host ""
Write-Host "=== Phase 2 fix: redeploy Cloud Run with corrected Orphan parser ===" -ForegroundColor Yellow
Write-Host ""

Write-Host "[1] Redeploying well-finder-rrc-bulks..." -ForegroundColor Cyan
gcloud run deploy well-finder-rrc-bulks `
  --source cloudrun-rrc-bulks `
  --region us-central1 `
  --memory 4Gi `
  --cpu 2 `
  --timeout 1800 `
  --no-allow-unauthenticated

Write-Host ""
Write-Host "[2] Triggering only the orphan ingest..." -ForegroundColor Cyan

# Mint an ID token for the Cloud Run service URL
$ID_TOKEN = gcloud auth print-identity-token --audiences=$RUN_URL

# POST with sources=["orphan"] body
$body = '{"sources":["orphan"]}'
try {
  $resp = Invoke-WebRequest `
    -Uri $RUN_URL `
    -Method POST `
    -Headers @{ Authorization = "Bearer $ID_TOKEN"; 'Content-Type' = 'application/json' } `
    -Body $body `
    -UseBasicParsing `
    -TimeoutSec 600

  Write-Host ""
  Write-Host "  HTTP $($resp.StatusCode)" -ForegroundColor Green
  Write-Host "  Response: $($resp.Content)" -ForegroundColor DarkGray
} catch {
  Write-Host "  Request failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Done. ===" -ForegroundColor Green
Write-Host ""
Write-Host "Orphan ingest takes ~1-2 min. Tail logs with:" -ForegroundColor Cyan
Write-Host "  .\well-finder-phase2-status.ps1" -ForegroundColor Cyan
