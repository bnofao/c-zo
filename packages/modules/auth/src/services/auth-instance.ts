import type { Auth } from '@czo/auth/layers'
import { Context } from 'effect'

/**
 * Tag exposing the `Auth` instance produced by `createAuth(db, options)`.
 * Wrapping it in an Effect Tag lets layers depend on better-auth via the
 * usual `yield* BetterAuth` pattern instead of closure injection.
 *
 * The runtime `BetterAuthLive` layer is built lazily by `makeBetterAuthLive`
 * (in `layers/better-auth/`), which yields `DrizzleDb` + `AccessService` and
 * calls `createAuth(db, { ...opts, ac, roles })`.
 *
 * Type-only import from `../layers/better-auth` is intentional: `Auth =
 * ReturnType<typeof createAuth>` is structural, and TS erases the import at
 * build time, so there is no runtime services→layers dependency.
 */
export class BetterAuth extends Context.Tag('@czo/auth/BetterAuth')<BetterAuth, Auth>() {}
