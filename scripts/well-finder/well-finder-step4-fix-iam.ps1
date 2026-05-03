# Fix the IAM binding firebase deploy asked us to add.
# Storage triggers go through Eventarc → Pub/Sub, and the GCS service agent
# needs publisher rights on the project's Pub/Sub.

$ErrorActionPreference = "Continue"

$PROJECT_ID = "randb-site-valuator"
$GCS_AGENT = "service-882533648595@gs-project-accounts.iam.gserviceaccount.com"

Write-Host ""
Write-Host "Granting roles/pubsub.publisher to GCS service agent..." -ForegroundColor Yellow
Write-Host "  Project: $PROJECT_ID" -ForegroundColor Cyan
Write-Host "  Agent  : $GCS_AGENT" -ForegroundColor Cyan
Write-Host ""

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$GCS_AGENT" `
  --role="roles/pubsub.publisher"

Write-Host ""
Write-Host "=== IAM fix complete. Now re-run .\well-finder-step4.ps1 ===" -ForegroundColor Green
