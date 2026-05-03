# Cloud Run service that runs tippecanoe (Felt fork) to convert a GeoJSON
# from Firebase Storage into a PMTiles archive, written back to Storage.
#
# Build & deploy:
#   gcloud run deploy well-finder-tippecanoe \
#     --source cloudrun-tippecanoe \
#     --region us-central1 \
#     --memory 2Gi --cpu 2 --timeout 600 \
#     --no-allow-unauthenticated
#
# Then grant the Functions runtime SA `roles/run.invoker` on this service,
# and store the resulting Cloud Run URL in Secret Manager as
# `WELL_FINDER_TIPPECANOE_URL`.

FROM debian:bookworm-slim AS tippecanoe-build
RUN apt-get update && apt-get install -y --no-install-recommends \
    git build-essential libsqlite3-dev zlib1g-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/felt/tippecanoe.git /src/tippecanoe \
    && cd /src/tippecanoe \
    && make -j"$(nproc)" \
    && make install PREFIX=/opt/tippecanoe

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsqlite3-0 zlib1g ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=tippecanoe-build /opt/tippecanoe/bin/tippecanoe /usr/local/bin/tippecanoe
COPY --from=tippecanoe-build /opt/tippecanoe/bin/tile-join /usr/local/bin/tile-join

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY server.js ./

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
