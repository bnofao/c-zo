import type { Auth } from '@czo/auth/config'
import { Context } from 'effect'

/**
 * Tag exposing the `Auth` instance produced by `createAuth(db, options)`.
 * Wrapping it in an Effect Tag lets layers depend on better-auth via the
 * usual `yield* BetterAuth` pattern instead of closure injection.
 *
 * The runtime `BetterAuthLive` layer is built in the auth Nitro plugin from
 * the IoC container singleton (so config + DB are already wired).
 */
export class BetterAuth extends Context.Tag('@czo/auth/BetterAuth')<BetterAuth, Auth>() {}
