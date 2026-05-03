# Cloud Run service for ingesting RRC bulk data sources into Firestore.
#
# Sources (Phase 2):
#   - IWAR (Inactive Well Aging Report) — tab-delimited text, scraped from landing page
#   - Orphan Wells list — ZIP containing Excel
#   - (Phase 2.5) RRC Wellbore Query Data, P-5 Organization
#
# Build & deploy:
#   gcloud run deploy well-finder-rrc-bulks \
#     --source cloudrun-rrc-bulks \
#     --region us-central1 \
#     --memory 4Gi --cpu 2 --timeout 1800 \
#     --no-allow-unauthenticated

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY . ./

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
