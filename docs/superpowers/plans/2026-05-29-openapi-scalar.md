# OpenAPI + Scalar for h3 REST routes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggregate the app's declarative h3 REST routes into one OpenAPI 3.1 document and serve it through a Scalar API Reference UI, gated off in production.

**Architecture:** A new `@czo/kit/openapi` concern provides an `ApiRoute` type, a pure `buildOpenApiDocument` (translating h3 `:id` → OpenAPI `{id}`), a `scalarHtml` page, and a `mountOpenApi` helper that registers routes on a bare `H3` and conditionally mounts the JSON + UI endpoints. Modules declare `routes?: ApiRoute[]`; `buildApp` aggregates them, warns on duplicates, and delegates to `mountOpenApi`. The same route list feeds both h3 registration and the document, so docs never drift from live routes.

**Tech Stack:** TypeScript (strict), Effect-TS, h3 v2 (`2.0.1-rc`), graphql-yoga, `openapi-types` (dev only), Scalar via CDN, `@effect/vitest` + `vitest`.

**Project conventions that override the writing-plans defaults:**
- **No per-task `git commit`.** Each task ends by **staging** with `git add`. A single commit happens at sprint end after explicit user review (CLAUDE.md `No-commit-until-review`).
- Match existing kit style; many small files (200–400 lines).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/kit/src/openapi/route.ts` | `HttpMethod`, `ApiRoute` type, `defineApiRoute` identity helper |
| `packages/kit/src/openapi/document.ts` | `OpenApiInfo`, `toOpenApiPath`, `buildOpenApiDocument`, `findDuplicateRoutes` (pure) |
| `packages/kit/src/openapi/scalar.ts` | `ScalarOptions`, `scalarHtml` (HTML string) |
| `packages/kit/src/openapi/mount.ts` | `OpenApiDocsConfig`, `mountOpenApi(app, routes, docs?)` |
| `packages/kit/src/openapi/index.ts` | Public re-exports for the `@czo/kit/openapi` subpath |
| `packages/kit/src/openapi/document.test.ts` | Unit tests for `toOpenApiPath`, `buildOpenApiDocument`, `findDuplicateRoutes` |
| `packages/kit/src/openapi/scalar.test.ts` | Unit test for `scalarHtml` |
| `packages/kit/src/openapi/mount.test.ts` | Unit tests for `mountOpenApi` via `app.request(...)` |
| `packages/kit/src/module/contract.ts` | Add `routes?: readonly ApiRoute[]` to `Module` |
| `packages/kit/src/module/app.ts` | Add `openapi` option; aggregate routes; warn on dupes; call `mountOpenApi` |
| `packages/kit/package.json` | Add `./openapi` export + `openapi-types` devDependency |
| `packages/kit/build.config.ts` | Add `src/openapi/index` build entry |
| `apps/life/src/main.ts` | Pass `openapi: { title, version }` to `buildApp` (enablement/demo) |

---

## Task 1: Dependency & subpath-export scaffolding

**Files:**
- Modify: `packages/kit/package.json`
- Modify: `packages/kit/build.config.ts`

- [ ] **Step 1: Add `openapi-types` devDependency and the `./openapi` export**

In `packages/kit/package.json`, add to the `exports` object (after the `./email` entry):

```json
    "./openapi": {
      "types": "./src/openapi/index.ts",
      "default": "./dist/openapi/index.mjs"
    }
```

In the same file, add to `devDependencies` (keep alphabetical ordering if present):

```json
    "openapi-types": "^12.1.3"
```

- [ ] **Step 2: Add the build entry**

In `packages/kit/build.config.ts`, add `'src/openapi/index'` to the `entries` array (after `'src/email/index'`):

```ts
  entries: [
    'src/index',
    'src/module/index',
    'src/email/index',
    'src/openapi/index',
    'src/graphql/index',
    'src/db/index',
    'src/db/effect',
  ],
```

- [ ] **Step 3: Install**

Run: `pnpm install`
Expected: lockfile updates, `openapi-types` resolves under `node_modules`. No build runs.

- [ ] **Step 4: Stage**

```bash
git add packages/kit/package.json packages/kit/build.config.ts pnpm-lock.yaml
```

---

## Task 2: `ApiRoute` type + `defineApiRoute` helper

**Files:**
- Create: `packages/kit/src/openapi/route.ts`

- [ ] **Step 1: Write `route.ts`**

```ts
import type { EventHandler } from 'h3'
import type { OpenAPIV3_1 } from 'openapi-types'

/** HTTP methods we expose as REST routes. */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

/**
 * A single declarative REST route. Registered on the host `H3` app AND
 * aggregated into the OpenAPI document, so path/method/operation are a
 * single source of truth.
 */
export interface ApiRoute {
  readonly method: HttpMethod
  /** h3-style path, e.g. `/widgets/:id`. Converted to `{id}` in the document. */
  readonly path: string
  /** Hand-written OpenAPI Operation Object (summary, tags, parameters, responses…). */
  readonly operation: OpenAPIV3_1.OperationObject
  /** Plain h3 handler — the same shape `defineHandler` produces. */
  readonly handler: EventHandler
}

/** Identity helper that gives inference + a stable definition site. */
export function defineApiRoute(route: ApiRoute): ApiRoute {
  return route
}
```

- [ ] **Step 2: Type-check the new file compiles**

Run: `pnpm --filter @czo/kit check-types`
Expected: PASS (no errors referencing `route.ts`). If `@czo/kit` has no `check-types` script, run `pnpm check-types` from the repo root and confirm no new errors in `openapi/route.ts`.

- [ ] **Step 3: Stage**

```bash
git add packages/kit/src/openapi/route.ts
```

---

## Task 3: `buildOpenApiDocument` + path conversion + duplicate detection

**Files:**
- Create: `packages/kit/src/openapi/document.ts`
- Test: `packages/kit/src/openapi/document.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import type { ApiRoute } from './route'
import { buildOpenApiDocument, findDuplicateRoutes, toOpenApiPath } from './document'

const op = (summary: string) => ({ summary, responses: { 200: { description: 'OK' } } })

const route = (method: ApiRoute['method'], path: string): ApiRoute => ({
  method,
  path,
  operation: op(`${method} ${path}`),
  handler: () => ({ ok: true }),
})

describe('toOpenApiPath', () => {
  it('converts h3 :param segments to OpenAPI {param}', () => {
    expect(toOpenApiPath('/widgets/:id')).toBe('/widgets/{id}')
    expect(toOpenApiPath('/orgs/:orgId/members/:userId')).toBe('/orgs/{orgId}/members/{userId}')
  })

  it('leaves static paths unchanged', () => {
    expect(toOpenApiPath('/health')).toBe('/health')
  })
})

describe('buildOpenApiDocument', () => {
  it('nests operations under converted paths by method', () => {
    const doc = buildOpenApiDocument([route('get', '/widgets/:id')], { title: 'T', version: '1.0.0' })
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.info).toEqual({ title: 'T', version: '1.0.0' })
    expect(doc.paths?.['/widgets/{id}']?.get?.summary).toBe('get /widgets/:id')
  })

  it('merges multiple methods on the same path', () => {
    const doc = buildOpenApiDocument(
      [route('get', '/widgets'), route('post', '/widgets')],
      { title: 'T', version: '1.0.0' },
    )
    const item = doc.paths?.['/widgets']
    expect(item?.get).toBeDefined()
    expect(item?.post).toBeDefined()
  })

  it('returns an empty paths object for no routes', () => {
    const doc = buildOpenApiDocument([], { title: 'T', version: '1.0.0' })
    expect(doc.paths).toEqual({})
  })
})

describe('findDuplicateRoutes', () => {
  it('reports each duplicated method+path once', () => {
    const dupes = findDuplicateRoutes([
      route('get', '/widgets'),
      route('get', '/widgets'),
      route('post', '/widgets'),
    ])
    expect(dupes).toEqual(['GET /widgets'])
  })

  it('returns an empty array when all routes are unique', () => {
    expect(findDuplicateRoutes([route('get', '/a'), route('post', '/a')])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @czo/kit test src/openapi/document.test.ts`
Expected: FAIL — `Cannot find module './document'` (file does not exist yet).

- [ ] **Step 3: Write `document.ts`**

```ts
import type { OpenAPIV3_1 } from 'openapi-types'
import type { ApiRoute } from './route'

export interface OpenApiInfo {
  readonly title: string
  readonly version: string
  readonly description?: string
}

/** Convert h3 `:param` segments to OpenAPI `{param}`. */
export function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

/**
 * Build an OpenAPI 3.1 document from the aggregated route list. Pure — no
 * failure path. On a duplicate (method, path) the last operation wins;
 * callers detect duplicates separately via `findDuplicateRoutes`.
 */
export function buildOpenApiDocument(
  routes: readonly ApiRoute[],
  info: OpenApiInfo,
): OpenAPIV3_1.Document {
  const paths: OpenAPIV3_1.PathsObject = {}
  for (const route of routes) {
    const key = toOpenApiPath(route.path)
    const item: OpenAPIV3_1.PathItemObject = paths[key] ?? {}
    item[route.method] = route.operation
    paths[key] = item
  }
  return { openapi: '3.1.0', info, paths }
}

/** Return each duplicated `METHOD /path` label exactly once, in first-seen order. */
export function findDuplicateRoutes(routes: readonly ApiRoute[]): string[] {
  const seen = new Set<string>()
  const reported = new Set<string>()
  const dupes: string[] = []
  for (const route of routes) {
    const label = `${route.method.toUpperCase()} ${route.path}`
    if (seen.has(label)) {
      if (!reported.has(label)) {
        reported.add(label)
        dupes.push(label)
      }
    }
    else {
      seen.add(label)
    }
  }
  return dupes
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @czo/kit test src/openapi/document.test.ts`
Expected: PASS (all 7 tests green).

- [ ] **Step 5: Stage**

```bash
git add packages/kit/src/openapi/document.ts packages/kit/src/openapi/document.test.ts
```

---

## Task 4: `scalarHtml`

**Files:**
- Create: `packages/kit/src/openapi/scalar.ts`
- Test: `packages/kit/src/openapi/scalar.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { scalarHtml } from './scalar'

describe('scalarHtml', () => {
  it('embeds the JSON url and default CDN', () => {
    const html = scalarHtml({ jsonUrl: '/openapi.json' })
    expect(html).toContain('https://cdn.jsdelivr.net/npm/@scalar/api-reference')
    expect(html).toContain("Scalar.createApiReference('#app', { url: \"/openapi.json\" })")
  })

  it('honours a custom cdn and title', () => {
    const html = scalarHtml({ jsonUrl: '/spec', cdn: 'https://example.com/s.js', title: 'My API' })
    expect(html).toContain('https://example.com/s.js')
    expect(html).toContain('<title>My API</title>')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @czo/kit test src/openapi/scalar.test.ts`
Expected: FAIL — `Cannot find module './scalar'`.

- [ ] **Step 3: Write `scalar.ts`**

```ts
export interface ScalarOptions {
  /** URL the UI fetches the OpenAPI document from, e.g. `/openapi.json`. */
  readonly jsonUrl: string
  readonly title?: string
  /** Script URL for the Scalar bundle. Defaults to the jsDelivr `@scalar/api-reference`. */
  readonly cdn?: string
}

/**
 * Full HTML document that loads Scalar from a CDN and points it at
 * `jsonUrl`. Served as `text/html` by the docs route.
 *
 * NB: the default CDN is the unpinned `@latest` tag — no Subresource
 * Integrity. The docs route is gated off in production; pin a version +
 * add `integrity`/`crossorigin` (or self-host) if exposed beyond dev.
 */
export function scalarHtml(opts: ScalarOptions): string {
  const cdn = opts.cdn ?? 'https://cdn.jsdelivr.net/npm/@scalar/api-reference'
  const title = opts.title ?? 'API Reference'
  return `<!doctype html>
<html>
  <head>
    <title>${title}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="app"></div>
    <script src="${cdn}"></script>
    <script>Scalar.createApiReference('#app', { url: ${JSON.stringify(opts.jsonUrl)} })</script>
  </body>
</html>`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @czo/kit test src/openapi/scalar.test.ts`
Expected: PASS (both tests green).

- [ ] **Step 5: Stage**

```bash
git add packages/kit/src/openapi/scalar.ts packages/kit/src/openapi/scalar.test.ts
```

---

## Task 5: `mountOpenApi` — register routes + conditional docs

**Files:**
- Create: `packages/kit/src/openapi/mount.ts`
- Test: `packages/kit/src/openapi/mount.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { H3 } from 'h3'
import { describe, expect, it } from 'vitest'
import type { ApiRoute } from './route'
import { mountOpenApi } from './mount'

const widget: ApiRoute = {
  method: 'get',
  path: '/widgets/:id',
  operation: { summary: 'Get widget', responses: { 200: { description: 'OK' } } },
  handler: event => ({ id: event.context.params?.id }),
}

const docs = { info: { title: 'T', version: '1.0.0' }, jsonPath: '/openapi.json', uiPath: '/reference' }

describe('mountOpenApi', () => {
  it('registers the route handler regardless of docs', async () => {
    const app = new H3()
    mountOpenApi(app, [widget])
    const res = await app.request('/widgets/42')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: '42' })
  })

  it('serves the document and Scalar UI when docs are provided', async () => {
    const app = new H3()
    mountOpenApi(app, [widget], docs)

    const json = await app.request('/openapi.json')
    const doc = await json.json()
    expect(doc.paths['/widgets/{id}'].get.summary).toBe('Get widget')

    const ui = await app.request('/reference')
    expect(ui.headers.get('content-type')).toContain('text/html')
    expect(await ui.text()).toContain('/openapi.json')
  })

  it('does not mount doc endpoints when docs are omitted', async () => {
    const app = new H3()
    mountOpenApi(app, [widget])
    const res = await app.request('/openapi.json')
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @czo/kit test src/openapi/mount.test.ts`
Expected: FAIL — `Cannot find module './mount'`.

- [ ] **Step 3: Write `mount.ts`**

```ts
import type { H3 } from 'h3'
import type { OpenApiInfo } from './document'
import type { ApiRoute } from './route'
import type { ScalarOptions } from './scalar'
import { html } from 'h3'
import { buildOpenApiDocument } from './document'
import { scalarHtml } from './scalar'

export interface OpenApiDocsConfig {
  readonly info: OpenApiInfo
  readonly jsonPath: string
  readonly uiPath: string
  readonly cdn?: ScalarOptions['cdn']
}

/**
 * Register every `ApiRoute` on the h3 app. When `docs` is provided, also
 * mount `GET {jsonPath}` (the OpenAPI document) and `GET {uiPath}` (the
 * Scalar UI). REST routes are always registered; only the doc endpoints
 * are gated by the caller via whether `docs` is passed.
 */
export function mountOpenApi(
  app: H3,
  routes: readonly ApiRoute[],
  docs?: OpenApiDocsConfig,
): void {
  for (const route of routes)
    app.on(route.method, route.path, route.handler)

  if (!docs)
    return

  const document = buildOpenApiDocument(routes, docs.info)
  app.get(docs.jsonPath, () => document)
  app.get(docs.uiPath, () => html(scalarHtml({ jsonUrl: docs.jsonPath, title: docs.info.title, cdn: docs.cdn })))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @czo/kit test src/openapi/mount.test.ts`
Expected: PASS (all 3 tests green).

- [ ] **Step 5: Stage**

```bash
git add packages/kit/src/openapi/mount.ts packages/kit/src/openapi/mount.test.ts
```

---

## Task 6: Public barrel — `openapi/index.ts`

**Files:**
- Create: `packages/kit/src/openapi/index.ts`

- [ ] **Step 1: Write `index.ts`**

```ts
export type { OpenApiInfo } from './document'
export { buildOpenApiDocument, findDuplicateRoutes, toOpenApiPath } from './document'
export type { OpenApiDocsConfig } from './mount'
export { mountOpenApi } from './mount'
export type { ApiRoute, HttpMethod } from './route'
export { defineApiRoute } from './route'
export type { ScalarOptions } from './scalar'
export { scalarHtml } from './scalar'
```

- [ ] **Step 2: Verify the subpath resolves and type-checks**

Run: `pnpm --filter @czo/kit check-types`
Expected: PASS — no errors. (If no per-package script, run `pnpm check-types` from root and confirm no new errors in `openapi/`.)

- [ ] **Step 3: Stage**

```bash
git add packages/kit/src/openapi/index.ts
```

---

## Task 7: Add `routes?` to the `Module` contract

**Files:**
- Modify: `packages/kit/src/module/contract.ts`

- [ ] **Step 1: Add the import**

At the top of `contract.ts`, alongside the existing type imports, add:

```ts
import type { ApiRoute } from '../openapi/route'
```

- [ ] **Step 2: Add the `routes` field to the `Module` interface**

Insert immediately after the `http?` member (before `onStart?`):

```ts
  /**
   * Declarative REST routes. Each entry is registered on the host h3 app
   * AND aggregated into the OpenAPI document (when `buildApp({ openapi })`
   * is configured), keeping path/method/operation a single source of
   * truth. The imperative `http(app)` hook remains for non-REST needs
   * (middleware, catch-alls, proxying).
   */
  readonly routes?: readonly ApiRoute[]
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @czo/kit check-types`
Expected: PASS — no errors.

- [ ] **Step 4: Stage**

```bash
git add packages/kit/src/module/contract.ts
```

---

## Task 8: Wire aggregation + docs into `buildApp`

**Files:**
- Modify: `packages/kit/src/module/app.ts`

- [ ] **Step 1: Add imports**

Near the existing `@czo/kit` imports at the top of `app.ts`, add:

```ts
import process from 'node:process'
import { findDuplicateRoutes, mountOpenApi } from '@czo/kit/openapi'
```

(If `app.ts` already imports `process`, skip that line. Use the relative `../openapi` path only if the package self-import alias is not configured — match how other `@czo/kit/*` imports are written in this file.)

- [ ] **Step 2: Extend `BuildAppOptions`**

Add the `openapi` member to the `BuildAppOptions` interface (after `http?`):

```ts
  readonly openapi?: {
    readonly title: string
    readonly version: string
    readonly description?: string
    /** Default `/openapi.json`. */
    readonly jsonPath?: string
    /** Default `/reference`. */
    readonly uiPath?: string
    /** Scalar bundle URL; defaults to jsDelivr `@scalar/api-reference`. */
    readonly cdn?: string
    /**
     * Force the docs endpoints on/off. When `undefined`, defaults to
     * `process.env.NODE_ENV !== 'production'` (gated off in prod). REST
     * routes are always registered regardless of this flag.
     */
    readonly enabled?: boolean
  }
```

- [ ] **Step 3: Aggregate routes, warn on duplicates, and mount**

In the boot effect (`main`), find the block that registers module `http` hooks:

```ts
    // Modules register their own routes / middlewares.
    for (const m of options.modules) {
      if (m.http)
        yield* m.http(httpApp)
    }
```

Immediately AFTER that block, insert:

```ts
    // Aggregate declarative REST routes from every module, warn on
    // duplicate (method, path) pairs, then register them — and, when
    // configured + enabled, mount the OpenAPI document + Scalar UI.
    const apiRoutes = options.modules.flatMap(m => m.routes ?? [])
    for (const dup of findDuplicateRoutes(apiRoutes))
      yield* Effect.logWarning(`OpenAPI: duplicate route ${dup} — last operation wins in the document`)

    const oa = options.openapi
    const exposeDocs = oa ? (oa.enabled ?? process.env.NODE_ENV !== 'production') : false
    mountOpenApi(
      httpApp,
      apiRoutes,
      oa && exposeDocs
        ? {
            info: { title: oa.title, version: oa.version, description: oa.description },
            jsonPath: oa.jsonPath ?? '/openapi.json',
            uiPath: oa.uiPath ?? '/reference',
            cdn: oa.cdn,
          }
        : undefined,
    )
```

- [ ] **Step 4: Type-check the full package**

Run: `pnpm --filter @czo/kit check-types`
Expected: PASS — no errors. (`Effect` is already imported in `app.ts`; confirm `Effect.logWarning` resolves.)

- [ ] **Step 5: Run the kit openapi tests together**

Run: `pnpm --filter @czo/kit test src/openapi`
Expected: PASS — all openapi unit tests (document, scalar, mount) green.

- [ ] **Step 6: Lint the touched files**

Run: `pnpm lint:fix`
Expected: no remaining errors in `packages/kit/src/openapi/**` or `packages/kit/src/module/**`.

- [ ] **Step 7: Stage**

```bash
git add packages/kit/src/module/app.ts
```

---

## Task 9: Enable docs in the `life` app

**Files:**
- Modify: `apps/life/src/main.ts`

- [ ] **Step 1: Pass the `openapi` option to `buildApp`**

In `apps/life/src/main.ts`, add the `openapi` block to the existing `buildApp({...})` call (alongside `http` and `httpApp`):

```ts
  openapi: {
    title: 'life API',
    version: '0.1.0',
    description: 'REST endpoints for the life app.',
    // jsonPath/uiPath default to /openapi.json and /reference.
    // Gated off when NODE_ENV === 'production'.
  },
```

- [ ] **Step 2: Type-check the app**

Run: `pnpm --filter life check-types`
Expected: PASS — `buildApp` accepts the new `openapi` option.

- [ ] **Step 3: Manual smoke check (optional but recommended)**

Run: `pnpm dev:mazo` is the legacy app — instead start life: from `apps/life`, run the app (`pnpm --filter life dev` or the project's start script). Then:
- `curl -s http://127.0.0.1:4000/openapi.json` → returns a JSON document with `"openapi": "3.1.0"` and an empty `paths` object (no modules declare `routes` yet).
- Open `http://127.0.0.1:4000/reference` in a browser → Scalar UI renders (empty until a module adds routes).
Expected: both respond in dev. If the app needs `DATABASE_URL`/`AUTH_SECRET`, set them as documented in CLAUDE.md.

- [ ] **Step 4: Stage**

```bash
git add apps/life/src/main.ts
```

---

## Task 10: Final verification (whole-package)

**Files:** none (verification only)

- [ ] **Step 1: Full kit test run**

Run: `pnpm --filter @czo/kit test`
Expected: PASS — no regressions; the new `src/openapi/*` tests included.

- [ ] **Step 2: Full type-check**

Run: `pnpm check-types`
Expected: PASS — no new errors versus the pre-task baseline.

- [ ] **Step 3: Report**

Summarize which commands ran and their results. Do NOT commit — staging is complete; the single sprint commit happens after explicit user review per CLAUDE.md.

---

## Notes for the executor

- **h3 specifics:** `app.on(method, route, handler)` registers a route; `html(markup)` (imported from `h3`) returns an `text/html` response; returning a plain object auto-serializes to JSON. `app.request(url)` is the fetch-compatible test entry point — no `serve()` needed.
- **No drift:** never write a route's path/method in two places. The `ApiRoute` is the single source; the document is derived.
- **Production gate** only hides `/openapi.json` + `/reference`; the REST routes themselves are always live.
- **Security follow-up (deferred):** the Scalar `<script>` uses the unpinned CDN tag (no SRI). Documented in the spec; pin + add `integrity`/`crossorigin` or self-host before exposing docs outside dev.
- **Out of scope (v1):** auto-derived `parameters`, security schemes, schema validation, GraphQL→REST mirroring.
