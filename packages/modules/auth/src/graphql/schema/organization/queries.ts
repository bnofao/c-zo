import type { AuthContext } from '@czo/auth/types'
import type { SchemaBuilder } from '@czo/kit/graphql'
import { UnauthenticatedError } from '@czo/kit/graphql'

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
      resolve: async (query, _root: unknown, args: Record<string, unknown>) => {
        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any // db.query.* shape not available without full schema generic threading
        // Drizzle RQBv2: filter callback type (`TableFilter`) not publicly exported; cast required
        return db.query.organizations.findFirst(query({ where: (o: any, { eq }: any) => eq(o.id, String(args.id)) } as any))
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
      resolve: async (query, _root: unknown, args: any) => { // Pothos drizzleConnection args: complex inferred type requires any here
        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any // db.query.* shape not available without full schema generic threading
        const search = args.search as string | null | undefined
        // Drizzle RQBv2: filter callback type (`TableFilter`) not publicly exported; cast required
        return db.query.organizations.findMany(query({
          where: search
            ? (o: any, { ilike }: any) => ilike(o.name, `%${search}%`)
            : undefined,
        } as any))
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
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { slug: string }, ctx: Ctx) => {
        const result = await ctx.auth.organizationService.checkSlug(args.slug)
        // result.status is a boolean: true means slug is available (not taken)
        return result?.status ?? false
      },
    }))

  // ── members(organizationId) — list members of an org ─────────────────────
  // Direct service call since org members don't appear in authRelations
  builder.queryField('members', t =>
    t.field({
      type: ['Member'],
      args: {
        organizationId: t.arg.id({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { organizationId: string }, ctx: Ctx) => {
        const result = await ctx.auth.organizationService.listMembers(
          { organizationId: String(args.organizationId) },
        )
        return result ?? []
      },
    }))

  // ── invitation(id) — single invitation by ID ─────────────────────────────
  builder.queryField('invitation', t =>
    t.field({
      type: 'Invitation',
      nullable: true,
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { id: string }, ctx: Ctx) => {
        return ctx.auth.organizationService.getInvitation(String(args.id))
      },
    }))

  // ── invitations(organizationId) — list invitations for an org ────────────
  builder.queryField('invitations', t =>
    t.field({
      type: ['Invitation'],
      args: {
        organizationId: t.arg.id({ required: false }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { organizationId?: string | null }, ctx: Ctx) => {
        const result = await ctx.auth.organizationService.listInvitations(
          args.organizationId ? String(args.organizationId) : undefined,
        )
        return result ?? []
      },
    }))

  // ── myInvitations — invitations for the authenticated user ────────────────
  builder.queryField('myInvitations', t =>
    t.field({
      type: ['Invitation'],
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, _args: unknown, ctx: Ctx) => {
        const authUser = ctx.auth?.user
        if (!authUser)
          throw new UnauthenticatedError()

        const result = await ctx.auth.organizationService.listUserInvitations(authUser.email)
        return result ?? []
      },
    }))

  // ── activeMember — the active member record for the authenticated user ────
  builder.queryField('activeMember', t =>
    t.field({
      type: 'Member',
      nullable: true,
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, _args: unknown, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        return ctx.auth.organizationService.getActiveMember(ctx.request?.headers ?? new Headers())
      },
    }))

  // ── activeMemberRole — role of the active member ──────────────────────────
  builder.queryField('activeMemberRole', t =>
    t.field({
      type: 'String',
      nullable: true,
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, _args: unknown, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        const result = await ctx.auth.organizationService.getActiveMemberRole({}, ctx.request?.headers ?? new Headers())
        return result?.role ?? null
      },
    }))
}
