# OpenAPI + Scalar for h3 REST routes — Design

**Date:** 2026-05-29
**Branch:** feat/sp1-auth
**Status:** Approved (pending spec review)

## Goal

Expose an OpenAPI 3.1 document describing the application's **h3 REST
endpoints**, and serve a [Scalar](https://scalar.com) API Reference UI that
renders it. Scope is limited to plain h3 REST routes — GraphQL (Yoga) is
unaffected and is not mirrored into OpenAPI.

## Non-goals (v1)

- Auto-deriving `parameters` from the path string. Operations are hand-written.
- Security schemes / auth integration in the document.
- Request/response schema validation from the OpenAPI fragment.
- Mirroring GraphQL operations as REST.
- Self-hosting the Scalar JS bundle (CDN only; self-hosting is a later option).

## Design decisions (resolved)

| Decision | Choice |
|----------|--------|
| API surface | h3 REST endpoints only |
| Spec source | Per-route metadata, manually written |
| Serving | `buildApp` option, kit mounts the routes |
| Module API | Declarative `routes?: ApiRoute[]` on the `Module` contract |
| UI path default | `/reference` |
| JSON path default | `/openapi.json` |
| Duplicate `(method, path)` | Log a warning at boot; last operation wins in the doc |
| Production exposure | **Gated off in production** by default; explicit `enabled` overrides |
| Scalar delivery | CDN script (`@scalar/api-reference`), `cdn` overridable |
| Dependency | `openapi-types` (types-only, devDependency); no runtime npm dep |

## Architecture

### New kit concern: `@czo/kit/openapi`

New subpath export (mirrors `@czo/kit/module`, `/graphql`, `/db`, `/email`):

- Add `"./openapi"` to `packages/kit/package.json` `exports`.
- Add `'src/openapi/index'` to `packages/kit/build.config.ts` `entries`.

Files under `packages/kit/src/openapi/`:

**`route.ts`** — the per-route unit.

```ts
import type { EventHandler } from 'h3'
import type { OpenAPIV3_1 } from 'openapi-types'

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

export interface ApiRoute {
  readonly method: HttpMethod
  /** h3-style path, e.g. '/widgets/:id'. Converted to '{id}' in the document. */
  readonly path: string
  /** Hand-written OpenAPI Operation Object (summary, tags, params, responses…). */
  readonly operation: OpenAPIV3_1.OperationObject
  /** Plain h3 handler — same shape `defineHandler` produces. */
  readonly handler: EventHandler
}

/** Identity helper for inference at the definition site. */
export function defineApiRoute(route: ApiRoute): ApiRoute {
  return route
}
```

**`document.ts`** — pure document builder.

```ts
import type { OpenAPIV3_1 } from 'openapi-types'
import type { ApiRoute } from './route'

export interface OpenApiInfo {
  readonly title: string
  readonly version: string
  readonly description?: string
}

/** Convert h3 ':param' segments to OpenAPI '{param}'. */
function toOpenApiPath(path: string): string { /* :id -> {id} */ }

/**
 * Build an OpenAPI 3.1 document from the aggregated route list.
 * Pure — no failure path. Duplicate (method, path) handling is the
 * caller's concern (buildApp logs a warning); here last write wins.
 */
export function buildOpenApiDocument(
  routes: readonly ApiRoute[],
  info: OpenApiInfo,
): OpenAPIV3_1.Document { /* nest paths[path][method] = operation, attach info */ }
```

**`scalar.ts`** — Scalar UI HTML.

```ts
export interface ScalarOptions {
  readonly jsonUrl: string          // e.g. '/openapi.json'
  readonly title?: string
  readonly cdn?: string             // default jsDelivr @scalar/api-reference
}

/** Returns a full HTML document that loads Scalar from CDN and points it
 *  at `jsonUrl` via `Scalar.createApiReference('#app', { url })`. */
export function scalarHtml(opts: ScalarOptions): string { /* … */ }
```

Reference HTML (from Scalar docs):

```html
<!doctype html>
<html>
  <head><title>API Reference</title><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" /></head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>Scalar.createApiReference('#app', { url: '/openapi.json' })</script>
  </body>
</html>
```

**`index.ts`** — re-exports `ApiRoute`, `defineApiRoute`, `buildOpenApiDocument`,
`scalarHtml`, and the option types.

### Contract change — `packages/kit/src/module/contract.ts`

Add to the `Module` interface:

```ts
/**
 * Declarative REST routes. Each entry is registered on the host h3 app
 * AND aggregated into the OpenAPI document (when `buildApp({ openapi })`
 * is set), keeping path/method/operation a single source of truth.
 * The imperative `http(app)` hook remains for non-REST needs
 * (middleware, catch-alls, etc.).
 */
readonly routes?: readonly ApiRoute[]
```

### `buildApp` changes — `packages/kit/src/module/app.ts`

New option on `BuildAppOptions`:

```ts
readonly openapi?: {
  readonly title: string
  readonly version: string
  readonly description?: string
  readonly jsonPath?: string   // default '/openapi.json'
  readonly uiPath?: string     // default '/reference'
  readonly cdn?: string
  /**
   * Force exposure on/off. When undefined, defaults to
   * `process.env.NODE_ENV !== 'production'` (gated off in prod).
   */
  readonly enabled?: boolean
}
```

Inside the boot effect, after module `http` hooks register (so behaviour is
predictable) and before `serve()`:

1. **Aggregate** `const apiRoutes = options.modules.flatMap(m => m.routes ?? [])`.
2. **Conflict check**: detect duplicate `(method, path)` pairs; `Effect.logWarning`
   each duplicate (e.g. `OpenAPI: duplicate route POST /widgets — last wins`).
3. **Register** each route on h3: `httpApp[route.method](toH3Path(route.path), route.handler)`.
   (`toH3Path` keeps the `:param` form for h3; only the document converts to `{param}`.)
4. **If `openapi` resolved-enabled**:
   - `const doc = buildOpenApiDocument(apiRoutes, { title, version, description })`
   - `httpApp.get(jsonPath, defineHandler(() => doc))`
   - `httpApp.get(uiPath, defineHandler(() => new Response(scalarHtml({ jsonUrl: jsonPath, title }), { headers: { 'content-type': 'text/html' } })))`

   Resolved-enabled = `openapi.enabled ?? (process.env.NODE_ENV !== 'production')`.

Routes get the existing `event.context.runEffect` middleware (installed earlier
in the boot effect), so handlers can drive the Effect runtime exactly like the
GraphQL context does.

## Data flow

```
boot
  └─ buildApp
       ├─ collect modules[].routes  ──┐
       │                              ├─► register handlers on h3  (:param form)
       │                              └─► buildOpenApiDocument()   ({param} form)
       │                                      │
       │                                      ├─► GET /openapi.json  → document
       │                                      └─► GET /reference     → Scalar HTML
       └─ serve(h3)
```

Single source of truth: each `ApiRoute` feeds both the registrar and the
document builder. No drift between docs and live routes.

## Error handling

- `buildOpenApiDocument` is pure; no failure path.
- Duplicate `(method, path)` across modules → boot-time `Effect.logWarning`;
  the document keeps the last operation, and h3 registers both (h3 may also warn).
- Production gate: when not enabled, neither `/openapi.json` nor `/reference`
  is mounted at all (no 403 handler — they simply don't exist).

### Security note — CDN script integrity

The Scalar UI loads `@scalar/api-reference` from a CDN, which exposes the page
to CDN compromise (no Subresource Integrity). Mitigations, in order of effort:

1. The UI is **gated off in production** by default, so the exposure is limited
   to dev/preview environments.
2. The `cdn` option allows **pinning a specific version** (`@scalar/api-reference@x.y.z`),
   at which point an `integrity="sha384-…"` + `crossorigin="anonymous"` pair can
   be added to the `<script>` tag. v1 uses the unpinned `@latest` tag (no SRI);
   pinning + SRI is a documented follow-up.
3. Self-hosting the bundle (the existing follow-up) removes the CDN entirely.

## Testing

Unit (plain `vitest`, pure):
- `buildOpenApiDocument`: `:id` → `{id}` conversion; multiple methods on one
  path nest under the same `paths` key; `info`/`tags` attached; empty route
  list yields a valid empty-`paths` document.
- `scalarHtml`: output contains the configured `jsonUrl` and `cdn`.
- `toH3Path` / path helpers as needed.

Integration (light, kit-level):
- Boot a minimal app with one sample `ApiRoute` and `openapi` enabled; assert
  `GET /openapi.json` returns the expected document shape and `GET /reference`
  returns HTML.
- With `enabled: false` (or `NODE_ENV=production`), assert both paths 404.

## Files touched

| File | Change |
|------|--------|
| `packages/kit/src/openapi/route.ts` | new — `ApiRoute`, `defineApiRoute` |
| `packages/kit/src/openapi/document.ts` | new — `buildOpenApiDocument`, path conversion |
| `packages/kit/src/openapi/scalar.ts` | new — `scalarHtml` |
| `packages/kit/src/openapi/index.ts` | new — re-exports |
| `packages/kit/src/openapi/*.test.ts` | new — unit tests |
| `packages/kit/src/module/contract.ts` | add `routes?` to `Module` |
| `packages/kit/src/module/app.ts` | aggregate/register routes; mount json + Scalar; `openapi` option |
| `packages/kit/package.json` | add `./openapi` export + `openapi-types` devDep |
| `packages/kit/build.config.ts` | add `src/openapi/index` entry |
| `apps/life/src/main.ts` | pass `openapi: { title, version }` to `buildApp` (demo/enablement) |

## Open follow-ups (not in v1)

- Self-host the Scalar bundle for offline/air-gapped/prod use.
- Optional `parameters` derivation + validation from path/schema.
- Security scheme wiring (bearer/cookie) once REST auth lands.
