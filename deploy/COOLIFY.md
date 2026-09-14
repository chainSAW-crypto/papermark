# Deploying Papermark on Coolify

Scope for this deploy (agreed plan): core app + background jobs via
Trigger.dev Cloud. **Skipped for v1**: Tinybird analytics, QStash-driven
crons, Stripe billing, SSO/passkeys. All of those degrade gracefully —
nothing crashes, those features are just inactive until you wire them in
later.

## 1. Infra services in Coolify

Create these as separate resources in your Coolify project, in this order:

1. **Postgres** — Coolify's built-in Postgres resource. Note the internal
   connection string (Coolify gives you host/port/user/pass on the resource
   page). No pgbouncer needed for a single-instance deploy — use the same
   URL for both `POSTGRES_PRISMA_URL` and `POSTGRES_PRISMA_URL_NON_POOLING`.

2. **MinIO** — add via Coolify's MinIO service template (or the generic
   "Docker Compose" resource with the official `minio/minio` image). After
   it's up, open the MinIO console and:
   - Create two buckets: `papermark-docs` and `papermark-archive`.
   - Create an access key / secret key pair (Access Keys → Create).
   - Set both buckets' access policy so objects are readable via presigned
     URLs (default private is fine — Papermark always fetches through
     presigned URLs, never public bucket listing).
   - Note MinIO's public FQDN Coolify assigns it (or attach your own domain)
     — this becomes `NEXT_PRIVATE_UPLOAD_ENDPOINT` /
     `NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST`.

3. **Redis + serverless-redis-http** — deploy `deploy/redis-compose.yaml`
   from this repo as a "Docker Compose" resource in Coolify. Edit
   `SRH_TOKEN` in that file to a real secret before deploying. This exists
   because Papermark's rate-limiter and upload locker use the
   `@upstash/redis` **REST** protocol, not plain Redis TCP — Coolify's
   stock Redis template alone won't work here.

## 2. External managed services (sign up, grab API keys)

- **Resend** (resend.com) — required. Transactional email, and specifically
  the magic-link login email (`EmailProvider` in NextAuth) — without this,
  email-based login silently does nothing. Verify a sending domain, get
  `RESEND_API_KEY`.
- **Trigger.dev Cloud** (trigger.dev) — required for this scope. Create a
  project, get `TRIGGER_SECRET_KEY`. The project ID is already pinned in
  `trigger.config.ts` (`proj_plmsfqvqunboixacjjus`) — you'll want to swap
  that to your own project's ID before deploying tasks.

## 3. The app itself

1. In Coolify, create a new resource → "Application" → point it at this
   repo (or your fork/mirror of it), Dockerfile build pack, this repo's
   root as build context.
2. Copy `.env.coolify.example` into Coolify's environment variables editor
   for the app resource, fill in every `REQUIRED` value using what you
   collected in steps 1–2 above. Generate the random secrets with:
   ```
   openssl rand -base64 32   # NEXTAUTH_SECRET, NEXT_PRIVATE_DOCUMENT_PASSWORD_KEY, NEXT_PRIVATE_VERIFICATION_SECRET
   openssl rand -hex 32      # INTERNAL_API_KEY
   openssl rand -hex 16      # REVALIDATE_TOKEN
   ```
3. Point Coolify's domain/proxy config at container port `3000`.
4. Deploy. The entrypoint (`docker-entrypoint.sh`) runs
   `prisma migrate deploy` against the DB before the app boots — first
   deploy will apply all 134 migrations and can take a minute.
5. After Trigger.dev tasks are pushed (`npx trigger.dev@4 deploy` from your
   machine, pointed at your Trigger.dev project), background jobs (PDF
   rendering, video optimization, AI indexing, dataroom notifications) go
   live.

## 4. First smoke test

- Visit the app URL → sign up with email → confirm the magic-link email
  arrives (Resend) → click through → land on dashboard.
- Upload a PDF → confirm it lands in the `papermark-docs` MinIO bucket →
  confirm page thumbnails render (mupdf, runs in-process, no extra infra).
- Create a share link → open it in an incognito window → confirm the
  viewer loads and a page-view event is recorded (view analytics land in
  Postgres regardless of Tinybird being configured — Tinybird only powers
  the *aggregate charts*, not raw event capture).
- Check Trigger.dev's dashboard for a run corresponding to any background
  task (e.g. PDF-to-image conversion) to confirm the worker connection is
  live.

## 5. Deferred for later (not part of this deploy)

- **Tinybird** — page-view analytics dashboards. Needs a Tinybird account +
  publishing the pipes in `lib/tinybird/`.
- **QStash crons** — the 4 routes under `app/api/cron/*` (dataroom digests,
  domain health checks, welcome emails, year-in-review) currently have
  nothing calling them. Either add Upstash QStash schedules pointed at
  each route (see `lib/cron/verify-qstash.ts` for the expected signing
  headers), or point Coolify's own scheduled-task feature at them with a
  bearer token instead.
- **Stripe** — billing/paid plans. Skip entirely for a self-host with no
  payment collection.
- **SSO / SAML / Hanko passkeys** — enterprise auth extras, opt in later.
