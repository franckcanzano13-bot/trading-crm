# Sprint 9.4 — Multi-stage Dockerfile for the TradeXLabel web front-end.
#
# Next.js `output: 'standalone'` (see next.config.js) produces a minimal
# self-contained server: no node_modules tree at runtime, ~50MB image.
#
# Build from the repo root (the build context must include packages/shared
# and packages/web; packages/web/Dockerfile.dockerignore scopes it):
#   docker build -f packages/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.broker.example \
#     -t tradexlabel/web:latest .
#
# NEXT_PUBLIC_* values are inlined into the browser bundle at BUILD time.
# One image per public API origin (or leave it empty and put the API behind
# the same origin as the web via a reverse proxy — then the client uses
# relative /api and /ws paths).
#
# Run:
#   docker run --rm -p 3000:3000 tradexlabel/web:latest

ARG NODE_VERSION=20.18.1

# ─── 1. deps ─────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/
# Prisma client types are re-exported through @tradexlabel/shared; the
# server package.json is needed so npm can resolve the workspace graph, but
# we do not install its deps.
COPY packages/server/package.json packages/server/
RUN npm ci \
    --workspace=@tradexlabel/web \
    --workspace=@tradexlabel/shared \
    --include-workspace-root

# ─── 2. builder ──────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS builder
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /workspace/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY packages/web ./packages/web
COPY packages/server/package.json packages/server/package.json

ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
# Where the (optional) same-origin /api and /ws rewrites proxy to. Only
# used when NEXT_PUBLIC_API_URL is empty. Inside docker-compose the API
# service is reachable as http://api:5500.
ARG API_INTERNAL_URL="http://api:5500"
ENV API_INTERNAL_URL=${API_INTERNAL_URL}

RUN npm run build --workspace=@tradexlabel/shared
RUN npm run build --workspace=@tradexlabel/web

# ─── 3. runtime ──────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN groupadd --system --gid 1001 tradexlabel \
    && useradd  --system --uid 1001 --gid tradexlabel --no-create-home tradexlabel

# Standalone output keeps the monorepo layout (outputFileTracingRoot = repo
# root), so server.js lives under packages/web/.
COPY --from=builder --chown=tradexlabel:tradexlabel /workspace/packages/web/.next/standalone ./
COPY --from=builder --chown=tradexlabel:tradexlabel /workspace/packages/web/.next/static ./packages/web/.next/static
COPY --from=builder --chown=tradexlabel:tradexlabel /workspace/packages/web/public ./packages/web/public

USER tradexlabel
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "packages/web/server.js"]
