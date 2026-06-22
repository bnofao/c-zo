# `tour` — Admin (backoffice) foundation — Design

**Date:** 2026-06-21
**Status:** Approved design (pending spec review)
**App:** `apps/tour` — `@czo/tour`
**Audience:** Platform admin (marketplace operator). Consumes `/graphql/admin`.

## 1. Goal

Stand up the platform-admin backoffice `tour` on **TanStack Start**, with a single
read-only vertical slice — **global products list + detail** — that proves the
whole stack end-to-end: admin login → Start server proxy → SSR → relay
connection → data table → detail page.

**Out of scope (later specs):** mutations/CRUD, taxonomy, listing moderation,
locales, platform channels, Playwright E2E, fine-grained role-based nav gating.

## 2. Architecture

All browser traffic terminates at the **TanStack Start server** (same origin as
`tour`). The Start server is the only thing that talks to `life`. This removes
CORS entirely and keeps the httpOnly session cookie server-side.

```
browser ──(same origin)──▶ tour Start server ──(server-to-server, forwards Cookie)──▶ life
                                   │                                                    ├─ /graphql/admin
                                   │                                                    └─ /api/auth/{sign-in,sign-out}
                                   └─ SSR render + TanStack Query dehydration
```

- **SSR and the proxy are one mechanism.** Route loaders run on the Start server;
  they call a server-side GraphQL helper that forwards the incoming request's
  cookie to `life` (in-process during SSR, same-origin proxy on client nav).
  Fetched data is dehydrated into the HTML and hydrated on the client via
  TanStack Query.

### Components

| Unit | Responsibility | Depends on |
|------|----------------|-----------|
| `gqlAdmin(document, variables)` | Server-side typed GraphQL caller. Reads cookie from `getWebRequest()`, POSTs to `${LIFE_URL}/graphql/admin`, returns typed data or throws on GraphQL/HTTP error. | `getWebRequest`, `LIFE_URL`, codegen types |
| Auth proxy server routes | `POST /api/auth/sign-in` & `/sign-out`: forward to `life`, capture its `Set-Cookie`, re-emit on the `tour` origin. | `life` auth REST |
| `_authed` route guard | `beforeLoad`: call `me`; no session → redirect `/login`. | `gqlAdmin`, `me` query |
| Route tree | `/login`, `/_authed/`, `/_authed/products`, `/_authed/products/$productId`. | TanStack Router |
| Query layer | TanStack Query client + Router integration (`ensureQueryData` in loaders, SSR dehydration). | `@tanstack/react-query` |
| UI primitives | shadcn-style button/input/table/card/sidebar added to `@workspace/ui` (shared). | Tailwind 4, `@tanstack/react-table` |

## 3. Backend prerequisite — `me` query (auth module)

There is currently **no `me`/viewer query**. The admin shell needs the current
principal's identity for the session guard and the header. Add a minimal query:

- `me: User` (nullable) — resolves `ctx.auth.session?.user`, returns `null` when
  anonymous.
- No `authScopes` — `me` returns `null` for anonymous callers (it must not
  throw; the guard relies on null → redirect). It only ever exposes the
  caller's own `ctx.auth.user`, so there is no cross-user data to gate.
- `subGraphs: ['account', 'admin']` — reachable from both the account app and `tour`.
- No new service code: reads the already-resolved session principal off `ctx.auth`.

**Security note:** the guard is UX only. Real authorization stays server-side —
every admin query is already gated by its `permission` scope, so a non-admin who
reaches `_authed` simply gets forbidden results, surfaced as an error state.
Fine-grained role-based nav gating is deferred.

## 4. Typed GraphQL (codegen)

Follows the Pothos client-types guide (graphql-codegen **client-preset**).

1. **SDL emit (in `life`):** a script runs `builder.buildSchema('admin')` +
   `emitSDL({ schema, outputPath })` → writes `apps/tour/src/graphql/admin.graphql`
   (committed). Exposed as `pnpm --filter @czo/life emit:sdl`.
2. **codegen (in `tour`):** `codegen.ts` with
   `schema: 'src/graphql/admin.graphql'`, `documents: ['src/**/*.tsx']`,
   `generates: { 'src/graphql/gen/': { preset: 'client' } }`, output committed.
   Exposed as `pnpm --filter @czo/tour codegen`.
3. **Scalars** are mapped explicitly (codegen `config.scalars`) so they don't
   resolve to `any`. The exact set is enumerated from the emitted SDL during
   planning; expected at least: `DateTime → string`, `JSON`/`JSONObject → unknown`,
   `ID → string`.
4. Operations are written with the generated typed `graphql()` function and
   consumed by `gqlAdmin` + TanStack Query.

## 5. Routes

```
/login                          public; form → /api/auth/sign-in proxy → redirect /
/_authed                        guard: beforeLoad → me; no session → redirect /login
/_authed/                       dashboard home (placeholder card)
/_authed/products               paginated list (relay connection → @tanstack/react-table)
/_authed/products/$productId    detail (node by global ID)
```

- **List** uses the admin `products` connection (first/after cursor pagination).
  Loader `ensureQueryData`s the first page; the table renders dehydrated data on
  SSR, paginates client-side via TanStack Query.
- **Detail** resolves the product by global ID via the admin `product(id:)`
  query, 404 state when null.

## 6. Packaging / tooling

- `apps/tour`, package `@czo/tour`, `type: module`, React 19 (catalog).
- **TanStack Start v1** (Vite plugin) + **TanStack Router**. Vite 7 +
  `@vitejs/plugin-react` (both in catalog).
- Tailwind 4 via `@tailwindcss/postcss` + `@workspace/ui/globals.css`.
- Env: `LIFE_URL` (default `http://127.0.0.1:4000`); dev port `3000`.
- Scripts: `dev`, `build`, `start`, `check-types`, `lint`, `codegen`.
- Turbo: `build` outputs wired; `dev` persistent; `codegen` as a normal task.
- Catalog additions: `@tanstack/react-start`, `@tanstack/react-router`,
  `@graphql-codegen/cli` + client-preset (pinned versions chosen in the plan).

## 7. Testing

- **Vitest unit:**
  - `gqlAdmin` forwards the incoming cookie and surfaces GraphQL errors.
  - sign-in proxy captures `life`'s `Set-Cookie` and re-emits it on the `tour` origin.
  - `_authed` guard redirects to `/login` when `me` is null.
  - `me` resolver (auth module): returns the session user; `null` when anonymous.
- **Gates:** `check-types` + `lint` (`--max-warnings 0`).
- **Deferred:** Playwright E2E (login → list → detail) to a later spec.

## 8. Risks / dependencies

1. **`me` query** (§3) — small backend addition; first task of the plan.
2. **TanStack Start maturity** — pin exact catalog versions; verify the Vite
   plugin + React 19 + Tailwind 4 combination builds before wiring the slice.
3. **Admin scalars** — finalized from the emitted SDL during planning.

## 9. Decomposition (future specs, not built here)

Global catalog CRUD · Taxonomy (categories/types/attributes) + request moderation ·
Marketplace listing moderation · Locales/translations · Platform channels.
Each is its own spec → plan → implementation cycle, reusing this foundation.
