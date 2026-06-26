# Distributed Tracing tour↔life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link `tour` (TanStack Start frontend) and `life` (Effect backend) into a single distributed trace in Tempo, so one browser request shows `tour SSR/server-fn → life graphql.Query.* → service spans` under one `traceId`.

**Architecture:** Two cooperating halves over the W3C `traceparent` header. **life** (Effect-native, no OTel SDK) extracts an incoming `traceparent` and parents its GraphQL spans on it via `Tracer.externalSpan`. **tour** (plain Node, OTel SDK) emits its own server spans and **injects** `traceparent` onto its outgoing GraphQL call to life. Phase A (life) is self-contained and useful alone; Phase B (tour) is experimental per TanStack Start's docs and is spike-led.

**Tech Stack:** Effect 4 (`effect/unstable/observability` Otlp, `effect/Tracer`), Pothos + `@pothos/plugin-tracing` (kit builder), TanStack Start 1.168 + Nitro (tour), `@opentelemetry/sdk-node` + OTLP/proto exporter (tour only), Tempo (verify).

## Global Constraints

- **No autonomous commits.** During execution `git add` (stage) only — NO per-task `git commit`. One commit at the end after explicit user review (project CLAUDE.md). The "Stage" steps below reflect this; do not commit.
- **`@czo/kit` and `life` stay free of any `@opentelemetry/*` dependency.** Phase A uses ONLY effect-native `Tracer.externalSpan` + a hand-written W3C parser. `@opentelemetry/api` was deliberately removed from kit in #168 — do not reintroduce it.
- **kit is consumed as built dist by the e2e harness.** After editing `packages/kit/**`, run `pnpm --filter @czo/kit build` before running any `@czo/auth` e2e test.
- **tour's OTel SDK is server-only.** `instrumentation.ts` and the SDK packages must never reach the browser bundle (they run in the Nitro server / preload).
- **W3C traceparent format (exact):** `<version>-<traceId>-<spanId>-<flags>` = `00` + 32 lowercase hex + 16 lowercase hex + 2 hex; `sampled = (parseInt(flags,16) & 1) === 1`. All-zero traceId or spanId is invalid.
- **Tests:** `@effect/vitest` (`it as itEffect`). Lint gate is `eslint --max-warnings 0` (`pnpm --filter @czo/kit lint`; tour uses `pnpm --filter @czo/tour lint`).
- **Effect import style in `builder.ts`:** `import { Context, Effect, Layer } from 'effect'` — add `Tracer` to this named import (`Tracer.externalSpan`, `Tracer.ExternalSpan`).

---

## File Structure

**Phase A — life (kit):**
- Modify `packages/kit/src/graphql/builder.ts` — add exported `parseTraceparent`; use it in the `tracing.wrap` to set the span `parent`.
- Modify `packages/kit/src/graphql/builder.test.ts` — unit tests for `parseTraceparent` + an effect test that the parent links the trace.

**Phase B — tour (experimental, spike-led):**
- Create `apps/tour/src/instrumentation.ts` — OTel `NodeSDK` init (OTLP/proto exporter, resource `service.name=tour`).
- Modify `apps/tour/src/graphql/gql-admin.server.ts` — inject `traceparent` (+ active request span context) onto the fetch to life.
- Create `apps/tour/src/middleware/tracing.ts` (+ wire-up) — a request span so there's an active context to propagate (mechanism confirmed by the B0 spike).
- Modify `apps/tour/package.json` — add server-only OTel SDK deps.
- Modify `apps/tour/Dockerfile` — bundle `instrumentation.ts` to a standalone `.mjs` and preload it (`node --import`).
- Modify `docker-compose.yml` — add `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_SERVICE_NAME=tour` to the `tour` service.

---

## Phase A — life extracts incoming traceparent

### Task A1: `parseTraceparent` helper

**Files:**
- Modify: `packages/kit/src/graphql/builder.ts` (add export next to `tracingSpanOptions`, ~line 95; extend the `effect` import ~line 14)
- Test: `packages/kit/src/graphql/builder.test.ts`

**Interfaces:**
- Produces: `parseTraceparent(header: string | null | undefined): Tracer.ExternalSpan | undefined` — exported from `./builder`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/kit/src/graphql/builder.test.ts` (the file imports `{ describe, expect } from 'vitest'`, `{ it as itEffect } from '@effect/vitest'`, `{ Data, Effect, Layer } from 'effect'`). Add `parseTraceparent` to the existing `'./builder'` import, and `Tracer` to the `effect` import:

```ts
describe('parseTraceparent — W3C → external span', () => {
  const TRACE = '0af7651916cd43dd8448eb211c80319c'
  const SPAN = 'b7ad6b7169203331'

  itEffect('parses a sampled traceparent into an external span', () => {
    const ext = parseTraceparent(`00-${TRACE}-${SPAN}-01`)
    expect(ext?._tag).toBe('ExternalSpan')
    expect(ext?.traceId).toBe(TRACE)
    expect(ext?.spanId).toBe(SPAN)
    expect(ext?.sampled).toBe(true)
  })

  itEffect('reads the sampled flag low bit (00 = not sampled)', () => {
    expect(parseTraceparent(`00-${TRACE}-${SPAN}-00`)?.sampled).toBe(false)
  })

  itEffect('returns undefined for absent / malformed / all-zero ids', () => {
    expect(parseTraceparent(undefined)).toBeUndefined()
    expect(parseTraceparent(null)).toBeUndefined()
    expect(parseTraceparent('')).toBeUndefined()
    expect(parseTraceparent('garbage')).toBeUndefined()
    expect(parseTraceparent(`00-${TRACE}-${SPAN}`)).toBeUndefined() // 3 parts
    expect(parseTraceparent(`01-${TRACE}-${SPAN}-01`)).toBeUndefined() // bad version
    expect(parseTraceparent(`00-XYZ-${SPAN}-01`)).toBeUndefined() // non-hex trace
    expect(parseTraceparent(`00-${'0'.repeat(32)}-${SPAN}-01`)).toBeUndefined() // zero trace
    expect(parseTraceparent(`00-${TRACE}-${'0'.repeat(16)}-01`)).toBeUndefined() // zero span
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @czo/kit test src/graphql/builder.test.ts -t parseTraceparent`
Expected: FAIL — `parseTraceparent is not exported` / `is not a function`.

- [ ] **Step 3: Add the `Tracer` import**

In `packages/kit/src/graphql/builder.ts`, change line 14 from:

```ts
import { Context, Effect, Layer } from 'effect'
```
to:
```ts
import { Context, Effect, Layer, Tracer } from 'effect'
```

- [ ] **Step 4: Implement `parseTraceparent`**

In `packages/kit/src/graphql/builder.ts`, immediately AFTER the `tracingSpanOptions` function (before `export interface SchemaBuilderOptions`), add:

```ts
/**
 * Parse a W3C `traceparent` header into an Effect external span usable as a
 * parent, or `undefined` when absent/malformed. Format:
 * `00-<traceId:32hex>-<spanId:16hex>-<flags:2hex>`; `sampled` = low bit of flags.
 * Lets life join a distributed trace started by a caller (e.g. tour) without any
 * @opentelemetry dependency — purely effect-native `Tracer.externalSpan`.
 */
export function parseTraceparent(header: string | null | undefined): Tracer.ExternalSpan | undefined {
  if (!header)
    return undefined
  const parts = header.split('-')
  if (parts.length !== 4)
    return undefined
  const [version, traceId, spanId, flags] = parts
  if (version !== '00' || !/^[0-9a-f]{32}$/.test(traceId) || !/^[0-9a-f]{16}$/.test(spanId) || !/^[0-9a-f]{2}$/.test(flags))
    return undefined
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId))
    return undefined
  return Tracer.externalSpan({ traceId, spanId, sampled: (Number.parseInt(flags, 16) & 1) === 1 })
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @czo/kit test src/graphql/builder.test.ts -t parseTraceparent`
Expected: PASS (3 tests).

- [ ] **Step 6: Type-check + lint**

Run: `pnpm --filter @czo/kit check-types && pnpm --filter @czo/kit lint`
Expected: both exit 0, no output errors.

- [ ] **Step 7: Stage (do NOT commit)**

```bash
git add packages/kit/src/graphql/builder.ts packages/kit/src/graphql/builder.test.ts
```

---

### Task A2: parent the GraphQL span on the incoming traceparent

**Files:**
- Modify: `packages/kit/src/graphql/builder.ts` (the `tracing.wrap`, ~line 355)
- Test: `packages/kit/src/graphql/builder.test.ts`

**Interfaces:**
- Consumes: `parseTraceparent` (Task A1); existing `tracingSpanOptions`; `GraphQLContextMap.request: Request` (already on the wrap's `ctx`).
- Produces: no new exports — behavior change only.

- [ ] **Step 1: Write the failing test**

Append to `packages/kit/src/graphql/builder.test.ts`:

```ts
describe('tracing wrap — distributed parent', () => {
  const TRACE = '0af7651916cd43dd8448eb211c80319c'
  const SPAN = 'b7ad6b7169203331'

  // A child span created with an external parent inherits the parent's traceId —
  // this is what links life's GraphQL span into the caller's (tour's) trace.
  itEffect('a span created with the external parent inherits its traceId', async () => {
    const parent = parseTraceparent(`00-${TRACE}-${SPAN}-01`)!
    const traceId = await Effect.runPromise(
      Effect.withSpan('graphql.Query.users', { parent })(
        Effect.map(Effect.currentSpan, span => span.traceId),
      ),
    )
    expect(traceId).toBe(TRACE)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails or passes (baseline)**

Run: `pnpm --filter @czo/kit test src/graphql/builder.test.ts -t "distributed parent"`
Expected: PASS already (this asserts Effect semantics the wrap relies on; it guards the contract). If it FAILS, stop — the Effect `parent` option semantics differ and the wrap approach must be revisited before continuing.

- [ ] **Step 3: Wire `parseTraceparent` into the wrap**

In `packages/kit/src/graphql/builder.ts`, replace the current `wrap` (the arrow returning `ctx.runEffect(Effect.withSpan(name, tracingSpanOptions(options))(...))`) with:

```ts
      wrap: (resolver: any, options: any, fieldConfig: any) =>
        (source: any, args: any, ctx: GraphQLContextMap, info: any) => {
          // Join the caller's distributed trace when present (e.g. tour sends a
          // W3C `traceparent`); otherwise the span is a root, as before.
          const parent = parseTraceparent(ctx.request.headers.get('traceparent'))
          const base = tracingSpanOptions(options)
          return ctx.runEffect(
            Effect.withSpan(`graphql.${fieldConfig.parentType}.${fieldConfig.name}`, {
              ...(base ?? {}),
              ...(parent ? { parent } : {}),
            })(
              Effect.tryPromise({
                try: () => Promise.resolve(resolver(source, args, ctx, info)),
                catch: e => e,
              }),
            ),
          )
        },
```

- [ ] **Step 4: Run the full builder test file**

Run: `pnpm --filter @czo/kit test src/graphql/builder.test.ts`
Expected: PASS (all prior tests + the new ones).

- [ ] **Step 5: Type-check + lint**

Run: `pnpm --filter @czo/kit check-types && pnpm --filter @czo/kit lint`
Expected: both exit 0.

- [ ] **Step 6: Rebuild kit dist, run auth e2e (no regression on error routing)**

Run: `pnpm --filter @czo/kit build && pnpm --filter @czo/auth test src/e2e/organization.e2e.test.ts src/e2e/user.e2e.test.ts`
Expected: 22 tests pass; `FORBIDDEN`/`UNAUTHENTICATED` codes still present (the double-`runEffect` + `catch: e => e` is unchanged).

- [ ] **Step 7: Runtime check (optional but recommended) — span joins a forged trace**

Start Tempo (OTLP/HTTP on 4318, query on 3200) and life with `OTEL_EXPORTER_OTLP_ENDPOINT` pointed at it, then:

```bash
TP="00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
curl -s -X POST "$LIFE_GRAPHQL_ADMIN_URL" -H 'content-type: application/json' -H "traceparent: $TP" \
  -d '{"query":"{ me { id } }"}' >/dev/null
# then query Tempo for the trace id:
curl -s "http://localhost:3200/api/traces/0af7651916cd43dd8448eb211c80319c" | head
```
Expected: Tempo returns a trace whose id is `0af7651916cd43dd8448eb211c80319c` containing a `graphql.Query.me` span (life joined the forged trace).

- [ ] **Step 8: Stage (do NOT commit)**

```bash
git add packages/kit/src/graphql/builder.ts packages/kit/src/graphql/builder.test.ts
```

---

## Phase B — tour OTel instrumentation + traceparent propagation (experimental, spike-led)

> TanStack Start marks OpenTelemetry support **experimental / manual** (first-class support is "coming"). Two mechanisms are version-sensitive in tour's 1.168.26 and MUST be confirmed by Task B0 before B1–B4 are finalized: (1) **preloading** an instrumentation module into the Nitro **standalone** `.output` build (runtime image has no `node_modules`); (2) establishing an **active span** around server requests so `traceparent` injection has a context (`createStart`/`requestMiddleware` availability). Treat B1–B4 code as the recommended shape; re-plan their exact form from B0's findings if the spike contradicts them.

### Task B0: Spike — confirm instrumentation loading + active context

**Files:** scratch only (`apps/tour/_spike-*` — delete after).

**Goal:** Prove, end-to-end and locally, that (a) a preloaded OTel SDK in tour's built server exports a span to a local Tempo, and (b) an outgoing `fetch` from a server function carries a `traceparent`.

- [ ] **Step 1: Build a self-contained instrumentation bundle**

Create `apps/tour/_spike-instr.ts`:

```ts
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

const sdk = new NodeSDK({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'tour-spike' }),
  traceExporter: new OTLPTraceExporter(), // reads OTEL_EXPORTER_OTLP_ENDPOINT
})
sdk.start()
```

Install the deps (temporarily) and bundle to a standalone ESM file:

```bash
pnpm --filter @czo/tour add -D @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-proto @opentelemetry/resources @opentelemetry/semantic-conventions @opentelemetry/api
pnpm --filter @czo/tour exec esbuild apps/tour/_spike-instr.ts --bundle --platform=node --format=esm --outfile=apps/tour/_spike-instr.mjs
```
Expected: `apps/tour/_spike-instr.mjs` written, no unresolved imports.

- [ ] **Step 2: Run Tempo + the built tour server with the preload**

Start Tempo (OTLP/HTTP 4318, query 3200). Build tour, then:

```bash
pnpm --filter @czo/tour build
cd apps/tour && OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 PORT=3001 \
  node --import ../_spike-instr.mjs .output/server/index.mjs &
curl -s http://localhost:3001/login >/dev/null   # triggers SSR + the fetchMe → life call
```
Expected: server starts; no "Cannot find package '@opentelemetry/...'" error (proves the bundle is self-contained and the preload works in the standalone image model).

- [ ] **Step 3: Verify a tour span reached Tempo**

```bash
curl -s -G 'http://localhost:3200/api/search' --data-urlencode 'q={ resource.service.name = "tour-spike" }' | head
```
Expected: at least one trace for `tour-spike`. Record the result. **If empty**, the preload/auto-instrumentation did not capture the request — note this; B2 must add an explicit request span (middleware) rather than relying on auto-instrumentation.

- [ ] **Step 4: Decide the propagation mechanism and record it**

Document in the report which is confirmed working: **(a)** auto HTTP/undici instrumentation injecting `traceparent` on the global `fetch`, or **(b)** manual injection required. (B2 below assumes **(b) manual** — the robust default — unless B0 proves (a).)

- [ ] **Step 5: Clean up the spike**

```bash
rm -f apps/tour/_spike-instr.ts apps/tour/_spike-instr.mjs
# keep the dev deps if B1 will use them; otherwise: pnpm --filter @czo/tour remove <pkgs>
```

- [ ] **Step 6: Stage findings**

Write the confirmed recipe (preload command, propagation mechanism, whether a request-span middleware is needed) into the task report; no source staged yet.

---

### Task B1: tour OTel SDK init module + deps

**Files:**
- Create: `apps/tour/src/instrumentation.ts`
- Modify: `apps/tour/package.json` (dependencies)

**Interfaces:**
- Consumes: B0's confirmed package set + exporter config.
- Produces: a side-effecting module that, when imported, starts the OTel `NodeSDK` (OTLP/proto exporter, resource `service.name` from `OTEL_SERVICE_NAME` ?? `'tour'`).

- [ ] **Step 1: Add server-only OTel deps**

```bash
pnpm --filter @czo/tour add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-proto @opentelemetry/resources @opentelemetry/semantic-conventions @opentelemetry/api
```
Expected: `apps/tour/package.json` lists the five packages; `pnpm install` resolves.

- [ ] **Step 2: Create the instrumentation module**

`apps/tour/src/instrumentation.ts`:

```ts
// Server-only OpenTelemetry init. Preloaded before the app (see Dockerfile),
// so module patching happens before app imports. Telemetry is off when
// OTEL_EXPORTER_OTLP_ENDPOINT is unset (the SDK simply has nowhere to export).
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'tour',
      [ATTR_SERVICE_VERSION]: '0.1.0',
    }),
    traceExporter: new OTLPTraceExporter(),
  })
  sdk.start()
  process.on('SIGTERM', () => { void sdk.shutdown() })
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @czo/tour check-types`
Expected: exit 0.

- [ ] **Step 4: Stage (do NOT commit)**

```bash
git add apps/tour/src/instrumentation.ts apps/tour/package.json pnpm-lock.yaml
```

---

### Task B2: inject traceparent on the gqlAdmin call (+ active request span)

**Files:**
- Modify: `apps/tour/src/graphql/gql-admin.server.ts:31-35` (the `fetch` headers)
- Create (only if B0 Step 3 was empty): `apps/tour/src/middleware/tracing.ts` + its registration
- Test: `apps/tour/src/graphql/gql-admin.server.test.ts`

**Interfaces:**
- Consumes: `@opentelemetry/api` `propagation` + `context` (active context established by B0's mechanism or the middleware).
- Produces: outgoing requests to life carry a `traceparent` header when a span is active.

- [ ] **Step 1: Write the failing test**

Add to `apps/tour/src/graphql/gql-admin.server.test.ts` (it already stubs `fetch` and asserts on the request body — mirror that):

```ts
it('forwards a traceparent header when one is in the active context', async () => {
  const { context, propagation, trace } = await import('@opentelemetry/api')
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { me: null } }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)

  const doc = graphql(`query MeProbe { me { id } }`)
  // Activate a span context so propagation has something to inject.
  const span = trace.getTracer('test').startSpan('test')
  await context.with(trace.setSpan(context.active(), span), () => gqlAdmin(doc, {}, { cookie: '' }))

  const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
  expect(headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @czo/tour test src/graphql/gql-admin.server.test.ts -t traceparent`
Expected: FAIL — `headers.traceparent` is `undefined`.

- [ ] **Step 3: Inject traceparent in `gqlAdmin`**

In `apps/tour/src/graphql/gql-admin.server.ts`, add the import at the top:

```ts
import { context, propagation } from '@opentelemetry/api'
```

and change the `fetch` headers block from:

```ts
  const res = await fetch(`${LIFE_URL}/graphql/admin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  })
```
to:
```ts
  const headers: Record<string, string> = { 'content-type': 'application/json', cookie }
  // Propagate the active trace context so life can join this trace (see kit
  // `parseTraceparent`). No-op when no span is active / OTel SDK not started.
  propagation.inject(context.active(), headers)

  const res = await fetch(`${LIFE_URL}/graphql/admin`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables: variables ?? {} }),
  })
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @czo/tour test src/graphql/gql-admin.server.test.ts -t traceparent`
Expected: PASS.

- [ ] **Step 5: Ensure an active span exists in production (conditional on B0)**

If B0 Step 3 showed tour spans WITHOUT extra work (auto-instrumentation active), SKIP this step. Otherwise add an explicit request span so `context.active()` carries one. Create `apps/tour/src/middleware/tracing.ts`:

```ts
import { createMiddleware } from '@tanstack/react-start'
import { SpanStatusCode, trace } from '@opentelemetry/api'

const tracer = trace.getTracer('tour')

export const tracingMiddleware = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url)
  return tracer.startActiveSpan(`${request.method} ${url.pathname}`, async (span) => {
    try {
      const result = await next()
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    }
    catch (error) {
      span.recordException(error as Error)
      span.setStatus({ code: SpanStatusCode.ERROR })
      throw error
    }
    finally {
      span.end()
    }
  })
})
```

Register it via the mechanism B0 confirmed for this version (e.g. a `apps/tour/src/start.ts` exporting `createStart(() => ({ requestMiddleware: [tracingMiddleware] }))`, if `createStart` exists; otherwise per-route `server.middleware`). Record the exact wiring used.

- [ ] **Step 6: Full tour validation**

Run: `pnpm --filter @czo/tour check-types && pnpm --filter @czo/tour lint && pnpm --filter @czo/tour test`
Expected: all pass.

- [ ] **Step 7: Stage (do NOT commit)**

```bash
git add apps/tour/src/graphql/gql-admin.server.ts apps/tour/src/graphql/gql-admin.server.test.ts
# plus apps/tour/src/middleware/tracing.ts + start wiring if Step 5 applied
```

---

### Task B3: preload instrumentation in the build + compose env

**Files:**
- Modify: `apps/tour/Dockerfile`
- Modify: `docker-compose.yml` (tour `environment`, ~line 93-98)

**Interfaces:**
- Consumes: B0's confirmed bundling + preload recipe; `apps/tour/src/instrumentation.ts` (Task B1).

- [ ] **Step 1: Bundle instrumentation in the build stage**

In `apps/tour/Dockerfile`, after `RUN pnpm build`, add a step that bundles the instrumentation module into a self-contained ESM file (deps inlined — the runtime stage has no `node_modules`):

```dockerfile
RUN pnpm build
# Self-contained OTel preload (runtime image has no node_modules).
RUN pnpm --filter @czo/tour exec esbuild apps/tour/src/instrumentation.ts \
    --bundle --platform=node --format=esm --outfile=apps/tour/.output/instrumentation.mjs
```

- [ ] **Step 2: Preload it at runtime**

In `apps/tour/Dockerfile`, change the final command from:

```dockerfile
CMD ["node", ".output/server/index.mjs"]
```
to:
```dockerfile
CMD ["node", "--import", "./.output/instrumentation.mjs", ".output/server/index.mjs"]
```
(`.output/instrumentation.mjs` is copied by the existing `COPY --from=build … /app/apps/tour/.output …` line — verify it lands under the copied tree.)

- [ ] **Step 3: Add OTEL env to the tour service**

In `docker-compose.yml`, in the `tour` service `environment:` block, add:

```yaml
      OTEL_EXPORTER_OTLP_ENDPOINT: ${OTEL_EXPORTER_OTLP_ENDPOINT-http://otel-collector:4318}
      OTEL_SERVICE_NAME: tour
```

- [ ] **Step 4: Build the image to verify the bundle + preload**

Run: `docker build -f apps/tour/Dockerfile -t czo/tour:trace-verify .`
Expected: build succeeds; the esbuild step produces `instrumentation.mjs` with no unresolved imports.

- [ ] **Step 5: Stage (do NOT commit)**

```bash
git add apps/tour/Dockerfile docker-compose.yml
```

---

### Task B4: end-to-end distributed-trace validation

**Files:** none (verification only).

- [ ] **Step 1: Bring up Tempo + life + tour locally on one network**

Start Tempo (OTLP/HTTP 4318, query 3200). Run `life` with `OTEL_EXPORTER_OTLP_ENDPOINT` → Tempo (Phase A built into kit dist). Run the `czo/tour:trace-verify` image with `OTEL_EXPORTER_OTLP_ENDPOINT` → Tempo, `OTEL_SERVICE_NAME=tour`, `LIFE_URL` → life.

- [ ] **Step 2: Drive a request that crosses the boundary**

```bash
# Sign in (so /users SSR actually calls life's admin API), then load /users:
curl -s -c /tmp/c.txt -X POST "$TOUR_URL/_serverFn/..." ...   # or log in via the UI
curl -s -b /tmp/c.txt "$TOUR_URL/users" >/dev/null
```
(Any authenticated tour page whose SSR calls life works; `/login` SSR calls `me` and also suffices for an anonymous link.)

- [ ] **Step 3: Confirm ONE trace spans both services**

```bash
curl -s -G 'http://localhost:3200/api/search' --data-urlencode 'q={ resource.service.name = "tour" }' --data-urlencode 'limit=5'
# take a traceID from the result, then:
curl -s "http://localhost:3200/api/traces/<traceID>" | python3 -c "import sys,json;d=json.load(sys.stdin);print({s['name'] for b in d['batches'] for ss in b['scopeSpans'] for s in ss['spans']})"
```
Expected: a single trace whose spans include BOTH a `tour` span (e.g. `GET /users` or a server-fn span) AND a `life` `graphql.Query.*` span — i.e. life's span is a child of tour's, same `traceID`.

- [ ] **Step 4: Record the result in the task report**

Note the trace ID and the span names observed. If life's span is a SEPARATE trace, propagation isn't reaching life — re-check B2 (active context) and Phase A (`parseTraceparent` reading the header).

---

## Self-Review

**1. Spec coverage:**
- Phase A "life extracts traceparent → parents spans via `Tracer.externalSpan`" → Tasks A1 (`parseTraceparent`) + A2 (wrap wiring). ✓
- Phase B "tour OTel NodeSDK instrumentation" → B1. ✓ "traceparent propagation on gqlAdmin" → B2. ✓ "Dockerfile preload + compose env" → B3. ✓ End-to-end link → B4. ✓ Loading/active-context unknowns → B0 spike. ✓

**2. Placeholder scan:** Phase A steps contain complete code, exact commands, expected output. Phase B B1–B3 contain complete code; B0/B4 are verification/spike tasks with concrete commands. The only intentionally-deferred specifics (exact middleware registration in B2 Step 5; exact preload path confirmation in B3 Step 2) are gated on the B0 spike and called out as such — not silent placeholders.

**3. Type consistency:** `parseTraceparent(header): Tracer.ExternalSpan | undefined` is defined in A1 and consumed in A2 with the same signature. `Tracer.externalSpan({ traceId, spanId, sampled })` matches the `ExternalSpan` shape (`_tag`, `traceId`, `spanId`, `sampled`). `tracingSpanOptions` is reused unchanged. tour's `instrumentation.ts` exports nothing (side-effect module) and is consumed only via preload — consistent across B1/B3.

**Note on phasing:** Phase A is independent and shippable on its own (it benefits any traceparent-sending caller and has no tour dependency). Recommend executing Phase A first; gate Phase B on the B0 spike, and re-plan B1–B4 specifics if B0's findings differ.
