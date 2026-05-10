import type { AccessRole } from '@czo/auth/config'
import type { AuthRelations, User } from '@czo/auth/types'
import type { Database } from '@czo/kit/db'
import { users } from '@czo/auth/schema'
import { DrizzleDb } from '@czo/kit/db/effect'
import { parseSessionOutput } from 'better-auth/db'
import { eq } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import { BetterAuth } from '../services/better-auth'
import {
  CannotBanSelf,
  CannotDemoteSelf,
  CannotRemoveSelf,
  CredentialLinkFailed,
  InvalidRole,
  PasswordHashFailed,
  UserAlreadyBanned,
  UserAlreadyExists,
  UserDbFailed,
  UserNoChanges,
  UserNotBanned,
  UserNotFound,
  UserService,
} from '../services/user'
import { validateRole } from '../services/utils/validate-roles'

/**
 * Build the `UserService` Live layer.
 *
 * `roles` is captured by closure rather than provided via a Tag because
 * `validateRole` distinguishes "no registry → accept all" (legacy behaviour
 * when the plugin booted without an admin config) from "registry empty →
 * reject all". A Tag value can't be `undefined`, so the closure preserves
 * the tri-state semantics cleanly.
 */
export function makeUserServiceLive(roles?: Record<string, AccessRole>) {
  return Layer.effect(
    UserService,
    Effect.gen(function* () {
      const db = (yield* DrizzleDb) as Database<AuthRelations>
      const auth = yield* BetterAuth

      const tryDb = <A>(f: () => Promise<A>) =>
        Effect.tryPromise({ try: f, catch: cause => new UserDbFailed({ cause }) })

      const findById = (id: number) =>
        Effect.gen(function* () {
          const row = yield* tryDb(() => db.query.users.findFirst({ where: { id } }))
          if (!row)
            return yield* Effect.fail(new UserNotFound())
          return row as User
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
          const [row] = yield* tryDb(() =>
            db.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, id)).returning(),
          )
          if (!row)
            return yield* Effect.fail(new UserDbFailed({ cause: 'update returned no row' }))
          return row as User
        })

      return UserService.of({
        findMany: (config?) =>
          tryDb(() => db.query.users.findMany(config)).pipe(
            Effect.map(rows => rows as readonly User[]),
          ),

        findFirst: (config?) =>
          Effect.gen(function* () {
            const row = yield* tryDb(() => db.query.users.findFirst(config))
            if (!row)
              return yield* Effect.fail(new UserNotFound())
            return row as User
          }),

        create: input =>
          Effect.gen(function* () {
            const existing = yield* tryDb(() =>
              db.query.users.findFirst({ where: { email: input.email } }),
            )
            if (existing)
              return yield* Effect.fail(new UserAlreadyExists({ user: existing as User }))

            let role: string | undefined = input.role as string | undefined
            if (input.role) {
              role = yield* ensureValidRole(input.role)
            }

            const [user] = yield* tryDb(() =>
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
              const linkResult = yield* Effect.either(
                tryDb(async () => {
                  const ctx = await auth.$context
                  const hashedPassword = await ctx.password.hash(input.password!)
                  await ctx.internalAdapter.linkAccount({
                    accountId: String(user.id),
                    providerId: 'credential',
                    userId: String(user.id),
                    password: hashedPassword,
                  })
                }),
              )
              if (linkResult._tag === 'Left')
                return yield* Effect.fail(new CredentialLinkFailed({ cause: linkResult.left.cause }))
            }

            return user as User
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

            return yield* updateUserRow(id, { ...input, role })
          }),

        ban: (id, input, actorId) =>
          Effect.gen(function* () {
            const existing = yield* findById(id)

            if (actorId !== undefined && existing.id === actorId)
              return yield* Effect.fail(new CannotBanSelf())

            if (existing.banned)
              return yield* Effect.fail(new UserAlreadyBanned())

            return yield* updateUserRow(id, {
              banned: true,
              banReason: input.reason ?? 'No reason provided',
              banExpires: typeof input.expiresIn === 'number'
                ? new Date(Date.now() + input.expiresIn * 1000)
                : null,
            })
          }),

        unban: id =>
          Effect.gen(function* () {
            const existing = yield* findById(id)
            if (!existing.banned)
              return yield* Effect.fail(new UserNotBanned())

            return yield* updateUserRow(id, {
              banned: false,
              banReason: null,
              banExpires: null,
            })
          }),

        setRole: (id, role, actorId) =>
          Effect.gen(function* () {
            const existing = yield* findById(id)
            const validRole = yield* ensureValidRole(role)

            if (actorId !== undefined && existing.id === actorId)
              return yield* Effect.fail(new CannotDemoteSelf())

            return yield* updateUserRow(id, { role: validRole })
          }),

        setPassword: (id, password) =>
          Effect.gen(function* () {
            yield* findById(id)

            const result = yield* Effect.either(
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
            if (result._tag === 'Left')
              return yield* Effect.fail(result.left)
            return true as const
          }),

        remove: (id, actorId) =>
          Effect.gen(function* () {
            const existing = yield* findById(id)

            if (actorId !== undefined && existing.id === actorId)
              return yield* Effect.fail(new CannotRemoveSelf())

            yield* tryDb(async () => {
              const ctx = await auth.$context
              await ctx.internalAdapter.deleteUser(String(id))
            })
            return true as const
          }),

        listSessions: id =>
          tryDb(async () => {
            const ctx = await auth.$context
            const list = await ctx.internalAdapter.listSessions(String(id))
            return list.map(s => parseSessionOutput(ctx.options, s)) as never
          }),

        revokeSession: token =>
          tryDb(async () => {
            const ctx = await auth.$context
            await ctx.internalAdapter.deleteSessions(token)
            return true as const
          }),

        revokeSessions: id =>
          tryDb(async () => {
            const ctx = await auth.$context
            await ctx.internalAdapter.deleteSessions(String(id))
            return true as const
          }),
      })
    }),
  )
}
