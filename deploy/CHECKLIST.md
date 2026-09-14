# Papermark → Coolify Deployment Checklist

Working copy: `C:\Users\dip_d\Downloads\papermark-clean` (fresh clone of
upstream `mfts/papermark`, since the original local extract was missing
`prisma/`, `public/`, `styles/`, and the whole `[teamId]` bracket-path API
tree due to a Windows zip extraction issue).

Scope: **core app + background jobs** (Trigger.dev Cloud). Deferred:
Tinybird analytics, QStash crons, Stripe billing, SSO/passkeys.

## Phase 1 — Repo analysis
- [x] Mapped env vars, storage transport, Prisma/migrations, background jobs, auth providers

## Phase 2 — Containerization
- [x] `next.config.mjs` — added `output: "standalone"`
- [x] `Dockerfile` — multi-stage build (deps → builder → runner)
- [x] `docker-entrypoint.sh` — runs `prisma migrate deploy` before boot
- [x] `.dockerignore`
- [x] Fixed: prisma/ missing from deps stage before `npm ci` (postinstall needs it)
- [x] Fixed: apt flag typo (`--no-install-recursive` → `--no-install-recommends`)
- [x] Fixed: missing `NEXT_PUBLIC_WEBHOOK_BASE_HOST` build arg (next.config.mjs header validation)
- [x] Fixed: OpenSSL missing in builder/runner (Prisma engine binary mismatch risk)
- [ ] **Local `docker build` verified green end-to-end** ← resuming here

## Phase 3 — Environment & secrets
- [x] `.env.coolify.example` — full var list assembled from actual code usage

## Phase 4 — Supporting infra
- [x] `deploy/redis-compose.yaml` — Redis + serverless-redis-http sidecar
- [ ] MinIO bucket setup walkthrough validated (docs only so far)

## Phase 5 — Documentation
- [x] `deploy/COOLIFY.md` — step-by-step runbook

## Phase 6 — Deploy to Coolify (not started)
- [ ] Push repo to a git remote Coolify can pull from
- [ ] Create Postgres resource
- [ ] Create MinIO resource + buckets
- [ ] Deploy `deploy/redis-compose.yaml` as a Docker Compose resource
- [ ] Create app resource, wire env vars, point at Dockerfile
- [ ] First deploy — confirm migrations run, app boots
- [ ] Smoke test (signup email, upload, share link, Trigger.dev run)

## Phase 7 — External services
- [ ] Resend account + `RESEND_API_KEY` + verified sending domain
- [ ] Trigger.dev Cloud project + `TRIGGER_SECRET_KEY` (+ update `trigger.config.ts` project id)
