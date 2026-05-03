# Cloud Run service for ingesting RRC PDQ Dump (production data) into
# Firestore + Cloud Storage. Streams 12.7 GB of monthly lease cycles since
# 1993, aggregates per-lease, fits Arps decline curves, writes per-well
# rollups + monthly time series.
#
# Build & deploy:
#   gcloud run deploy well-finder-pdq \
#     --source cloudrun-pdq \
#     --region us-central1 \
#     --memory 8Gi --cpu 4 --timeout 3600 \
#     --no-allow-unauthenticated

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY . ./

ENV PORT=8080
EXPOSE 8080
CMD ["node", "--max-old-space-size=7000", "server.js"]
