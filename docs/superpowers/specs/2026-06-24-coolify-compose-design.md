# Coolify Docker Compose Deployment — Design Spec

**Date:** 2026-06-24
**Status:** Approved (design), pending implementation plan
**Related:** PR #156 (per-resource Dockerfiles + `docs/deployment/coolify.md`), PR #155 (observability)

## Goal

Provide a single `docker-compose.yml` at the repo root that Coolify deploys as **one Docker Compose resource**, standing up the three application services (`life`, `life-worker`, `tour`) plus a one-shot `migrate` job — as an alternative to the existing four-separate-resources flow documented in `docs/deployment/coolify.md`.

Postgres is **not** part of the compose: it stays a Coolify-managed database resource (for its backup/restore UI), and its connection string is injected as `DATABASE_URL`.

## Non-Goals (YAGNI)

- **No Postgres service** in the compose — managed DB resource, referenced by `DATABASE_URL`.
- **No observability stack** — already separate in `docker/observability/`.
- **No reverse-proxy / TLS** — Coolify's proxy provides routing and certificates.
- **No replacement** of the four-resource runbook — both options coexist; the compose is documented as "Option B".
- **No local-dev concern** — `docker-compose.dev.yml` remains the dev story; this file targets Coolify deployment.

## Architecture

Four services in one Coolify-managed network. Three of them share a **single built image** (`czo/life:latest`); `tour` builds its own.

```
migrate (one-shot) ──► life ──► tour
                        │
                        └─────► life-worker
```

- **`migrate`** — built `czo/life` image, runs `pnpm migrate`, exits 0. `restart: "no"`.
- **`life`** — same image, GraphQL API on `:4000`, public FQDN, healthcheck on `/health`. Starts only after `migrate` completes successfully.
- **`life-worker`** — same image, `pnpm --filter @czo/life worker`, no exposed port, no domain. Starts after `migrate` completes.
- **`tour`** — own image, admin UI on `:3000`, public FQDN, `LIFE_URL=http://life:4000` (internal DNS). Starts after `life` is healthy.

### Single shared image

The `life` Dockerfile (`apps/life/Dockerfile`) produces one image used by three services. To avoid building it three times:

- `life` declares both `build:` and `image: czo/life:latest`.
- `migrate` and `life-worker` reference `image: czo/life:latest` with `pull_policy: never` (never attempt a registry pull) and **no** `build:`.

Compose builds the image once (the only `build:` among the three) before starting any service, so `migrate` and `life-worker` reuse the already-built local image. `tour` builds independently from `apps/tour/Dockerfile`.

### Migration ordering

`migrate` runs `pnpm migrate` — the root script that applies all module migrations except the orphan `@czo/app` (`pnpm -r --workspace-concurrency=1 --filter "./packages/modules/*" --filter "!@czo/app" run migrate:latest`). `life` and `life-worker` both gate on `migrate` via:

```yaml
depends_on:
  migrate:
    condition: service_completed_successfully
```

This replaces the per-resource "pre-deployment command" used in the four-resource flow.

### Healthchecks

Neither Dockerfile defines `HEALTHCHECK`, so the compose defines them (required for the `service_healthy` gate and for Coolify health monitoring). Both images are `node:24-slim` (no `curl`/`wget`), so probes use Node's global `fetch`:

- **`life`** — `node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`. `tour` gates on `life: { condition: service_healthy }`.
- **`tour`** — `node -e "fetch('http://localhost:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"` (the `/login` route returns 200; `/` returns a 307 redirect).

## Secrets & Domains (Coolify conventions)

Coolify auto-generates `SERVICE_<TYPE>_<IDENTIFIER>` variables and shares them across services in the stack. Required external values use `${VAR:?}` (deployment blocks if unset).

| Variable | Service(s) | Source |
|---|---|---|
| `DATABASE_URL=${DATABASE_URL:?}` | migrate, life, life-worker | Managed Postgres internal connection string (set in Coolify UI) |
| `AUTH_SECRET=${SERVICE_PASSWORD_64_AUTH:?}` | life, life-worker | Coolify-generated 64-char secret, **generated once, reused across both services** — satisfies the "same secret on both" constraint |
| `AUTH_APP=life` | life, life-worker | literal |
| `NODE_ENV=production` | all app services | literal (also set in Dockerfiles) |
| `HOST=0.0.0.0`, `PORT` | life (4000), tour (3000) | literal (also set in Dockerfiles) |
| `TRUSTED_PROXY_HOPS=1` | life | literal (Coolify proxy hop) |
| `LIFE_URL=http://life:4000` | tour | internal service DNS |
| `SERVICE_FQDN_LIFE_4000` | life | public domain (Coolify proxy + TLS) |
| `SERVICE_FQDN_TOUR_3000` | tour | public domain (Coolify proxy + TLS) |
| `VITE_TOLGEE_API_URL`, `VITE_TOLGEE_API_KEY` | tour (build args, optional) | omitted → bundled EN/FR JSON ships |

`life-worker` exposes no port and gets no FQDN.

⚠️ **`AUTH_SECRET` security note** (carried from the runbook): `life` has a hardcoded dev fallback secret; the `${SERVICE_PASSWORD_64_AUTH:?}` magic var ensures a unique generated secret is always present in production. The worker fails fast when it is unset.

## Target Artifact

`docker-compose.yml` (repo root):

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

> No top-level `networks:` or `volumes:` — Coolify creates the stack network (named by resource UUID) and Postgres is external.

## Documentation Changes

`docs/deployment/coolify.md` gains a section **"Option B: Single Docker Compose resource"** after the existing four-resource flow:

- When to choose it (one resource to manage vs. independent scaling/visibility of four).
- Coolify steps: create a *Docker Compose* resource, point it at `docker-compose.yml`, attach the managed Postgres, set `DATABASE_URL`, assign domains to `life` and `tour` (which populates `SERVICE_FQDN_*`), let Coolify generate `AUTH_SECRET`.
- Note that migrations run automatically via the `migrate` service (no separate pre-deploy command).
- Verification: same `/health` and `/login` checks.

The four-resource flow stays as "Option A".

## Verification

Because the target is a Coolify-specific compose (magic vars, managed DB), full verification happens on Coolify. Locally we can validate the compose is well-formed and the build/ordering work with explicit values:

- `docker compose -f docker-compose.yml config` parses with no errors.
- With a throwaway Postgres and real env values, `docker compose up --build` builds `czo/life` **once**, `migrate` runs and exits 0, `life` becomes healthy, `tour` becomes healthy, `life-worker` stays up. (`DATABASE_URL` pointed at the throwaway DB; `SERVICE_PASSWORD_64_AUTH`/`SERVICE_FQDN_*` supplied as plain env for the local run.)
