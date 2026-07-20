# --- deps stage (production-only node_modules for the runtime image) -----
FROM node:24-slim AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# --- build stage -----------------------------------------------------------
FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run js:build

# --- runtime stage -----------------------------------------------------------
FROM node:24-slim
WORKDIR /app

RUN useradd --system --create-home --uid 1001 appuser

COPY --from=deps --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appuser /app/dist ./dist
COPY --chown=appuser:appuser package.json ./

# Shared volume with the subservices (image-hash, video-frame-extract, pdf-page-extract) — core writes decoded assets
# here and reads back extracted sub-item files by path. Path must match every subservice's own mount point exactly.
RUN mkdir -p /shared && chown appuser:appuser /shared

ENV NODE_ENV=production
ENV CONFIG_PATH=/etc/asset-dedup-core/config.yaml
ENV ASSET_WORKDIR=/shared

USER appuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
