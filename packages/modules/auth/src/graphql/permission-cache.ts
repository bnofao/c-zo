// Per-request memo for permission-scope evaluations.
//
// Each graft-gated GraphQL field independently evaluates the `permission` auth
// scope (see `scopes.ts`), and an org-scoped check issues a `members` lookup
// every time. Within ONE request the actor's membership/role is a consistent
// snapshot, so the same `(user, org, resource, action)` decision is stable and
// can be reused across fields.
//
// The cache is keyed by the GraphQL context object's IDENTITY: kit's
// `buildContext` (packages/kit/src/graphql/builder.ts) creates exactly one
// context object per request and passes that same object to every scope/resolver
// evaluation. A `WeakMap` keyed on it therefore scopes entries to the request and
// releases them automatically when the context is GC'd — no manual eviction, no
// cross-request leakage, and no change to kit's `GraphQLContextMap` type.
// (For GraphQL subscriptions the context lives as long as the subscription, so
// the cache does too — bounded by that lifetime, released when it ends.)
//
// We store the in-flight `Promise<boolean>` (not the resolved boolean) so that
// scope evaluations racing across fields share a single computation.
const requestCaches = new WeakMap<object, Map<string, Promise<boolean>>>()

/**
 * Compute `compute()` at most once per distinct `(ctx, key)` and reuse the
 * resulting `Promise<boolean>` for the lifetime of `ctx` (one request).
 */
export function cachedPermission(
  ctx: object,
  key: string,
  compute: () => Promise<boolean>,
): Promise<boolean> {
  let cache = requestCaches.get(ctx)
  if (cache === undefined) {
    cache = new Map<string, Promise<boolean>>()
    requestCaches.set(ctx, cache)
  }
  const hit = cache.get(key)
  if (hit !== undefined)
    return hit
  const pending = compute()
  cache.set(key, pending)
  return pending
}
