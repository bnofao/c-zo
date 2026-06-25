/**
 * One-off CLI: ensure the initial admin user exists. Shares the module runtime
 * with `main.ts`/`worker.ts` (DB + services) but serves no HTTP and forks no
 * queue consumers — it runs every module's `onStart` (so each module's access
 * domain is registered and roles resolve), seeds the admin via the shared
 * `ensureInitialAdmin` core, then tears down and exits.
 *
 * Run: `pnpm --filter @czo/life seed:admin`
 * Optional overrides: `pnpm --filter @czo/life seed:admin --email you@host --name "You"`
 * (password always comes from INITIAL_ADMIN_PASSWORD / the dev default).
 */
import process from 'node:process'

import { Access, InitialAdmin } from '@czo/auth/services'
import { useLogger } from '@czo/kit'
import * as Email from '@czo/kit/email/smtp'
import { buildRuntime } from '@czo/kit/module'
import { Effect, Layer, Redacted } from 'effect'

import { modules } from './modules'
import { dotEnvConfigProvider, runMain } from './runtime'

const logger = useLogger('life:seed-admin')

if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
  logger.error('AUTH_SECRET missing or shorter than 32 chars — refusing to start.')
  process.exit(1)
}
process.env.AUTH_APP ??= 'life'

/** Read `--flag value` from argv (optional overrides). */
const argOf = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const { runtimeLayer, startup, teardown } = buildRuntime({
  modules,
  services: Email.fromEnv,
})

const program = Effect.gen(function* () {
  // onStart across modules registers every access domain so any configured role
  // (not just auth's own) resolves. Freeze isn't needed for role lookup.
  yield* startup

  // Materialize the role cache. `onStart` hooks register statements/hierarchies
  // but `_providers` (read by `AccessService.roles`) is only populated by
  // `buildRoles`. In production this runs inside the auth module's `onStarted`
  // hook; the CLI never calls `started`, so we call it directly here — after
  // every module has registered its domain, before any role validation runs.
  const access = yield* Access.AccessService
  yield* access.buildRoles

  const cfg = yield* InitialAdmin.InitialAdminConfig
  const emailArg = argOf('--email')
  // Keep the override wrapped — it's a secret, like the config value.
  const email = emailArg ? Redacted.make(emailArg) : cfg.email
  const name = argOf('--name') ?? cfg.name

  if (!Redacted.value(email) || !Redacted.value(cfg.password)) {
    return yield* Effect.fail(
      new Error('INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are required (or run in dev).'),
    )
  }

  const result = yield* InitialAdmin.ensureInitialAdmin({
    email,
    name,
    password: cfg.password,
    role: cfg.role,
  })
  // Never log the address in clear (it's a secret).
  yield* Effect.logInfo(
    result.created ? 'initial admin created' : 'initial admin already existed',
  )
}).pipe(
  Effect.ensuring(teardown.pipe(Effect.catchCause(() => Effect.void))),
  Effect.scoped,
  Effect.provide(Layer.mergeAll(runtimeLayer)),
  Effect.provide(dotEnvConfigProvider),
)

// Cast mirrors worker.ts: `runtimeLayer` provides the module services at runtime
// even though its type only advertises DrizzleDb.
runMain(program as Effect.Effect<void, unknown, never>)
