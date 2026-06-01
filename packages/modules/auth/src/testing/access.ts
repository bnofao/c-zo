import { Effect, Layer } from 'effect'
import * as Access from '../services/access'

/**
 * Seed `AccessService` and materialize its role cache at build time.
 *
 * In production the `_providers` role cache is populated by `access.buildRoles`
 * in the auth module's `onStarted` hook — after every module has registered its
 * domains. Tests bypass the `buildApp` lifecycle and wire the access layer
 * directly, so nothing calls `buildRoles`; the cache stays empty and every role
 * validation fails with `OrgInvalidRole`.
 *
 * This wraps {@link Access.makeLayer} and runs `buildRoles` once, against the
 * same memoized `AccessService` instance the rest of the layer graph consumes,
 * so seeded `org:*` / `admin` roles are valid the moment the layer is built.
 */
export function seededAccessLayer(
  ...args: Parameters<typeof Access.makeLayer>
): Layer.Layer<Access.AccessService> {
  const buildCache = Layer.effectDiscard(
    Effect.flatMap(Access.AccessService, service => service.buildRoles),
  )
  return buildCache.pipe(Layer.provideMerge(Access.makeLayer(...args)))
}
