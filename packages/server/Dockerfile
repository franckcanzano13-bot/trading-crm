# Sprint 7.2 — Multi-stage Dockerfile for the TradeXLabel API server.
#
# Stages:
#   1. deps     — install all workspace deps (incl. dev) into a clean layer
#   2. builder  — generate Prisma client, compile TS to dist/
#   3. runtime  — copy only what production needs; run as non-root
#
# Build from the repo root:
#   docker build -f packages/server/Dockerfile -t tradexlabel/api:latest .
#
# Run:
#   docker run --rm -p 5500:5500 \
#     -e DATABASE_URL=postgresql://... \
#     -e JWT_SECRET=... -e JWT_REFRESH_SECRET=... \
#     -e ENCRYPTION_KEY=... \
#     tradexlabel/api:latest

# Pinned to bookworm-slim — Prisma's recommended Linux base. Alpine has
# recurring OpenSSL/libc issues with Prisma engines.
ARG NODE_VERSION=20.18.1

# ─── 1. deps ─────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /workspace

# Install only the manifests needed to resolve workspaces. This keeps the
# install layer cacheable independently of source changes.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
# packages/web is intentionally NOT copied — it's not needed to build the
# server, and pulling Next.js into the build image bloats it ~400MB.

# `npm ci` with --workspace=server installs only what the server needs
# plus its transitive workspace dep (@tradexlabel/shared). We skip web.
RUN npm ci \
    --workspace=@tradexlabel/server \
    --workspace=@tradexlabel/shared \
    --include-workspace-root


# ─── 2. builder ──────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS builder
WORKDIR /workspace

# Required by Prisma engines at runtime even on -slim.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /workspace/packages/server/node_modules ./packages/server/node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

# Build shared first (server imports its dist via workspaces), then generate
# Prisma client, then compile server.
RUN npm run build --workspace=@tradexlabel/shared
RUN npx --workspace=@tradexlabel/server prisma generate
RUN npm run build --workspace=@tradexlabel/server


# ─── 3. runtime ──────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app

# OpenSSL is needed by the Prisma query engine binary at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 tradexlabel \
    && useradd  --system --uid 1001 --gid tradexlabel --no-create-home tradexlabel

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5500

# Pull only what the runtime needs: compiled server, prisma schema (for
# `prisma migrate deploy` at boot), and the workspace's node_modules
# tree (which already excludes dev deps because we'll re-install below).
COPY --from=builder --chown=tradexlabel:tradexlabel /workspace/packages/shared/dist        ./packages/shared/dist
COPY --from=builder --chown=tradexlabel:tradexlabel /workspace/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=tradexlabel:tradexlabel /workspace/packages/server/dist        ./packages/server/dist
COPY --from=builder --chown=tradexlabel:tradexlabel /workspace/packages/server/prisma      ./packages/server/prisma
COPY --from=builder --chown=tradexlabel:tradexlabel /workspace/packages/server/package.json ./packages/server/package.json
COPY --chown=tradexlabel:tradexlabel package.json package-lock.json ./

# Production-only install: drops vitest, fast-check, eslint, tsx, typescript.
# Prisma CLI is intentionally a regular dep so the runtime image can run
# `prisma migrate deploy` at boot (see docker-compose.yml `migrate` job).
RUN npm ci \
    --workspace=@tradexlabel/server \
    --workspace=@tradexlabel/shared \
    --include-workspace-root --omit=dev
# Re-generate Prisma client into the production node_modules tree so the
# query engine binary matches the runtime libc (it was generated in the
# builder image, same base, so it should match — but explicit is safer).
RUN npx --workspace=@tradexlabel/server prisma generate

USER tradexlabel
EXPOSE 5500

# Healthcheck hits the existing /api/v1/health endpoint that already
# returns price-source status. Uses node's http (no curl needed).
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||5500)+'/api/v1/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Default to API+monitor in one process. For a deployment that runs the
# position monitor as a sibling worker (Sprint 3.6 / 5.3), set
# RUN_AS_API_ONLY=1 on the API container and run a second container with
# CMD ["node", "packages/server/dist/workers/position-monitor-worker.js"].
CMD ["node", "packages/server/dist/index.js"]
