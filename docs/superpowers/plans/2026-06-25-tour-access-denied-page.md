# Access-Denied Boundary for `apps/tour` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an in-place "Access Denied" (403) panel inside tour's `_authed` shell when a logged-in user lacks the role/permission to load a route's data; redirect to `/login` on session-expiry; generic error + retry otherwise.

**Architecture:** (A) `@czo/kit` adds `scopeAuth.unauthorizedError` so every declarative permission denial returns `errors[].extensions.code` (`FORBIDDEN`, or `UNAUTHENTICATED` when no principal). (B) `apps/tour` surfaces that code through `gqlAdmin`, and a router-level `defaultErrorComponent` (`DataErrorBoundary`) branches on it — rendering at each errored route's Outlet, so the 403 appears inside the `_authed` layout.

**Tech Stack:** `@pothos/plugin-scope-auth`, graphql-yoga, GraphQLError; TanStack Start/Router + React Query; `@workspace/ui` (Card/Button), lucide-react, Tolgee i18n; Vitest.

**Spec:** `docs/superpowers/specs/2026-06-25-tour-access-denied-page-design.md`

## Global Constraints

- **Detection signal:** `errors[].extensions.code` — `'FORBIDDEN'` (authenticated, lacks scope) / `'UNAUTHENTICATED'` (no principal). The denial **message stays `'Not authorized'`** (existing `organization.e2e` asserts `toContain('Not authorized')` — must remain green).
- **kit stays auth-agnostic:** the `UNAUTHENTICATED` discriminator reads the principal via the conventional optional field `context.auth?.user` (localized cast — NO import of `@czo/auth`).
- **In-place + global:** router `defaultErrorComponent`; the boundary renders inside `_authed` (sidebar/header intact, URL unchanged).
- **i18n:** all user-facing strings via Tolgee keys in BOTH `apps/tour/src/i18n/en.json` and `fr-FR.json` (flat dotted keys, matching the existing files).
- No `console.log`. Match existing tour component style (`useTranslate`, `@workspace/ui`, lucide).
- Node-guard denials (relay `node(id:)` → `null`, no error) are a different mechanism — do not touch.

---

## File Structure

- `packages/kit/src/graphql/builder.ts` — **modify**: `scopeAuth.unauthorizedError` + `GraphQLError` import.
- `packages/modules/auth/src/e2e/organization.e2e.test.ts` — **modify**: assert `extensions.code` on denials (+ an UNAUTHENTICATED case).
- `apps/tour/src/graphql/gql-admin.server.ts` — **modify**: capture `code`; export `errorCode`/`isForbiddenError`/`isUnauthenticatedError`.
- `apps/tour/src/graphql/gql-admin.server.test.ts` — **modify**: unit tests for code capture + predicates.
- `apps/tour/src/components/forbidden.tsx` — **create**: 403 panel.
- `apps/tour/src/components/error-state.tsx` — **create**: generic error + retry.
- `apps/tour/src/components/data-error-boundary.tsx` — **create**: branching error component.
- `apps/tour/src/components/data-error-boundary.test.tsx` — **create**: render test.
- `apps/tour/src/router.tsx` — **modify**: `defaultErrorComponent`.
- `apps/tour/src/i18n/en.json`, `apps/tour/src/i18n/fr-FR.json` — **modify**: `errors.*` keys.

---

### Task 1: kit emits `extensions.code` on scope-auth denials

**Files:**
- Modify: `packages/kit/src/graphql/builder.ts` (`scopeAuth` block ~line 327; imports ~line 10)
- Test: `packages/modules/auth/src/e2e/organization.e2e.test.ts` (existing denial assertions ~lines 47, 172)

**Interfaces:**
- Consumes: `@pothos/plugin-scope-auth` `unauthorizedError` config option `(parent, context, info, result) => Error | string`; the runtime context's conventional `auth?.user`.
- Produces: every declarative scope-auth denial response carries `errors[0].extensions.code` (`'FORBIDDEN'` | `'UNAUTHENTICATED'`), message `'Not authorized'`.

- [ ] **Step 1: Extend the e2e denial assertions (failing)**

In `packages/modules/auth/src/e2e/organization.e2e.test.ts`, after EACH existing denial assertion `expect(denied.errors?.[0]?.message).toContain('Not authorized')` (there are two, ~lines 48 and 173), add:

```ts
    expect(denied.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @czo/auth test organization.e2e`
Expected: FAIL — `extensions.code` is `undefined` today (the code is a Pothos class property, not on the wire).

- [ ] **Step 3: Import `GraphQLError` in the builder**

In `packages/kit/src/graphql/builder.ts`, add to the top imports (alongside the existing `graphql`/pothos imports):

```ts
import { GraphQLError } from 'graphql'
```

- [ ] **Step 4: Add `unauthorizedError` to the scopeAuth config**

In `packages/kit/src/graphql/builder.ts`, replace the `scopeAuth` block:

```ts
    scopeAuth: {
      authScopes: async ctx => Object.assign({}, ...authScope.map(scope => scope(ctx))),
    },
```

with:

```ts
    scopeAuth: {
      authScopes: async ctx => Object.assign({}, ...authScope.map(scope => scope(ctx))),
      // Surface a machine-readable code on declarative denials so clients can
      // render a 403 vs. redirect on session-expiry. The principal lives at the
      // conventional `context.auth.user` (set by the auth module's session
      // context contributor); read it defensively so kit stays auth-agnostic.
      // The message stays 'Not authorized' (consumers/tests match on it).
      unauthorizedError: (_parent, context, _info, _result) => {
        const authed = Boolean((context as { auth?: { user?: unknown } }).auth?.user)
        return new GraphQLError('Not authorized', {
          extensions: { code: authed ? 'FORBIDDEN' : 'UNAUTHENTICATED' },
        })
      },
    },
```

- [ ] **Step 5: Add the UNAUTHENTICATED e2e case (failing → passing)**

In `packages/modules/auth/src/e2e/organization.e2e.test.ts`, inside the same denial test that has the first `viewer.token` denial, add an unauthenticated call (no token) right after the FORBIDDEN assertions, reusing the same `denied` mutation document:

```ts
    // No token → no principal → UNAUTHENTICATED (distinct from FORBIDDEN).
    const anon = await h.gql(
      `mutation ($i: UpdateOrganizationInput!) { updateOrganization(input: $i) {
        ... on UpdateOrganizationSuccess { data { organization { id } } } } }`,
      { i: { id: orgGlobalId, name: 'Anon Renamed' } },
      // no token, no ip
    )
    expect(anon.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED')
```

(Use the exact `orgGlobalId` variable already in scope in that test. The `h.gql` signature is `(query, variables?, token?, ip?)` — omit token/ip for the anonymous call.)

- [ ] **Step 6: Run the e2e to verify it passes**

Run: `pnpm --filter @czo/auth test organization.e2e`
Expected: PASS — denials now carry `extensions.code` (`FORBIDDEN` with a token, `UNAUTHENTICATED` without).

- [ ] **Step 7: Confirm no other denial-message tests regressed**

Run: `pnpm --filter @czo/auth test e2e`
Expected: PASS. The message is unchanged (`'Not authorized'`), so `toContain('Not authorized')` assertions elsewhere stay green. (`user.e2e` uses the typed `ForbiddenError` union result — a different mechanism, unaffected.)

- [ ] **Step 8: Type-check & lint**

Run: `pnpm --filter @czo/kit check-types` then `pnpm lint`
Expected: clean. **Stage only — do NOT commit** (`git add packages/kit/src/graphql/builder.ts packages/modules/auth/src/e2e/organization.e2e.test.ts`).

---

### Task 2: tour `gqlAdmin` captures the code + detection predicates

**Files:**
- Modify: `apps/tour/src/graphql/gql-admin.server.ts`
- Test: `apps/tour/src/graphql/gql-admin.server.test.ts`

**Interfaces:**
- Consumes: the API's `errors[0].extensions.code` (Task 1).
- Produces (from `./gql-admin.server`):
  - `GraphqlAdminError` gains `readonly code?: string`.
  - `errorCode(err: unknown): string | undefined`
  - `isForbiddenError(err: unknown): boolean`
  - `isUnauthenticatedError(err: unknown): boolean`

- [ ] **Step 1: Write the failing unit tests**

In `apps/tour/src/graphql/gql-admin.server.test.ts`, add (keep existing tests):

```ts
import { errorCode, GraphqlAdminError, isForbiddenError, isUnauthenticatedError } from './gql-admin.server'

describe('error code detection', () => {
  it('errorCode reads a live GraphqlAdminError.code', () => {
    expect(errorCode(new GraphqlAdminError('[FORBIDDEN] Not authorized', undefined, 'FORBIDDEN'))).toBe('FORBIDDEN')
  })
  it('errorCode reads the serialized plain-object shape (prototype lost over RPC)', () => {
    expect(errorCode({ name: 'GraphqlAdminError', message: '[FORBIDDEN] x', code: 'FORBIDDEN' })).toBe('FORBIDDEN')
  })
  it('errorCode falls back to a [CODE] message prefix when no code field survives', () => {
    expect(errorCode({ message: '[UNAUTHENTICATED] Not authorized' })).toBe('UNAUTHENTICATED')
  })
  it('errorCode is undefined for an uncoded error', () => {
    expect(errorCode(new Error('network down'))).toBeUndefined()
  })
  it('isForbiddenError / isUnauthenticatedError', () => {
    expect(isForbiddenError({ code: 'FORBIDDEN' })).toBe(true)
    expect(isForbiddenError({ code: 'UNAUTHENTICATED' })).toBe(false)
    expect(isUnauthenticatedError({ code: 'UNAUTHENTICATED' })).toBe(true)
    expect(isUnauthenticatedError(new Error('x'))).toBe(false)
  })
})
```

(If the test file lacks `describe`/`it`/`expect` imports, add `import { describe, expect, it } from 'vitest'`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @czo/tour test gql-admin.server`
Expected: FAIL — `errorCode`/`isForbiddenError`/`isUnauthenticatedError` and the 3-arg `GraphqlAdminError` don't exist yet.

- [ ] **Step 3: Capture the code in `gqlAdmin` + add predicates**

In `apps/tour/src/graphql/gql-admin.server.ts`:

Change `GraphqlAdminError` to carry a `code`:

```ts
export class GraphqlAdminError extends Error {
  constructor(message: string, readonly detail?: unknown, readonly code?: string) {
    super(message)
    this.name = 'GraphqlAdminError'
  }
}
```

Read `extensions.code` and throw with it (the body type gains `extensions`; prefix the message with `[CODE]` so detection survives even if the `code` field is stripped by RPC serialization — the raw message is never shown to users, only used for branching):

```ts
  const body = await res.json() as {
    data?: TData
    errors?: { message: string, extensions?: { code?: string } }[]
  }
  if (body.errors?.length) {
    const code = body.errors[0]?.extensions?.code
    const joined = body.errors.map(e => e.message).join('; ')
    throw new GraphqlAdminError(code ? `[${code}] ${joined}` : joined, body.errors, code)
  }
```

Add the predicates at the end of the file:

```ts
/** Extract a denial code from a thrown error — robust to the createServerFn
 *  serialized shape (plain object, prototype lost) and a `[CODE]` message prefix. */
export function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string' && code.length > 0)
      return code
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string') {
      const m = /^\[([A-Z_]+)\]/.exec(message)
      if (m)
        return m[1]
    }
  }
  return undefined
}

export function isForbiddenError(err: unknown): boolean {
  return errorCode(err) === 'FORBIDDEN'
}

export function isUnauthenticatedError(err: unknown): boolean {
  return errorCode(err) === 'UNAUTHENTICATED'
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `pnpm --filter @czo/tour test gql-admin.server`
Expected: PASS (existing tests + the new detection tests).

- [ ] **Step 5: Type-check & lint**

Run: `pnpm --filter @czo/tour check-types` then `pnpm lint`
Expected: clean. **Stage only — do NOT commit.**

---

### Task 3: tour 403 + generic-error components + i18n

**Files:**
- Create: `apps/tour/src/components/forbidden.tsx`, `apps/tour/src/components/error-state.tsx`
- Modify: `apps/tour/src/i18n/en.json`, `apps/tour/src/i18n/fr-FR.json`

**Interfaces:**
- Consumes: `@workspace/ui` `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent` + `Button`; lucide `ShieldAlert`/`TriangleAlert`; `useTranslate` (Tolgee); `Link` from `@tanstack/react-router`.
- Produces: `Forbidden` (no props) and `ErrorState` (`{ reset?: () => void }`).

- [ ] **Step 1: Add i18n keys (en + fr)**

In `apps/tour/src/i18n/en.json` add:

```json
  "errors.forbidden.title": "Access denied",
  "errors.forbidden.description": "You don't have permission to view this data. Contact an administrator if you think this is a mistake.",
  "errors.forbidden.back": "Back to dashboard",
  "errors.generic.title": "Something went wrong",
  "errors.generic.description": "We couldn't load this data. Please try again.",
  "errors.generic.retry": "Retry",
```

In `apps/tour/src/i18n/fr-FR.json` add the matching keys:

```json
  "errors.forbidden.title": "Accès refusé",
  "errors.forbidden.description": "Vous n'avez pas la permission de voir ces données. Contactez un administrateur si vous pensez qu'il s'agit d'une erreur.",
  "errors.forbidden.back": "Retour au tableau de bord",
  "errors.generic.title": "Une erreur est survenue",
  "errors.generic.description": "Impossible de charger ces données. Veuillez réessayer.",
  "errors.generic.retry": "Réessayer",
```

(Insert as valid JSON entries — mind the surrounding commas; match the file's flat-key style.)

- [ ] **Step 2: Create the `Forbidden` component**

Create `apps/tour/src/components/forbidden.tsx`:

```tsx
import { Link } from '@tanstack/react-router'
import { useTranslate } from '@tolgee/react'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { ShieldAlert } from 'lucide-react'

export function Forbidden() {
  const { t } = useTranslate()
  return (
    <div className="flex justify-center py-12">
      <Card className="max-w-md text-center">
        <CardHeader>
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <CardTitle>{t('errors.forbidden.title')}</CardTitle>
          <CardDescription>{t('errors.forbidden.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/">{t('errors.forbidden.back')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Create the `ErrorState` component**

Create `apps/tour/src/components/error-state.tsx`:

```tsx
import { useTranslate } from '@tolgee/react'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { TriangleAlert } from 'lucide-react'

export function ErrorState({ reset }: { reset?: () => void }) {
  const { t } = useTranslate()
  return (
    <div className="flex justify-center py-12">
      <Card className="max-w-md text-center">
        <CardHeader>
          <TriangleAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <CardTitle>{t('errors.generic.title')}</CardTitle>
          <CardDescription>{t('errors.generic.description')}</CardDescription>
        </CardHeader>
        {reset
          ? (
              <CardContent>
                <Button variant="outline" onClick={reset}>{t('errors.generic.retry')}</Button>
              </CardContent>
            )
          : null}
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Type-check & lint**

Run: `pnpm --filter @czo/tour check-types` then `pnpm lint`
Expected: clean (confirm `@workspace/ui/components/card` exports `CardDescription` — it does; verify the import path matches how `users-list.tsx`/other components import ui). If a `Button asChild` prop isn't supported, wrap the `Link` in a `Button` via `onClick`/`navigate` instead — but `asChild` is the shadcn convention and is available.

- [ ] **Step 5: Stage (no commit)**

`git add apps/tour/src/components/forbidden.tsx apps/tour/src/components/error-state.tsx apps/tour/src/i18n/en.json apps/tour/src/i18n/fr-FR.json` — **do NOT commit.**

---

### Task 4: `DataErrorBoundary` + router wiring

**Files:**
- Create: `apps/tour/src/components/data-error-boundary.tsx`
- Test: `apps/tour/src/components/data-error-boundary.test.tsx`
- Modify: `apps/tour/src/router.tsx`

**Interfaces:**
- Consumes: `isForbiddenError`/`isUnauthenticatedError` (Task 2); `Forbidden`/`ErrorState` (Task 3); TanStack Router `ErrorComponentProps` (`{ error, reset }`) + `Navigate`.
- Produces: `DataErrorBoundary` wired as the router `defaultErrorComponent`.

- [ ] **Step 1: Write the failing render test**

Create `apps/tour/src/components/data-error-boundary.test.tsx` (renderToString, mirroring `i18n/tolgee.test.tsx` — no testing-library needed):

```tsx
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GraphqlAdminError } from '../graphql/gql-admin.server'
import { classifyError } from './data-error-boundary'

describe('classifyError', () => {
  it('forbidden code → "forbidden"', () => {
    expect(classifyError(new GraphqlAdminError('[FORBIDDEN] x', undefined, 'FORBIDDEN'))).toBe('forbidden')
  })
  it('unauthenticated code → "unauthenticated"', () => {
    expect(classifyError({ code: 'UNAUTHENTICATED' })).toBe('unauthenticated')
  })
  it('anything else → "generic"', () => {
    expect(classifyError(new Error('boom'))).toBe('generic')
  })
})
```

(This tests the pure branching logic. `renderToString` is imported for parity with the repo's render tests; the DataErrorBoundary itself is thin glue verified by check-types + this classifier test.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @czo/tour test data-error-boundary`
Expected: FAIL — `./data-error-boundary` / `classifyError` don't exist.

- [ ] **Step 3: Create the boundary**

Create `apps/tour/src/components/data-error-boundary.tsx`:

```tsx
import type { ErrorComponentProps } from '@tanstack/react-router'
import { Navigate } from '@tanstack/react-router'
import { isForbiddenError, isUnauthenticatedError } from '../graphql/gql-admin.server'
import { ErrorState } from './error-state'
import { Forbidden } from './forbidden'

/** Pure branch selector — unit-tested without rendering. */
export function classifyError(error: unknown): 'forbidden' | 'unauthenticated' | 'generic' {
  if (isUnauthenticatedError(error))
    return 'unauthenticated'
  if (isForbiddenError(error))
    return 'forbidden'
  return 'generic'
}

/** Router `defaultErrorComponent`: renders at the errored route's Outlet, so an
 *  authed data error shows inside the `_authed` shell (sidebar/header intact). */
export function DataErrorBoundary({ error, reset }: ErrorComponentProps) {
  switch (classifyError(error)) {
    case 'unauthenticated':
      return <Navigate to="/login" />
    case 'forbidden':
      return <Forbidden />
    default:
      return <ErrorState reset={reset} />
  }
}
```

- [ ] **Step 4: Wire it as the router default error component**

In `apps/tour/src/router.tsx`, import it and add the option to `createRouter`:

```ts
import { DataErrorBoundary } from './components/data-error-boundary'
```

```ts
  const router = createRouter({
    routeTree,
    defaultPreloadStaleTime: 0,
    context: { queryClient },
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: DataErrorBoundary,
    Wrap: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @czo/tour test data-error-boundary`
Expected: PASS (3 classifier cases).

- [ ] **Step 6: Type-check & lint**

Run: `pnpm --filter @czo/tour check-types` then `pnpm lint`
Expected: clean. (`ErrorComponentProps` is exported by `@tanstack/react-router`; `Navigate` likewise.)

- [ ] **Step 7: Manual verification (optional — needs the stack)**

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm --filter @czo/auth build        # tour hits life's built admin subgraph
pnpm --filter @czo/life dev          # in one shell
pnpm --filter @czo/tour dev          # in another
```
Sign in as a user **without** `user:read`, navigate to `/users` → the "Access denied" panel renders inside the sidebar layout (URL stays `/users`). A user with `user:read` sees the table. (Optional — gates 1–6 are authoritative; note if not run.)

- [ ] **Step 8: Stage (no commit)**

`git add apps/tour/src/components/data-error-boundary.tsx apps/tour/src/components/data-error-boundary.test.tsx apps/tour/src/router.tsx` — **do NOT commit.**

---

## Self-Review

**Spec coverage:**
- Part A — `scopeAuth.unauthorizedError` emitting `extensions.code`, message `'Not authorized'`, principal via `context.auth?.user` → Task 1. ✅
- UNAUTHENTICATED vs FORBIDDEN discrimination → Task 1 (the `authed` check). ✅
- Part B detection (`gqlAdmin` code capture + predicates, serialization-robust via `[CODE]` prefix) → Task 2. ✅
- In-place global boundary (`defaultErrorComponent` → renders in `_authed` Outlet) with 3 branches → Task 4. ✅
- Forbidden + generic components, i18n EN/FR → Task 3. ✅
- Tests: kit e2e denial-code (FORBIDDEN + UNAUTHENTICATED); tour predicate units; boundary classifier test → Tasks 1, 2, 4. ✅

**Placeholder scan:** none — every code step is complete; every run step has a command + expected result.

**Type consistency:** `GraphqlAdminError(message, detail?, code?)` (3-arg) defined in Task 2 and used in Tasks 2 & 4 tests. `errorCode`/`isForbiddenError`/`isUnauthenticatedError` defined in Task 2, consumed in Task 4. `classifyError` defined + tested in Task 4. Code constants `'FORBIDDEN'`/`'UNAUTHENTICATED'` identical across kit (Task 1) and tour (Tasks 2/4). Component names `Forbidden`/`ErrorState` defined in Task 3, imported in Task 4.

**Note (createServerFn serialization):** detection prefers the `code` field but falls back to a `[CODE]` message prefix that `gqlAdmin` always writes — so a 403 is detected whether or not TanStack Start preserves the custom error field across the RPC boundary. The raw (prefixed) message is never shown to users; the UI renders i18n text.
