import type { AuthGraphQLSchemaBuilder } from '../../index'
import { UnauthenticatedError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { ApiKeyService } from '../../../services/api-key'
import { OrganizationService } from '../../../services/organization'

// ─── API Key Queries ──────────────────────────────────────────────────────────

export function registerApiKeyQueries(builder: AuthGraphQLSchemaBuilder): void {
  // ── apiKey(id) — single API key, ownership-OR-membership guarded ─────────
  builder.queryField('apiKey', t =>
    t.drizzleField({
      type: 'apikeys',
      nullable: true,
      args: {
        id: t.arg.globalID({ for: 'ApiKey', required: true }),
      },
      authScopes: { auth: true },
      resolve: async (_query, _root, args, ctx) => {
        const user = ctx.auth?.user
        if (!user)
          throw new UnauthenticatedError()

        const keyId = Number(args.id.id)
        const program = Effect.gen(function* () {
          const svc = yield* ApiKeyService
          const key = yield* svc.findFirst({ where: { id: keyId } }).pipe(
            Effect.catchTag('ApiKeyNotFound', () => Effect.succeed(null)),
          )
          if (!key)
            return null

          // Ownership-OR-membership guard.
          if (key.reference === 'user')
            return String(key.referenceId) === String(user.id) ? key : null

          const org = yield* OrganizationService
          const isMember = yield* org.checkMembership(key.referenceId, Number(user.id))
          return isMember ? key : null
        })
        return ctx.runEffect(program)
      },
    }))

  // ── myApiKeys — all keys owned by the calling user ────────────────────────
  builder.queryField('myApiKeys', t =>
    t.drizzleConnection({
      type: 'apikeys',
      authScopes: { auth: true },
      resolve: async (query, _root, _args, ctx) => {
        const user = ctx.auth?.user
        if (!user)
          throw new UnauthenticatedError()

        const program = Effect.gen(function* () {
          const svc = yield* ApiKeyService
          return yield* svc.findMany(query({
            where: { reference: 'user', referenceId: Number(user.id) },
          }))
        })
        return ctx.runEffect(program)
      },
    }))

  // ── organizationApiKeys — all keys owned by a given organization ──────────
  builder.queryField('organizationApiKeys', t =>
    t.drizzleConnection({
      type: 'apikeys',
      args: {
        organizationId: t.arg.globalID({ for: 'Organization', required: true }),
      },
      authScopes: (_parent: unknown, args) => ({
        permission: {
          resource: 'api-key',
          actions: ['read'],
          organization: Number(args.organizationId.id),
        },
      }),
      resolve: async (query, _root, args, ctx) => {
        const orgId = Number(args.organizationId.id)
        const program = Effect.gen(function* () {
          const svc = yield* ApiKeyService
          return yield* svc.findMany(query({
            where: { reference: 'organization', referenceId: orgId },
          }))
        })
        return ctx.runEffect(program)
      },
    }))
}
