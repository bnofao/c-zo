# Access-Denied Boundary for `apps/tour` — Design Spec

**Date:** 2026-06-25
**Status:** Approved (design) — ready for implementation plan
**Scope:** two coordinated parts — (A) `@czo/kit` emits a denial error code on the wire; (B) `apps/tour` detects it and renders an in-place 403 boundary.

## Goal

When an authenticated `tour` user lacks the role/permission to load a route's
data, show an **"Access Denied" (403) panel in place** — inside the `_authed`
shell (sidebar + header intact, URL unchanged) — globally across authed routes.
Session-expired → redirect to `/login`; other errors (network/500) → a generic
error panel with retry.

## Why

`_authed` already guards **authentication** (`fetchMe` → redirect to `/login`).
There is no handling for **authorization** failures: a logged-in user without
the required permission currently hits a bare error fallback (the router has a
`defaultNotFoundComponent` but no error component). This adds a friendly,
consistent 403 experience.

## Verification result (the flagged risk — resolved)

A declarative permission gate (`authScopes: { permission: … }`) throws
`@pothos/plugin-scope-auth`'s `ForbiddenError`. Confirmed in the installed
package: it `extends PothosValidationError extends PothosError extends
GraphQLError` (so graphql-yoga does **not** mask it), **but** its constructor
calls `super(message)` and sets `code = 'FORBIDDEN'` as a **class property** —
it does **not** pass `{ extensions: { code } }`. So the wire response carries
only `errors[0].message` (`"Not authorized to …"`), **no `extensions.code`**.

⇒ Detecting denials reliably requires the API to put the code in `extensions`.
Kit sets no `scopeAuth.unauthorizedError`, so this is a small, well-contained
change in one place (`packages/kit/src/graphql/builder.ts`).

## Decisions

| Decision | Choice |
|----------|--------|
| Form | In-place 403 boundary (renders where the data would be; URL unchanged). |
| Scope | Global — router `defaultErrorComponent` (renders at each errored route's own Outlet → inside the `_authed` shell). |
| Cases | permission → 403 panel; session-expired (`UNAUTHENTICATED`) → redirect `/login`; other → generic error + retry. |
| Detection signal | `errors[].extensions.code` (`'FORBIDDEN'` / `'UNAUTHENTICATED'`), emitted by kit (Part A) and surfaced by `gqlAdmin` (Part B). |
| i18n | Tolgee keys in `i18n/en.json` + `i18n/fr-FR.json`. |

## Architecture

### Part A — kit emits `extensions.code` on scope-auth denials
`packages/kit/src/graphql/builder.ts`, the `scopeAuth` plugin block: add an
`unauthorizedError` that returns a `GraphQLError` carrying `extensions.code`:

```ts
scopeAuth: {
  authScopes: async ctx => Object.assign({}, ...authScope.map(scope => scope(ctx))),
  unauthorizedError: (_parent, context, _info, result) =>
    new GraphQLError(
      'Not authorized',
      { extensions: { code: isUnauthenticated(context, result) ? 'UNAUTHENTICATED' : 'FORBIDDEN' } },
    ),
},
```

- `FORBIDDEN` when an authenticated principal lacks the scope; `UNAUTHENTICATED`
  when there is no principal (auth/`{ auth: true }` scope failed with no session).
- `isUnauthenticated(context, result)` is a small local predicate. The exact
  discriminator (inspect the auth context for a session/principal, or the
  scope-auth `result.failure` kind) is pinned in the plan; default to `FORBIDDEN`
  when ambiguous (the `_authed` guard already redirects truly-unauthenticated
  users, so `FORBIDDEN` is the safe default).
- This is platform-wide: every declarative permission denial now returns a
  detectable `extensions.code` for any client (REST/GraphQL consumers, not just
  tour). The thrown-error message stays human-readable.

### Part B — tour detection + boundary + components

**1. `gqlAdmin` captures the code** (`apps/tour/src/graphql/gql-admin.server.ts`)
`GraphqlAdminError` gains a `code?: string` set from the first error's
`extensions.code` (currently only `message` is read). Add small predicates
`isForbiddenError(err)` / `isUnauthenticatedError(err)` that read the code,
**robust to the `createServerFn`-serialized shape** (the thrown error crosses
the RPC boundary as a plain object — prototype lost). The plan verifies `code`
survives serialization; fallback if it doesn't: prefix the thrown `message`
with the code (e.g. `"[FORBIDDEN] …"`) and parse it in the predicate.

**2. Global boundary** (`apps/tour/src/router.tsx`)
Set `defaultErrorComponent: DataErrorBoundary`. TanStack renders it at the
errored route's Outlet, so a `/users` loader error renders inside the `_authed`
layout. Branches:
- `isUnauthenticatedError(error)` → `<Navigate to="/login" />`.
- `isForbiddenError(error)` → `<Forbidden />`.
- else → `<ErrorState error reset />` (message + Retry → `reset()`).

**3. Components** (`apps/tour/src/components/`)
- `forbidden.tsx` — Access-Denied panel: lucide `ShieldAlert`, title, description,
  "Back to dashboard" link (`/`), built from `@workspace/ui` (Card/Button),
  matching tour's existing visual style.
- `error-state.tsx` — `ErrorState`: message + Retry button (calls the
  `errorComponent` `reset` prop).
- i18n: `errors.forbidden.{title,description,back}` and
  `errors.generic.{title,retry}` added to `i18n/en.json` + `i18n/fr-FR.json`.

## Data flow

1. Route loader → `queryClient.ensureQueryData` → server fn (`fetchUsers`, …) →
   `gqlAdmin('/graphql/admin')`.
2. Denied: API returns `errors[0].extensions.code = 'FORBIDDEN'` (Part A) →
   `gqlAdmin` throws `GraphqlAdminError{ code:'FORBIDDEN' }` → server fn throws →
   `createServerFn` serializes → loader throws → router renders
   `DataErrorBoundary` at the route's Outlet (inside `_authed`).
3. `DataErrorBoundary` branches on the code → `<Forbidden/>` / redirect / generic.

## Error handling

| Case | Detection | Behavior |
|------|-----------|----------|
| Lacks permission | `code === 'FORBIDDEN'` | `<Forbidden/>` in place. |
| No/expired session | `code === 'UNAUTHENTICATED'` | `<Navigate to="/login"/>`. (Also still covered on navigation by the existing `_authed` `fetchMe` redirect.) |
| Network / 500 / other | neither code | `<ErrorState/>` with Retry. |

## Testing

- **kit (Part A):** an integration/e2e assertion that a field-level permission
  denial on a sub-graph now returns `errors[0].extensions.code === 'FORBIDDEN'`
  (extend the existing auth e2e that exercises a denied admin query). If a
  no-principal path is discriminated, assert `'UNAUTHENTICATED'` there.
- **tour (Part B):**
  - `gqlAdmin` unit: sets `code` from `extensions.code`; `isForbiddenError` /
    `isUnauthenticatedError` on both a live `GraphqlAdminError` and the
    serialized plain-object form.
  - `DataErrorBoundary` render test (tour's vitest + testing-library): forbidden
    → Forbidden panel; unauthenticated → redirect; other → generic + retry.

## Blast radius

- Part A changes the wire shape of **every** declarative scope-auth denial
  (adds `extensions.code`, normalizes the message to `'Not authorized'`). Any
  existing test asserting the prior Pothos default message (`"Not authorized to
  …"`) must be updated — the plan greps for and fixes those. Node-guard denials
  (relay `node(id:)` → `null`, no error) are a different mechanism and are
  unaffected.
- Part B is additive in tour (new components + router option + `gqlAdmin` field);
  no existing tour route behavior changes except gaining the error boundary.

## Out of scope

- Hiding/disabling sidebar nav items by permission (separate concern).
- Per-field partial-permission UIs.
- Changing node-guard `null`-on-denial behavior.
- A standalone `/forbidden` route (chosen: in-place boundary).

## Files touched

- **Modify:** `packages/kit/src/graphql/builder.ts` — `scopeAuth.unauthorizedError`.
- **Modify:** `apps/tour/src/graphql/gql-admin.server.ts` — `code` capture + predicates.
- **Modify:** `apps/tour/src/router.tsx` — `defaultErrorComponent`.
- **Create:** `apps/tour/src/components/forbidden.tsx`, `apps/tour/src/components/error-state.tsx`, `apps/tour/src/components/data-error-boundary.tsx`.
- **Modify:** `apps/tour/src/i18n/en.json`, `apps/tour/src/i18n/fr-FR.json`.
- **Tests:** kit denial-code assertion; tour `gqlAdmin`/predicate unit + boundary render test.
- **Modify (if present):** tests asserting the old scope-auth denial message.
