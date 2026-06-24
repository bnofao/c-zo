# Deploying c-zo on Coolify

c-zo runs as four resources on a single shared network: **postgres** (stateful database), **life** (GraphQL API, public-facing), **life-worker** (durable job queue consumer, no public port), and **tour** (admin UI, public-facing). Postgres is the only persistent service; the three application resources are stateless and can be scaled (with caveats noted below).

All resources attach to a shared Coolify network, enabling service-to-service DNS resolution: `tour` calls `life:4000` internally, and `life-worker` shares the database with `life`.

There are two ways to deploy this on Coolify. **Option A** (the default, documented in sections 1–4 below) creates four independent Coolify resources — most control and per-service visibility. **Option B** (see the section at the end) deploys a single Docker Compose resource — fewer moving parts, one resource to manage. Postgres is a Coolify-managed database resource in both options.

## 1. PostgreSQL

Create a Coolify PostgreSQL 17 resource.

- **Database name:** `czo`
- **Note the connection string** (internal `postgres://...`) — this becomes `DATABASE_URL` for both `life` and `life-worker`.

Once the database is up, verify connectivity from the shell or a test job.

## 2. life (GraphQL API)

Create a new Coolify resource using a Dockerfile.

**Build configuration:**
- **Repository:** this repo
- **Branch:** `main`
- **Dockerfile path:** `apps/life/Dockerfile`
- **Build context:** `/` (repo root)

**Deployment:**
- **Pre-deployment command:** `pnpm migrate`
  - Runs all pending Drizzle migrations against the database before the application starts.
- **Port:** `4000`
- **Public domain:** attach a public domain (TLS via Coolify)
- **Network:** attach to the shared network

**Environment variables:**
- `DATABASE_URL` — from Postgres (internal connection string)
- `AUTH_SECRET` — a generated ≥32-character secret (use a secure password generator; used for session signing)
- `AUTH_APP` — `life`
- `NODE_ENV` — `production`
- `HOST` — `0.0.0.0`
- `PORT` — `4000`
- `TRUSTED_PROXY_HOPS` — `1` (Coolify sits behind a reverse proxy)
- (optional) `EMAIL_TRANSPORT` — e.g., `resend` or `smtp` if configured in `EmailService`
- (optional) `SMTP_*` — SMTP credentials if `EMAIL_TRANSPORT=smtp`
- (optional) `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME` — for observability (see Follow-ups)

**Verification:**
After deployment, verify the health endpoint:
```bash
curl https://<life-domain>/health
```
Expected response: `{"ok":true,"app":"life"}`

## 3. life-worker

Create a new Coolify resource using the **same Dockerfile** as `life`.

**Build configuration:**
- **Repository:** this repo
- **Branch:** `main`
- **Dockerfile path:** `apps/life/Dockerfile` (same as life)
- **Build context:** `/` (repo root)

**Deployment:**
- **Start/Run command override:** `pnpm --filter @czo/life worker`
  - Replaces the default start command; the worker subscribes to durable job queues and runs consumer processes.
- **No public port** — this service has no HTTP interface; it only connects to Postgres.
- **No pre-deployment command** — `life` owns the migrations; the worker reads the same database.
- **Network:** attach to the shared network

**Environment variables:**
- `DATABASE_URL` — **identical to `life`** (same Postgres instance)
- `AUTH_SECRET` — **identical to `life`** (required for any auth-scoped services)
- `AUTH_APP` — `life`
- `NODE_ENV` — `production`
- (optional) `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME` — for observability

**Verification:**
After deployment, check the container logs:
```
life worker: N consumer(s) — <queue names>
```
The container should remain running, draining its job queues.

## 4. tour (Admin UI)

Create a new Coolify resource using a Dockerfile.

**Build configuration:**
- **Repository:** this repo
- **Branch:** `main`
- **Dockerfile path:** `apps/tour/Dockerfile`
- **Build context:** `/` (repo root)

**Deployment:**
- **Port:** `3000`
- **Public domain:** attach a public domain (TLS via Coolify)
- **Network:** attach to the shared network

**Environment variables:**
- `LIFE_URL` — `http://life:4000` (internal service DNS within the shared network)
- `NODE_ENV` — `production`
- `HOST` — `0.0.0.0`
- `PORT` — `3000`
- (optional, build-time) `VITE_TOLGEE_API_URL` and `VITE_TOLGEE_API_KEY`
  - If provided, the UI will sync translations from a Tolgee project at build time.
  - If omitted, the bundled English and French JSON files (`src/i18n/en.json`, `src/i18n/fr-FR.json`) are shipped in the image.

**Verification:**
After deployment, open `https://<tour-domain>/login` in a browser. Sign in with your account (created via `life`'s GraphQL mutations), and verify you can navigate to the `/users` page.

## Deploy order

1. **Postgres** — creates the `czo` database.
2. **life** — runs migrations, boots the API, starts listening on port 4000.
3. **life-worker** — connects to the same database, subscribes to job queues.
4. **tour** — connects to `life:4000` (internal DNS), serves the admin UI.

Deploy each sequentially, verifying each step (health checks, container logs) before moving to the next.

## Option B: Single Docker Compose resource

Instead of four separate resources, you can deploy `life`, `life-worker`, and `tour` as one **Docker Compose** resource using the root `docker-compose.yml`. Postgres remains a separate Coolify-managed database (Option B does not put Postgres in the compose, so you keep Coolify's backup/restore UI).

**When to choose it:** one resource to deploy and manage, with migrations wired into the stack. Choose Option A instead if you need to scale or redeploy each service independently.

**Steps:**

1. **Create the managed Postgres** exactly as in section 1 above (database name `czo`). Note its internal connection string.

2. **Create a new resource → Docker Compose.**
   - **Repository:** this repo
   - **Branch:** `main`
   - **Compose file path:** `docker-compose.yml`
   - **Network:** the compose joins Coolify's shared **`coolify`** network (declared `external: true`). Make sure the managed Postgres is also reachable on it (attach the DB resource to `coolify`), and — if you run the observability stack — that it's on `coolify` too, so `life` can reach `otel-collector:4318` by name.

3. **Set environment variables on the stack:**
   - `DATABASE_URL` — the managed Postgres internal connection string (required; deployment is blocked until it is set).
   - `SERVICE_PASSWORD_64_AUTH` — leave it for Coolify to **auto-generate**. It becomes `AUTH_SECRET` for both `life` and `life-worker` (one generated secret, shared across both services).
   - **Telemetry (built in):** `life` and `life-worker` default to exporting OTLP to `http://otel-collector:4318` (`OTEL_SERVICE_NAME` = `life` / `life-worker`). If you have **not** deployed the observability stack, set `OTEL_EXPORTER_OTLP_ENDPOINT` to an empty value to disable export and avoid connection-error noise.

4. **Assign domains:**
   - On the `life` service, attach a public domain — this populates `SERVICE_FQDN_LIFE_4000`.
   - On the `tour` service, attach a public domain — this populates `SERVICE_FQDN_TOUR_3000`.
   - `life-worker` gets no domain (no exposed port).

5. **Deploy.** Coolify builds the images and starts the stack in dependency order:
   - The `migrate` service runs `pnpm migrate` and exits — **migrations run automatically; there is no separate pre-deployment command** in this option.
   - `life` and `life-worker` start once `migrate` completes successfully.
   - `tour` starts once `life` is healthy. `tour` reaches the API at `http://life:4000` over the stack's internal network.

**Verification:** identical to Option A — `curl https://<life-domain>/health` returns `{"ok":true,"app":"life"}`, and `https://<tour-domain>/login` loads the sign-in page. The compose also defines container healthchecks for `life` and `tour`, which Coolify surfaces in the resource status.

**Optional:** `tour` accepts `VITE_TOLGEE_API_URL` and `VITE_TOLGEE_API_KEY` as build-time variables to sync translations at build; omit them to ship the bundled EN/FR JSON.

## Security & Runtime Notes

- All three application images run **non-root** (the Node.js user), as a container hardening measure.
- `life` and `life-worker` share the same `AUTH_SECRET` so that one can verify tokens issued by the other (required for cross-service auth scopes).
- **`AUTH_SECRET` is mandatory in production.** The API has a hardcoded development fallback secret; if you do not set `AUTH_SECRET`, `life` will boot with that **publicly-known** value (the worker, by contrast, fails fast when it is unset). Always set a unique, generated `AUTH_SECRET` on both resources.

## Optional: Health checks

Coolify can monitor application health via Docker HEALTHCHECK instructions or HTTP probes.

The `life` API exposes a simple health endpoint:
- **Path:** `GET /health`
- **Response:** `{"ok":true,"app":"life"}`

If the images do not define a `HEALTHCHECK` instruction, configure Coolify's HTTP health check:
1. In the resource settings, enable **HTTP health check**.
2. Set the path to `/health`.
3. Coolify will periodically probe and mark the container unhealthy if the endpoint times out or returns a non-2xx status.

## Follow-ups

### Observability & Tracing

If you wish to enable OpenTelemetry tracing and metrics collection:

1. Deploy the observability stack from the repository:
   ```
   docker/observability/
   ```
   This includes the OpenTelemetry Collector, Tempo (traces), Loki (logs),
   Prometheus (metrics), and Grafana datasources.

2. On both `life` and `life-worker`, set:
   - `OTEL_EXPORTER_OTLP_ENDPOINT` — `http://otel-collector:4318` (internal, within the shared network)
   - `OTEL_SERVICE_NAME` — `life` (or `life-worker` for the worker)

3. Redeploy both resources with these environment variables.

4. Access traces and metrics via the observability dashboards.

### Scaling life to multiple replicas

Scaling `life` horizontally (>1 replica) requires shared state for:
- **Rate limiting:** currently in-memory per instance; migrate to Redis-backed rate limiting.
- **Session persistence:** currently in-memory; consider a shared session store or sticky sessions via Coolify's load balancer.

Before scaling, implement Redis-backed implementations of these features (planned as part of the platform roadmap).

### Long-term maintenance

- Monitor the health endpoint and container logs regularly.
- Plan database backup and recovery procedures (Postgres snapshots, WAL archiving).
- Keep the repository updated; redeploy to pull the latest image builds.
