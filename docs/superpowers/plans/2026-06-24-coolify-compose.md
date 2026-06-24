# Coolify Docker Compose Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a root `docker-compose.yml` that Coolify deploys as one Docker Compose resource standing up `life`, `life-worker`, `tour`, and a one-shot `migrate` job (Postgres stays a Coolify-managed DB), plus document it as "Option B" in the deployment runbook.

**Architecture:** Four services in one Coolify-managed network. `migrate`, `life`, and `life-worker` share a single built image (`czo/life:latest`); `tour` builds its own. `migrate` runs `pnpm migrate` and exits; `life`/`life-worker` gate on it via `service_completed_successfully`; `tour` gates on `life` being healthy. Secrets/domains use Coolify magic vars.

**Tech Stack:** Docker Compose v2 spec, Coolify, existing `apps/life/Dockerfile` + `apps/tour/Dockerfile` (node:24-slim), root `pnpm migrate` script.

## Global Constraints

- **Commit discipline (project override):** Stage with `git add` only. Do **not** `git commit` per task. One commit happens at the very end after explicit user review. Never `git stash`.
- **No Postgres in the committed compose** — it is a Coolify-managed DB resource, referenced via `DATABASE_URL`.
- **No top-level `networks:` or `volumes:`** in the committed `docker-compose.yml` — Coolify creates the stack network; Postgres is external.
- **Single shared image:** only the `life` service declares `build:` + `image: czo/life:latest`; `migrate` and `life-worker` reference `image: czo/life:latest` with `pull_policy: never` and no `build:`.
- **`tour`** builds its own image from `apps/tour/Dockerfile` as `czo/tour:latest`.
- `AUTH_SECRET=${SERVICE_PASSWORD_64_AUTH:?}` on **both** `life` and `life-worker` (Coolify generates once, reuses across services).
- `DATABASE_URL=${DATABASE_URL:?}` on `migrate`, `life`, `life-worker`.
- Public FQDN signals: `SERVICE_FQDN_LIFE_4000` (life), `SERVICE_FQDN_TOUR_3000` (tour). `life-worker` exposes no port and no domain.
- `tour` reaches the API via `LIFE_URL=http://life:4000` (internal service DNS).
- `migrate` command is exactly `pnpm migrate` (the root script: applies all module migrations except `@czo/app`).
- Both images are `node:24-slim` (no `curl`/`wget`) — healthchecks use Node global `fetch`.
- The compose is **additive**: the existing four-resource flow in `docs/deployment/coolify.md` stays intact (becomes "Option A").

---

### Task 1: Create `docker-compose.yml` and verify the stack runs locally

**Files:**
- Create: `docker-compose.yml` (repo root)
- Scratch (not committed): `scratchpad/dco.verify.yml` (local-only override for verification)

**Interfaces:**
- Consumes: `apps/life/Dockerfile` (builds image, default CMD `pnpm --filter @czo/life start`, `EXPOSE 4000`, health at `GET /health` → `{"ok":true,"app":"life"}`), `apps/tour/Dockerfile` (default CMD `node .output/server/index.mjs`, `EXPOSE 3000`, `/login` → 200, `/` → 307), root `pnpm migrate` script.
- Produces: a deployable `docker-compose.yml` with services `migrate`, `life`, `life-worker`, `tour`.

- [ ] **Step 1: Write `docker-compose.yml`**

Create `docker-compose.yml` at the repo root with exactly this content:

```yaml
services:
  migrate:
    image: czo/life:latest
    pull_policy: never
    command: ["pnpm", "migrate"]
    restart: "no"
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL:?}

  life:
    build:
      context: .
      dockerfile: apps/life/Dockerfile
    image: czo/life:latest
    restart: unless-stopped
    depends_on:
      migrate:
        condition: service_completed_successfully
    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: 4000
      TRUSTED_PROXY_HOPS: 1
      DATABASE_URL: ${DATABASE_URL:?}
      AUTH_SECRET: ${SERVICE_PASSWORD_64_AUTH:?}
      AUTH_APP: life
      SERVICE_FQDN_LIFE_4000: ${SERVICE_FQDN_LIFE_4000}
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  life-worker:
    image: czo/life:latest
    pull_policy: never
    command: ["pnpm", "--filter", "@czo/life", "worker"]
    restart: unless-stopped
    depends_on:
      migrate:
        condition: service_completed_successfully
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL:?}
      AUTH_SECRET: ${SERVICE_PASSWORD_64_AUTH:?}
      AUTH_APP: life

  tour:
    build:
      context: .
      dockerfile: apps/tour/Dockerfile
    image: czo/tour:latest
    restart: unless-stopped
    depends_on:
      life:
        condition: service_healthy
    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: 3000
      LIFE_URL: http://life:4000
      SERVICE_FQDN_TOUR_3000: ${SERVICE_FQDN_TOUR_3000}
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "fetch('http://localhost:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
```

- [ ] **Step 2: Validate the compose parses (with required vars set)**

The `${VAR:?}` syntax makes `config` fail if a required var is unset, so export throwaway values first:

```bash
export DATABASE_URL="postgresql://postgres:postgres@czo-pg:5432/czo"
export SERVICE_PASSWORD_64_AUTH="verifysecretverifysecretverifysecret0123456789ab"
export SERVICE_FQDN_LIFE_4000="localhost"
export SERVICE_FQDN_TOUR_3000="localhost"
docker compose -f docker-compose.yml config >/dev/null && echo "CONFIG OK"
```

Expected: prints `CONFIG OK` with no errors. (If it prints `required variable ... is missing` the exports above are not in this shell.)

- [ ] **Step 3: Stand up a throwaway Postgres on a shared network**

```bash
docker network create czo-verify
docker run -d --name czo-pg --network czo-verify \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=czo postgres:17
# wait until ready
until docker exec czo-pg pg_isready -U postgres -d czo >/dev/null 2>&1; do sleep 1; done
echo "PG READY"
```

Expected: ends with `PG READY`.

- [ ] **Step 4: Write the local-only verification override**

Create `scratchpad/dco.verify.yml` (publishes the otherwise-internal ports and joins the throwaway-PG network so the app containers can reach `czo-pg`):

```yaml
services:
  life:
    ports:
      - "4000:4000"
  tour:
    ports:
      - "3000:3000"
networks:
  default:
    name: czo-verify
    external: true
```

- [ ] **Step 5: Build and start the stack**

```bash
docker compose -f docker-compose.yml -f scratchpad/dco.verify.yml up --build -d
```

Expected: builds `czo/life` and `czo/tour`. In the build output, the `life` image is built **once** and `migrate`/`life-worker` are NOT rebuilt (they reuse `czo/life:latest`). The command returns after containers are created.

- [ ] **Step 6: Verify the single shared image exists**

```bash
docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^czo/(life|tour):latest$' | sort -u
```

Expected: exactly two lines:
```
czo/life:latest
czo/tour:latest
```

- [ ] **Step 7: Verify migrate ran and exited cleanly**

```bash
docker compose -f docker-compose.yml -f scratchpad/dco.verify.yml ps -a --format '{{.Service}} {{.State}} {{.ExitCode}}' | grep migrate
```

Expected: `migrate exited 0` (State `exited`, exit code `0`). If exit code is non-zero, inspect with `docker compose ... logs migrate`.

- [ ] **Step 8: Wait for life + tour to become healthy**

```bash
for svc in life tour; do
  cid=$(docker compose -f docker-compose.yml -f scratchpad/dco.verify.yml ps -q $svc)
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid")" = "healthy" ]; do
    sleep 2; echo "waiting $svc..."
  done
  echo "$svc HEALTHY"
done
```

Expected: ends with `life HEALTHY` then `tour HEALTHY` (allow up to ~60s for first boot).

- [ ] **Step 9: Verify the real surfaces respond**

```bash
echo "--- life /health ---";  curl -fs http://localhost:4000/health; echo
echo "--- tour /login ---";   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/login
echo "--- tour / ---";        curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/
```

Expected:
```
--- life /health ---
{"ok":true,"app":"life"}
--- tour /login ---
200
--- tour / ---
307
```

- [ ] **Step 10: Verify life-worker stayed up**

```bash
docker compose -f docker-compose.yml -f scratchpad/dco.verify.yml ps --format '{{.Service}} {{.State}}' | grep life-worker
docker compose -f docker-compose.yml -f scratchpad/dco.verify.yml logs --tail=5 life-worker
```

Expected: `life-worker running`, and the logs show the worker consumer line (e.g. `life worker: N consumer(s) — <queue names>`) with no crash/restart loop.

- [ ] **Step 11: Tear down the verification environment**

```bash
docker compose -f docker-compose.yml -f scratchpad/dco.verify.yml down
docker rm -f czo-pg
docker network rm czo-verify
rm -f scratchpad/dco.verify.yml
```

Expected: all containers/network removed; only `docker-compose.yml` remains as a change.

- [ ] **Step 12: Stage the compose file**

```bash
git add docker-compose.yml
git status --short
```

Expected: `A  docker-compose.yml` staged. (Do **not** commit — see Global Constraints.)

---

### Task 2: Document "Option B" in the deployment runbook

**Files:**
- Modify: `docs/deployment/coolify.md`

**Interfaces:**
- Consumes: the `docker-compose.yml` from Task 1 (service names `migrate`/`life`/`life-worker`/`tour`, env var names, FQDN magic vars).
- Produces: an "Option B" section; the existing four-resource flow is framed as "Option A".

- [ ] **Step 1: Add a deployment-options pointer near the top**

In `docs/deployment/coolify.md`, immediately after the second intro paragraph (the one ending "...and `life-worker` shares the database with `life`."), insert this paragraph:

```markdown
There are two ways to deploy this on Coolify. **Option A** (the default, documented in sections 1–4 below) creates four independent Coolify resources — most control and per-service visibility. **Option B** (see the section at the end) deploys a single Docker Compose resource — fewer moving parts, one resource to manage. Postgres is a Coolify-managed database resource in both options.
```

- [ ] **Step 2: Add the Option B section before "Security & Runtime Notes"**

In `docs/deployment/coolify.md`, immediately **before** the `## Security & Runtime Notes` heading, insert this section verbatim:

```markdown
## Option B: Single Docker Compose resource

Instead of four separate resources, you can deploy `life`, `life-worker`, and `tour` as one **Docker Compose** resource using the root `docker-compose.yml`. Postgres remains a separate Coolify-managed database (Option B does not put Postgres in the compose, so you keep Coolify's backup/restore UI).

**When to choose it:** one resource to deploy and manage, with migrations wired into the stack. Choose Option A instead if you need to scale or redeploy each service independently.

**Steps:**

1. **Create the managed Postgres** exactly as in section 1 above (database name `czo`). Note its internal connection string.

2. **Create a new resource → Docker Compose.**
   - **Repository:** this repo
   - **Branch:** `main`
   - **Compose file path:** `docker-compose.yml`

3. **Set environment variables on the stack:**
   - `DATABASE_URL` — the managed Postgres internal connection string (required; deployment is blocked until it is set).
   - `SERVICE_PASSWORD_64_AUTH` — leave it for Coolify to **auto-generate**. It becomes `AUTH_SECRET` for both `life` and `life-worker` (one generated secret, shared across both services).

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
```

- [ ] **Step 3: Verify the doc renders and links are coherent**

```bash
grep -n "Option A" docs/deployment/coolify.md
grep -n "## Option B: Single Docker Compose resource" docs/deployment/coolify.md
grep -n "## Security & Runtime Notes" docs/deployment/coolify.md
```

Expected: the "Option A/B" pointer appears in the intro; the `## Option B` heading appears once, positioned **before** `## Security & Runtime Notes`.

- [ ] **Step 4: Stage the doc**

```bash
git add docs/deployment/coolify.md
git status --short
```

Expected: `M  docs/deployment/coolify.md` staged (alongside the staged `docker-compose.yml`). Do **not** commit.

---

## Notes for the executor

- This plan produces **staged** changes only. After both tasks pass review, surface the staged diff to the user and let them decide on the single commit + PR (per project commit discipline).
- The design docs `docs/superpowers/specs/2026-06-24-coolify-compose-design.md` and `docs/superpowers/plans/2026-06-24-coolify-compose.md` are currently untracked; whether to include them in the commit is the user's call.
- The Coolify-specific behavior (magic var generation, domain → `SERVICE_FQDN_*`, managed-DB wiring) can only be fully verified on Coolify itself. Task 1's local run verifies everything that does **not** depend on the Coolify control plane: the compose is valid, the single image builds once, migrations run and exit 0, both apps become healthy through their real HTTP surfaces, and the worker stays up.
```