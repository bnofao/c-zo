import type { AuthContext } from '@czo/auth/types'
import type { SchemaBuilder } from '@czo/kit/graphql'
import { runEffect } from '@czo/kit/effect'
import { decodeGlobalID, UnauthenticatedError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { OrganizationService } from '../../../services/organization'
import { InvitationNotFound, OrganizationNotFound } from './errors'

interface Ctx { auth: AuthContext, request?: Request }

// ─── Organization Queries ─────────────────────────────────────────────────────

export function registerOrganizationQueries(builder: SchemaBuilder): void {
  // ── organization(id) — single org by ID ──────────────────────────────────
  builder.queryField('organization', t =>
    t.drizzleField({
      type: 'organizations',
      nullable: true,
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'organization', actions: ['read'] } },
      resolve: async (_query, _root, args, ctx: Ctx) => {
        const { id } = decodeGlobalID(args.id)
        const program = Effect.gen(function* () {
          const svc = yield* OrganizationService
          return yield* svc.findFirst({ where: { id: Number(id) } })
        }).pipe(Effect.catchTag('OrganizationNotFound', () => Effect.succeed(null)))
        return runEffect(ctx.auth.runtime, program)
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
      resolve: async (query, _root, args, ctx: Ctx) => {
        const program = Effect.gen(function* () {
          const svc = yield* OrganizationService
          return yield* svc.findMany(query({
            // Drizzle RQBv2 filter-callback typing is not publicly exported.
            where: args.search
              ? { name: { ilike: `%${args.search}%` } } as any
              : undefined,
          }))
        })
        return runEffect(ctx.auth.runtime, program) as any
      },
      edgesField: {},
    }))

  // ── checkSlug(slug) — verify organization slug availability ───────────────
  builder.queryField('checkSlug', t =>
    t.field({
      type: 'Boolean',
      args: {
        slug: t.arg.string({ required: true }),
      },
      authScopes: { permission: { resource: 'organization', actions: ['read'] } },
      resolve: async (_root, args, ctx: Ctx) => {
        return runEffect(
          ctx.auth.runtime,
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.checkSlug(args.slug)
          }),
        )
      },
    }))

  // ── members(organizationId) — list members of an org ─────────────────────
  builder.queryField('members', t =>
    t.field({
      type: ['Member'],
      args: {
        organizationId: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'organization', actions: ['read'] } },
      resolve: async (_root, args, ctx: Ctx) => {
        const { id } = decodeGlobalID(args.organizationId)
        return await runEffect(
          ctx.auth.runtime,
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.listMembers(Number(id))
          }),
        ) as any
      },
    }))

  // ── invitation(id) — single invitation by ID ─────────────────────────────
  builder.queryField('invitation', t =>
    t.field({
      type: 'Invitation',
      nullable: true,
      errors: { types: [InvitationNotFound] },
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'organization', actions: ['read'] } },
      resolve: async (_root, args, ctx: Ctx) => {
        const { id } = decodeGlobalID(args.id)
        const program = Effect.gen(function* () {
          const svc = yield* OrganizationService
          return yield* svc.getInvitation(Number(id))
        }).pipe(Effect.catchTag('InvitationNotFound', () => Effect.succeed(null)))
        return runEffect(ctx.auth.runtime, program) as any
      },
    }))

  // ── invitations(organizationId) — list invitations for an org ────────────
  builder.queryField('invitations', t =>
    t.field({
      type: ['Invitation'],
      args: {
        organizationId: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'organization', actions: ['read'] } },
      resolve: async (_root, args, ctx: Ctx) => {
        const { id } = decodeGlobalID(args.organizationId)
        return await runEffect(
          ctx.auth.runtime,
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.listInvitations(Number(id))
          }),
        ) as any
      },
    }))

  // ── myInvitations — invitations for the authenticated user ────────────────
  builder.queryField('myInvitations', t =>
    t.field({
      type: ['Invitation'],
      authScopes: { permission: { resource: 'organization', actions: ['read'] } },
      resolve: async (_root, _args, ctx: Ctx) => {
        const authUser = ctx.auth?.user
        if (!authUser)
          throw new UnauthenticatedError()

        return await runEffect(
          ctx.auth.runtime,
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.listUserInvitations(authUser.email)
          }),
        ) as any
      },
    }))

  // ─── better-auth-backed queries (phase 2) ──────────────────────────────────
  // `activeMember` and `activeMemberRole` wrap better-auth's session-aware
  // organization plugin API. They will be re-introduced once the BetterAuth
  // Tag exposes the request-scoped context. Intentionally absent from the
  // schema until then.
  void OrganizationNotFound
}
