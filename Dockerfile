# syntax=docker/dockerfile:1

# ---- deps: install node_modules with full lockfile fidelity ----
FROM node:24-bookworm-slim AS deps
WORKDIR /app
# openssl: Prisma's engine-selection script shells out to `openssl version`
# to pick the right query-engine binary; without it present it silently
# guesses (falls back to openssl-1.1.x) which mismatches bookworm's real
# OpenSSL 3.0 and can break Prisma Client at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- builder: generate prisma client + build next app ----
FROM node:24-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Values only needed so `next build` can statically evaluate config/pages;
# real secrets are injected at runtime in the runner stage / by Coolify.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ARG NEXT_PUBLIC_BASE_URL=http://localhost:3000
ARG NEXT_PUBLIC_MARKETING_URL=http://localhost:3000
ARG NEXT_PUBLIC_APP_BASE_HOST=localhost
ARG NEXT_PUBLIC_UPLOAD_TRANSPORT=s3
ARG NEXT_PUBLIC_WEBHOOK_BASE_HOST=webhooks.localhost
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_MARKETING_URL=$NEXT_PUBLIC_MARKETING_URL
ENV NEXT_PUBLIC_APP_BASE_HOST=$NEXT_PUBLIC_APP_BASE_HOST
ENV NEXT_PUBLIC_UPLOAD_TRANSPORT=$NEXT_PUBLIC_UPLOAD_TRANSPORT
ENV NEXT_PUBLIC_WEBHOOK_BASE_HOST=$NEXT_PUBLIC_WEBHOOK_BASE_HOST

RUN npx prisma generate --schema=prisma/schema
RUN npm run build

# ---- runner: slim runtime image ----
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# openssl: Prisma Client's query engine binary needs libssl at runtime too.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone server + assets Next's output tracer collects
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma CLI + schema + migrations for `prisma migrate deploy` at boot.
# The standalone output only bundles the generated @prisma/client runtime,
# not the `prisma` CLI itself, so pull it (and its deps) in separately.
# NOTE: we deliberately do NOT copy node_modules/.bin/prisma — Docker's
# COPY dereferences symlinks, so that would copy the CLI bundle's file
# contents into .bin/ instead of preserving the symlink into
# node_modules/prisma/build/. The bundle resolves its .wasm engine file
# relative to its own real location, so from .bin/ it can't find it
# (ENOENT on prisma_schema_build_bg.wasm). The entrypoint invokes
# node_modules/prisma/build/index.js directly instead, sidestepping this.
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER nextjs
EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
