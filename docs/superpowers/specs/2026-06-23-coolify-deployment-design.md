# Coolify Deployment — `life` + `tour`

- **Date:** 2026-06-23
- **Status:** Approved design (pending spec review)
- **Branch:** `feat/coolify-deploy` (off `main`)

## Goal

Deploy the `life` backend (h3 + Effect 4) and the `tour` admin UI (TanStack
Start) to a self-hosted **Coolify** instance, including `life`'s durable-job
**worker** process, backed by a Coolify-managed PostgreSQL.

Targets `main` as-is. Apps are deployable without PR #155 (observability); that
work is an additive follow-up (see Out of scope).

## Topology

Four Coolify resources on one shared Docker network:

```
            ┌─────────── public ───────────┐
   clients ─┤ life  (API: GraphQL + /api/auth)
   admins  ─┤ tour  (admin UI)
            └──────────────────────────────┘
                  │ internal http://life:4000
   tour ──────────┘  (server-side admin GraphQL)

   life ─┐
   worker ├──► postgres  (DB: czo)   [internal only]
   tour ─┘
```

1. **postgres** — Coolify-managed PostgreSQL 17, DB `czo` → provides `DATABASE_URL`. The only stateful dependency (job queue = SQL; rate-limit + persistence = in-memory; no Redis/RabbitMQ).
2. **life (API)** — public domain. Serves the storefront/public GraphQL sub-graphs + `/api/auth`. Runs DB migrations as a pre-deployment command.
3. **life-worker** — the **same image** as `life`, start command overridden to the worker entrypoint. No public port; drains durable job queues (e.g. `product:unadopt-cleanup`).
4. **tour (admin UI)** — public domain. Reaches `life`'s admin GraphQL **internally** (`LIFE_URL=http://life:4000`); the admin sub-graph is never exposed publicly.

## Packaging — Dockerfiles (per app, built from repo root)

The monorepo is pnpm@10.17.1 + Turborepo. `life` has **no build step** — it runs
`node --import tsx src/main.ts` — but its `@czo/*` workspace deps must be built
to `dist/` first (`turbo build`). `tsx` is a devDependency, so the `life` runtime
image must retain dev deps. `tour` builds via Vite to a Nitro **standalone**
bundle (`dist/server/server.js`) that needs no `node_modules` at runtime.

### `apps/life/Dockerfile`
- **build** stage (`node:24-slim`): `corepack enable` + activate pnpm@10.17.1; copy whole repo (root context); `pnpm install --frozen-lockfile`; `pnpm build` (turbo builds every `@czo/*` `dist`).
- **runtime** stage (`node:24-slim`): copy `/app` from build (node_modules incl. `tsx` + built dist + TS source). `WORKDIR /app`; `ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000`; `EXPOSE 4000`; `CMD ["pnpm","--filter","@czo/life","start"]`.
- **worker**: reuse this exact image; Coolify start-command override → `pnpm --filter @czo/life worker`.
- *Note:* keeping dev deps inflates the image. Optimization (move `tsx` to deps + prune, or compile to JS) is a follow-up, not in this scope.

### `apps/tour/Dockerfile`
- **build** stage (`node:24-slim`): pnpm install; `pnpm build --filter @czo/tour...` (builds `@workspace/ui`/kit deps, then `vite build`). Uses the committed `src/graphql/gen/*` + `admin.graphql` — no codegen step needed.
- **runtime** stage (`node:24-slim`): copy `apps/tour/dist` only; `ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000`; `EXPOSE 3000`; `CMD ["node","dist/server/server.js"]`.

### `.dockerignore` (root)
Exclude `**/node_modules`, `**/dist`, `**/.next`, `**/.turbo`, `**/coverage`,
`.git`, `.claude`, `**/*.log`, scratchpad/temp.

## Migrations

Per-module `drizzle-kit migrate` (no aggregate today). Add a root `package.json`
script `migrate` that runs each module's migration **sequentially** against
`DATABASE_URL` (e.g. iterate `packages/modules/*` invoking their `migrate:latest`).
Must be runnable inside the `life` image.

Wire as the **Pre-deployment Command** on the `life` Coolify resource:
`pnpm migrate`. It runs in the new image, against `DATABASE_URL`, before the new
container takes traffic. Idempotent (drizzle-kit tracks applied migrations).
`life-worker` does **not** migrate (life owns it).

## Environment matrix

| Var | life | worker | tour | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | ✓ | ✓ | — | from the Coolify Postgres |
| `AUTH_SECRET` | ✓ | ✓ | — | ≥32 chars, generate; identical across life+worker |
| `AUTH_APP` | `life` | `life` | — | |
| `NODE_ENV` | `production` | `production` | `production` | gates OpenAPI docs off on life |
| `HOST` | `0.0.0.0` | — | `0.0.0.0` | |
| `PORT` | `4000` | — | `3000` | |
| `TRUSTED_PROXY_HOPS` | `1` | — | — | behind Coolify proxy → correct client IP for rate-limit |
| `LIFE_URL` | — | — | `http://life:4000` | internal network DNS |
| `EMAIL_TRANSPORT` / `SMTP_*` | optional | optional | — | else dev log transport (emails skipped) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_SERVICE_NAME` | optional | optional | — | off unless set (see follow-up) |
| `VITE_TOLGEE_API_URL` / `VITE_TOLGEE_API_KEY` | — | — | optional (build) | absent → bundled `src/i18n/*.json` |

## Networking & domains

- All four resources share one Coolify network.
- `life`: public domain (e.g. `api.<domain>`), TLS via Coolify proxy.
- `tour`: public domain (e.g. `admin.<domain>`), TLS via Coolify proxy.
- `tour → life`: server-side via internal `http://life:4000` (`LIFE_URL`); admin GraphQL not public.
- `TRUSTED_PROXY_HOPS=1` on life so `X-Forwarded-For` resolves the real client IP behind Coolify's reverse proxy (rate-limit keying).

## Deploy order

1. Create Postgres (DB `czo`); capture `DATABASE_URL`.
2. Deploy **life**: set env, set pre-deploy command `pnpm migrate`, deploy → migrates then boots. Verify `GET /health`.
3. Deploy **life-worker**: same image, override start command, same env, deploy. Verify logs show consumers + stays alive.
4. Deploy **tour**: set `LIFE_URL` + env, deploy. Verify `/login` → `/users`.

## Verification

- **life**: `GET /health` → `{ok:true,app:"life"}`; a GraphQL query on `/graphql`; `/api/auth/sign-in`.
- **worker**: logs `N consumer(s)`, process stays alive (no `Persistence` crash — requires PR #155's fix, see Out of scope).
- **tour**: load `/login`, sign in, reach `/users` (server-side fetch to life succeeds).

## Out of scope / follow-ups

- **Observability**: deploying `docker/observability/` + setting `OTEL_EXPORTER_OTLP_ENDPOINT` — additive, depends on PR #155.
- **Worker `Persistence` fix** (PR #155): on `main` the worker crashes forking consumers (`Service not found: effect/persistence/Persistence`). The worker resource will not process jobs until #155 merges. **Recommend merging #155 before relying on the worker.**
- **Horizontal scale of life**: in-memory rate-limit + persistence are per-instance; revisit (Redis-backed) before running >1 life replica.
- **Image-size optimization** for the `life` image (tsx-in-runtime).
- **Redis / RabbitMQ**: not required by current code.

## Deliverables

1. `apps/life/Dockerfile`
2. `apps/tour/Dockerfile`
3. `.dockerignore` (root)
4. root `package.json` `migrate` script
5. `docs/.../coolify-deployment.md` operator guide (this design + step-by-step Coolify setup)
