# Coolify Deployment (life + tour) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Containerize `life` (API + worker) and `tour` (admin UI) and document their Coolify deployment, backed by a managed Postgres.

**Architecture:** Per-app multi-stage Dockerfiles built from the monorepo root. `life` builds all `@czo/*` workspace `dist` then runs via `tsx`; its worker reuses the same image with an overridden command. `tour` builds a Nitro standalone bundle. DB migrations run as a Coolify pre-deployment command via a new root `migrate` script.

**Tech Stack:** Docker (multi-stage), Node 24, pnpm 10.17.1, Turborepo, drizzle-kit, TanStack Start (Nitro), Effect 4 / h3.

## Global Constraints

- **Node version:** `24` (`node:24-slim` base images) — verbatim across all Dockerfiles.
- **Package manager:** `pnpm@10.17.1` via `corepack prepare pnpm@10.17.1 --activate`.
- **Database name:** `czo`. Only stateful dependency (no Redis/RabbitMQ).
- **life is public** (GraphQL API + `/api/auth`); **tour is public**; tour→life admin calls are internal (`LIFE_URL=http://life:4000`).
- **Telemetry off by default** — do NOT set `OTEL_EXPORTER_OTLP_ENDPOINT`.
- **Build context is the repo root** for every Dockerfile (pnpm workspace needs the whole tree).
- **PREREQUISITE for the worker resource:** PR #155 (worker `Persistence` fix) must be merged to `main`. On `main` as-is the worker crashes forking consumers (`Service not found: effect/persistence/Persistence`). `life` + `tour` deploy independently of #155.

---

### Task 1: Root `migrate` script

**Files:**
- Modify: `package.json` (root — add a `migrate` script)

**Interfaces:**
- Produces: a `pnpm migrate` command that applies every module's pending migrations against `DATABASE_URL`, sequentially and idempotently. Consumed by Task 4 (Coolify pre-deployment command) and the `life` image.

- [ ] **Step 1: Add the script**

In root `package.json`, add to `"scripts"` (after `"build"`):

```json
"migrate": "pnpm -r --workspace-concurrency=1 --filter \"./packages/modules/*\" run migrate:latest"
```

- [ ] **Step 2: Start a clean Postgres + `czo` DB**

```bash
docker compose -f docker-compose.dev.yml up -d postgres
until docker exec c-zo-postgres-1 pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
docker exec c-zo-postgres-1 createdb -U postgres czo 2>/dev/null || true
```

- [ ] **Step 3: Run migrations against `czo`**

Run:
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/czo" pnpm migrate
```
Expected: each of the 8 modules prints `migrations applied successfully!` (auth, translation, attribute, stock-location, channel, price, inventory, product).

- [ ] **Step 4: Re-run to verify idempotency**

Run the same command again.
Expected: completes with no new migrations applied (drizzle-kit reports nothing pending), exit 0.

- [ ] **Step 5: Tear down + commit**

```bash
docker compose -f docker-compose.dev.yml down
git add package.json
git commit -m "chore(deploy): add root migrate script (per-module drizzle-kit, sequential)"
```

---

### Task 2: `.dockerignore` + `life` image (API + worker)

**Files:**
- Create: `.dockerignore` (root)
- Create: `apps/life/Dockerfile`

**Interfaces:**
- Consumes: root `migrate` script (Task 1) is present in the image for the pre-deploy command.
- Produces: image `czo-life` whose default command serves the API (`pnpm --filter @czo/life start`); the worker reuses this image with command `pnpm --filter @czo/life worker`.

- [ ] **Step 1: Write `.dockerignore`**

Create `.dockerignore`:

```
**/node_modules
**/dist
**/.turbo
**/.next
**/.output
**/coverage
**/*.log
.git
.github
.claude
scratchpad
**/.env
**/.env.*
```

- [ ] **Step 2: Write `apps/life/Dockerfile`**

Create `apps/life/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
ARG NODE_VERSION=24

# --- build: install workspace + build every @czo/* dist ---
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# --- runtime: tsx-on-source; keeps node_modules (tsx) + built dist ---
FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
COPY --from=build /app /app
EXPOSE 4000
# Worker reuses this image with: pnpm --filter @czo/life worker
CMD ["pnpm", "--filter", "@czo/life", "start"]
```

- [ ] **Step 3: Build the image**

Run (from repo root):
```bash
docker build -f apps/life/Dockerfile -t czo-life .
```
Expected: build completes; final stage tagged `czo-life`. (First build is slow — full install + `pnpm build`.)

- [ ] **Step 4: Run the API container against Postgres + verify `/health`**

```bash
docker compose -f docker-compose.dev.yml up -d postgres
until docker exec c-zo-postgres-1 pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
docker exec c-zo-postgres-1 createdb -U postgres czo 2>/dev/null || true
docker run -d --name life-test --network host \
  -e DATABASE_URL="postgresql://postgres:postgres@localhost:5432/czo" \
  -e AUTH_SECRET="$(head -c48 /dev/urandom | base64 | tr -d '/+=' | head -c48)" \
  -e AUTH_APP=life -e PORT=4000 czo-life
sleep 8
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/health
```
Expected: `200`. (`curl http://127.0.0.1:4000/health` → `{"ok":true,"app":"life"}`.)

- [ ] **Step 5: Verify the pre-deploy migrate runs inside the image**

Run:
```bash
docker run --rm --network host \
  -e DATABASE_URL="postgresql://postgres:postgres@localhost:5432/czo" \
  czo-life pnpm migrate
```
Expected: exit 0; migrations idempotent (already applied in Step 4's boot path or here).

- [ ] **Step 6: (Gated on #155) Verify the worker command starts**

> Only passes once PR #155 is merged into the branch base. On `main` as-is, expect the documented `Persistence` crash — record it and move on.

```bash
docker run -d --name worker-test --network host \
  -e DATABASE_URL="postgresql://postgres:postgres@localhost:5432/czo" \
  -e AUTH_SECRET="x-at-least-32-chars-xxxxxxxxxxxxxxxx" \
  -e AUTH_APP=life czo-life pnpm --filter @czo/life worker
sleep 8
docker logs worker-test 2>&1 | tail -5
```
Expected (post-#155): logs `life worker: 1 consumer(s) — product:unadopt-cleanup`, container stays `Up`.

- [ ] **Step 7: Clean up + commit**

```bash
docker rm -f life-test worker-test 2>/dev/null || true
docker compose -f docker-compose.dev.yml down
git add .dockerignore apps/life/Dockerfile
git commit -m "feat(deploy): life Dockerfile (API + worker image) + .dockerignore"
```

---

### Task 3: `tour` image

**Files:**
- Create: `apps/tour/Dockerfile`

**Interfaces:**
- Consumes: `.dockerignore` (Task 2).
- Produces: image `czo-tour` serving the admin UI on `:3000`, reaching `life` via `LIFE_URL`.

- [ ] **Step 1: Write `apps/tour/Dockerfile`**

Create `apps/tour/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
ARG NODE_VERSION=24

# --- build: install workspace + vite build (Nitro standalone) ---
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# --- runtime: standalone server bundle, no node_modules needed ---
FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
COPY --from=build /app/apps/tour/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server/server.js"]
```

- [ ] **Step 2: Build the image**

Run:
```bash
docker build -f apps/tour/Dockerfile -t czo-tour .
```
Expected: build completes; `apps/tour/dist/server/server.js` produced and copied; tagged `czo-tour`.

- [ ] **Step 3: Run + verify it serves**

```bash
docker run -d --name tour-test -p 3000:3000 \
  -e LIFE_URL="http://127.0.0.1:4000" -e PORT=3000 czo-tour
sleep 5
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/
```
Expected: a successful HTTP status — `200`, or `307`/`302` redirect to `/login` (the root route guard redirects unauthenticated users). Any of these confirms the server bundle runs standalone.

- [ ] **Step 4: Confirm standalone (no missing-module crash)**

Run:
```bash
docker logs tour-test 2>&1 | grep -iE "Cannot find|MODULE_NOT_FOUND|error" || echo "clean"
```
Expected: `clean` (no missing-module errors → the Nitro bundle is self-contained).

- [ ] **Step 5: Clean up + commit**

```bash
docker rm -f tour-test
git add apps/tour/Dockerfile
git commit -m "feat(deploy): tour Dockerfile (Nitro standalone)"
```

---

### Task 4: Coolify operator guide

**Files:**
- Create: `docs/deployment/coolify.md`

**Interfaces:**
- Consumes: the `migrate` script (Task 1) and both Dockerfiles (Tasks 2–3).
- Produces: a step-by-step runbook an operator follows in the Coolify UI.

- [ ] **Step 1: Write the guide**

Create `docs/deployment/coolify.md` with these sections (fill with the concrete values below — no placeholders beyond the operator's own domains):

````markdown
# Deploying c-zo on Coolify

Four resources on one shared network: **postgres** (DB `czo`), **life** (API,
public), **life-worker** (same image, no public port), **tour** (admin UI,
public). Only Postgres is stateful.

> **Prerequisite:** the worker requires PR #155 (worker `Persistence` fix)
> merged. `life` + `tour` deploy without it.

## 1. Postgres
Create a Coolify PostgreSQL 17 resource. Set DB name `czo`. Note the
internal connection string → this is `DATABASE_URL` for life + worker.

## 2. life (API)
- New resource → **Dockerfile**, repo = this repo, branch = `main`,
  **Dockerfile path** `apps/life/Dockerfile`, **build context** `/` (repo root).
- **Pre-deployment command:** `pnpm migrate`
- **Port:** `4000`. Attach a public domain (TLS via Coolify).
- **Network:** attach the shared network (so tour/worker resolve `life`).
- **Env:**
  - `DATABASE_URL` = (from Postgres)
  - `AUTH_SECRET` = a generated ≥32-char secret
  - `AUTH_APP` = `life`
  - `NODE_ENV` = `production`
  - `HOST` = `0.0.0.0`, `PORT` = `4000`
  - `TRUSTED_PROXY_HOPS` = `1`
  - (optional) `EMAIL_TRANSPORT` / `SMTP_*`
- Deploy → verify `GET https://<life-domain>/health` → `{"ok":true,"app":"life"}`.

## 3. life-worker
- New resource from the **same** Dockerfile (`apps/life/Dockerfile`) + repo/branch.
- **Start/Run command override:** `pnpm --filter @czo/life worker`
- **No public port**, **no** pre-deployment command (life owns migrations).
- Same shared network. **Env:** `DATABASE_URL`, `AUTH_SECRET` (identical to life),
  `AUTH_APP=life`, `NODE_ENV=production`.
- Deploy → logs show `life worker: N consumer(s)`, container stays up.

## 4. tour (admin UI)
- New resource → **Dockerfile**, **Dockerfile path** `apps/tour/Dockerfile`,
  build context `/`.
- **Port:** `3000`. Public domain (TLS via Coolify). Shared network.
- **Env:**
  - `LIFE_URL` = `http://life:4000` (internal service DNS)
  - `NODE_ENV` = `production`, `HOST` = `0.0.0.0`, `PORT` = `3000`
  - (optional, build-time) `VITE_TOLGEE_API_URL` / `VITE_TOLGEE_API_KEY`
    — omit to ship the bundled `src/i18n/*.json`.
- Deploy → open `https://<tour-domain>/login`, sign in, reach `/users`.

## Deploy order
1. Postgres → 2. life (migrates then boots) → 3. life-worker → 4. tour.

## Follow-ups
- **Observability:** deploy `docker/observability/` and set
  `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318` on life + worker
  (depends on PR #155).
- **Scaling life >1 replica:** rate-limit + persistence are in-memory
  (per-instance) — move to Redis-backed first.
````

- [ ] **Step 2: Verify internal consistency**

Re-read the guide against `docs/superpowers/specs/2026-06-23-coolify-deployment-design.md`:
confirm env var names, ports (4000/3000), DB name `czo`, the worker command
`pnpm --filter @czo/life worker`, and the pre-deploy `pnpm migrate` all match.
Expected: no mismatches.

- [ ] **Step 3: Commit**

```bash
git add docs/deployment/coolify.md
git commit -m "docs(deploy): Coolify operator guide for life + tour"
```

---

## Notes for the implementer

- Docker builds are slow (full monorepo install + `pnpm build`) — that's expected; don't "optimize" the Dockerfile mid-task.
- Do **not** add layer-caching tricks (copying package.jsons first) in this pass — correctness first; caching is a follow-up.
- The `life` runtime image intentionally keeps dev deps (`tsx` is required at runtime). Do not prune.
- Telemetry stays off — never set `OTEL_EXPORTER_OTLP_ENDPOINT` in these tasks.
