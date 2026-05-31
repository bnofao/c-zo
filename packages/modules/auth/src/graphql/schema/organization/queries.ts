import type { AuthGraphQLSchemaBuilder } from '../..'
import { decodeGlobalID, UnauthenticatedError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { OrganizationService } from '../../../services/organization'

// ─── Organization Queries ─────────────────────────────────────────────────────

export function registerOrganizationQueries(builder: AuthGraphQLSchemaBuilder): void {
  // ── organization(id) — single org by ID ──────────────────────────────────
  builder.queryField('organization', t =>
    t.drizzleField({
      type: 'organizations',
      nullable: true,
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'organization', actions: ['read'] } },
      resolve: async (_query, _root, args, ctx) => {
        const { id } = decodeGlobalID(args.id)
        const program = Effect.gen(function* () {
          const svc = yield* OrganizationService
          return yield* svc.findFirst({ where: { id: Number(id) } })
        }).pipe(Effect.catchTag('OrganizationNotFound', () => Effect.succeed(null)))
        return ctx.runEffect(program)
      },
    }))

  // ── organizations(connection) — paginated list ────────────────────────────
  builder.queryField('organizations', t =>
    t.drizzleConnection({
      type: 'organizations',
      args: {
        search: t.arg.string({ required: false }),
      },
      authScopes: { permission: { resource: 'organization', actions: ['read'] } },
      resolve: async (query, _root, args, ctx) => {
        const program = Effect.gen(function* () {
          const svc = yield* OrganizationService
          return yield* svc.findMany(query({
            // Drizzle RQBv2 filter-callback typing is not publicly exported.
            where: args.search
              ? { name: { ilike: `%${args.search}%` } }
              : undefined,
          }))
        })
        return ctx.runEffect(program)
      },
    }))

  // ── checkSlug(slug) — verify organization slug availability ───────────────
  builder.queryField('checkSlug', t =>
    t.field({
      type: 'Boolean',
      args: {
        slug: t.arg.string({ required: true }),
      },
      authScopes: { permission: { resource: 'organization', actions: ['read'] } },
      resolve: async (_root, args, ctx) => {
        return ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.checkSlug(args.slug)
          }),
        )
      },
    }))

  // ── members(organizationId) — list members of an org ─────────────────────
  builder.queryField('members', t =>
    t.drizzleConnection({
      type: 'members',
      args: {
        organizationId: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'organization', actions: ['read'] } },
      resolve: async (query, _root, args, ctx) => {
        const { id } = decodeGlobalID(args.organizationId)
        return await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.listMembers(Number(id), query({}))
          }),
        )
      },
    }))

  // ── invitation(id) — single invitation by ID ─────────────────────────────
  builder.queryField('invitation', t =>
    t.drizzleField({
      type: 'invitations',
      nullable: true,
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'organization', actions: ['read'] } },
      resolve: async (_query, _root, args, ctx) => {
        const { id } = decodeGlobalID(args.id)
        const program = Effect.gen(function* () {
          const svc = yield* OrganizationService
          return yield* svc.getInvitation(Number(id))
        }).pipe(Effect.catchTag('InvitationNotFound', () => Effect.succeed(null)))
        return ctx.runEffect(program)
      },
    }))

  // ── invitations(organizationId) — list invitations for an org ────────────
  builder.queryField('invitations', t =>
    t.drizzleConnection({
      type: 'invitations',
      args: {
        organizationId: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'organization', actions: ['read'] } },
      resolve: async (query, _root, args, ctx) => {
        const { id } = decodeGlobalID(args.organizationId)
        return await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.listInvitations(Number(id), query({}))
          }),
        )
      },
    }))

  // ── myInvitations — invitations for the authenticated user ────────────────
  builder.queryField('myInvitations', t =>
    t.drizzleConnection({
      type: 'invitations',
      authScopes: { permission: { resource: 'organization', actions: ['read'] } },
      resolve: async (query, _root, _args, ctx) => {
        const authUser = ctx.auth?.user
        if (!authUser)
          throw new UnauthenticatedError()

        return await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.listUserInvitations(authUser.email, query({}))
          }),
        )
      },
    }))

  // `activeMember` and `activeMemberRole` (session-aware organization helpers)
  // are deferred — they need request-scoped session context not yet plumbed
  // into this resolver.
}
