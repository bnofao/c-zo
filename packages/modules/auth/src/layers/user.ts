import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db/effect'
import { users } from '@czo/auth/schema'
import { DrizzleDb } from '@czo/kit/db/effect'
import { parseSessionOutput } from 'better-auth/db'
import { eq } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import {
  AccessService,
  BetterAuth,
  CannotBanSelf,
  CannotDemoteSelf,
  CannotRemoveSelf,
  CredentialLinkFailed,
  InvalidRole,
  PasswordHashFailed,
  UserAlreadyBanned,
  UserAlreadyExists,
  UserDbFailed,
  UserEvents,
  UserNoChanges,
  UserNotBanned,
  UserNotFound,
  UserService,
  validateRole,
} from '../services'

/**
 * Build the `UserService` Live layer.
 *
 * Roles are materialized from `AccessService.buildRoles` at layer build time
 * (memoized per-runtime by Effect). The previous tri-state semantics ("no
 * registry → accept all") is dropped — AccessService is always present, so
 * any role passed to `setRole` / `create` is validated against the registry.
 */
export function makeUserServiceLive() {
  return Layer.effect(
    UserService,
    Effect.gen(function* () {
      const db = (yield* DrizzleDb) as Database<Relations>
      const auth = yield* BetterAuth
      const access = yield* AccessService
      const { roles } = yield* access.buildRoles
      const events = yield* UserEvents

      const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
        eff.pipe(Effect.mapError(cause => new UserDbFailed({ cause })))

      const findById = (id: number) =>
        Effect.gen(function* () {
          const row = yield* dbErr(db.query.users.findFirst({ where: { id } }))
          if (!row)
            return yield* Effect.fail(new UserNotFound())
          return row
        })

      const ensureValidRole = (role: string | string[]) =>
        Effect.gen(function* () {
          const valid = validateRole(role, roles)
          if (!valid)
            return yield* Effect.fail(new InvalidRole({ role: Array.isArray(role) ? role.join(',') : role }))
          return valid
        })

      const updateUserRow = (id: number, patch: Record<string, unknown>) =>
        Effect.gen(function* () {
          const [row] = yield* dbErr(
            db.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, id)).returning(),
          )
          if (!row)
            return yield* Effect.fail(new UserDbFailed({ cause: 'update returned no row' }))
          return row
        })

      return UserService.of({
        findMany: (config?) =>
          dbErr(db.query.users.findMany(config)).pipe(
            Effect.map(rows => rows),
          ),

        findFirst: (config?) =>
          Effect.gen(function* () {
            const row = yield* dbErr(db.query.users.findFirst(config))
            if (!row)
              return yield* Effect.fail(new UserNotFound())
            return row
          }),

        create: input =>
          Effect.gen(function* () {
            const existing = yield* dbErr(
              db.query.users.findFirst({ where: { email: input.email } }),
            )
            if (existing)
              return yield* Effect.fail(new UserAlreadyExists({ user: existing }))

            let role: string | undefined = input.role as string | undefined
            if (input.role) {
              role = yield* ensureValidRole(input.role)
            }

            const [user] = yield* dbErr(
              db.insert(users).values({
                ...input,
                role: role ?? 'user',
                createdAt: new Date(),
                updatedAt: new Date(),
              }).returning(),
            )
            if (!user)
              return yield* Effect.fail(new UserDbFailed({ cause: 'insert returned no row' }))

            // Link credential if a password was provided. Failure is now a
            // tagged error (`CredentialLinkFailed`) — callers must decide
            // whether to compensate; we don't silently leave a credential-less
            // user any more.
            if (input.password) {
              const linkResult = yield* Effect.result(
                Effect.tryPromise({
                  try: async () => {
                    const ctx = await auth.$context
                    const hashedPassword = await ctx.password.hash(input.password!)
                    await ctx.internalAdapter.linkAccount({
                      accountId: String(user.id),
                      providerId: 'credential',
                      userId: String(user.id),
                      password: hashedPassword,
                    })
                  },
                  catch: cause => new CredentialLinkFailed({ cause }),
                }),
              )
              if (linkResult._tag === 'Failure')
                return yield* Effect.fail(new CredentialLinkFailed({ cause: linkResult.failure.cause }))
            }

            yield* Effect.forkDetach(events.publish({ _tag: 'UserCreated', userId: user.id, email: user.email }))
            return user
          }),

        update: (id, input) =>
          Effect.gen(function* () {
            yield* findById(id)

            if (Object.keys(input).length === 0)
              return yield* Effect.fail(new UserNoChanges())

            let role: string | undefined = input.role as string | undefined
            if (input.role) {
              role = yield* ensureValidRole(input.role)
            }

            const row = yield* updateUserRow(id, { ...input, role })
            yield* Effect.forkDetach(events.publish({ _tag: 'UserUpdated', userId: id, changes: input as Record<string, unknown> }))
            return row
          }),

        ban: (id, input, actorId) =>
          Effect.gen(function* () {
            const existing = yield* findById(id)

            if (actorId !== undefined && existing.id === actorId)
              return yield* Effect.fail(new CannotBanSelf())

            if (existing.banned)
              return yield* Effect.fail(new UserAlreadyBanned())

            const row = yield* updateUserRow(id, {
              banned: true,
              banReason: input.reason ?? 'No reason provided',
              banExpires: typeof input.expiresIn === 'number'
                ? new Date(Date.now() + input.expiresIn * 1000)
                : null,
            })
            yield* Effect.forkDetach(events.publish({
              _tag: 'UserBanned',
              userId: id,
              bannedBy: actorId ?? null,
              reason: row.banReason,
              expires: row.banExpires,
            }))
            return row
          }),

        unban: (id, actorId) =>
          Effect.gen(function* () {
            const existing = yield* findById(id)
            if (!existing.banned)
              return yield* Effect.fail(new UserNotBanned())

            const row = yield* updateUserRow(id, {
              banned: false,
              banReason: null,
              banExpires: null,
            })
            yield* Effect.forkDetach(events.publish({ _tag: 'UserUnbanned', userId: id, unbannedBy: actorId ?? null }))
            return row
          }),

        setRole: (id, role, actorId) =>
          Effect.gen(function* () {
            const existing = yield* findById(id)
            const validRole = yield* ensureValidRole(role)

            if (actorId !== undefined && existing.id === actorId)
              return yield* Effect.fail(new CannotDemoteSelf())

            const row = yield* updateUserRow(id, { role: validRole })
            yield* Effect.forkDetach(events.publish({
              _tag: 'UserRoleChanged',
              userId: id,
              previousRole: existing.role,
              newRole: validRole,
              changedBy: actorId ?? null,
            }))
            return row
          }),

        setPassword: (id, password) =>
          Effect.gen(function* () {
            yield* findById(id)

            const result = yield* Effect.result(
              Effect.tryPromise({
                try: async () => {
                  const ctx = await auth.$context
                  const hashed = await ctx.password.hash(password)
                  await ctx.internalAdapter.updatePassword(String(id), hashed)
                  return true as const
                },
                catch: cause => new PasswordHashFailed({ cause }),
              }),
            )
            if (result._tag === 'Failure')
              return yield* Effect.fail(result.failure)
            return true as const
          }),

        remove: (id, actorId) =>
          Effect.gen(function* () {
            const existing = yield* findById(id)

            if (actorId !== undefined && existing.id === actorId)
              return yield* Effect.fail(new CannotRemoveSelf())

            yield* Effect.tryPromise({
              try: async () => {
                const ctx = await auth.$context
                await ctx.internalAdapter.deleteUser(String(id))
              },
              catch: cause => new UserDbFailed({ cause }),
            })
            yield* Effect.forkDetach(events.publish({ _tag: 'UserDeleted', userId: id, email: existing.email }))
            return true as const
          }),

        listSessions: id =>
          Effect.tryPromise({
            try: async () => {
              const ctx = await auth.$context
              const list = await ctx.internalAdapter.listSessions(String(id))
              return list.map(s => parseSessionOutput(ctx.options, s)) as never
            },
            catch: cause => new UserDbFailed({ cause }),
          }),

        revokeSession: token =>
          Effect.tryPromise({
            try: async () => {
              const ctx = await auth.$context
              await ctx.internalAdapter.deleteSessions(token)
              return true as const
            },
            catch: cause => new UserDbFailed({ cause }),
          }),

        revokeSessions: id =>
          Effect.tryPromise({
            try: async () => {
              const ctx = await auth.$context
              await ctx.internalAdapter.deleteSessions(String(id))
              return true as const
            },
            catch: cause => new UserDbFailed({ cause }),
          }),
      })
    }),
  )
}
