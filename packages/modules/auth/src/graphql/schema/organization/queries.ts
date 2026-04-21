import { NotFoundError, UnauthenticatedError } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'

// ─── Organization Queries ─────────────────────────────────────────────────────

export function registerOrganizationQueries(builder: any): void {
  // ── organization(id) — single org by ID ──────────────────────────────────
  builder.queryField('organization', (t: any) =>
    t.drizzleField({
      type: 'organizations',
      nullable: true,
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'organization', actions: ['read'] } },
      resolve: async (query: any, _root: any, args: any) => {
        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any
        return db.query.organizations.findFirst(
          query({ where: (o: any, { eq }: any) => eq(o.id, String(args.id)) }),
        )
      },
    }),
  )

  // ── organizations(connection) — paginated list ────────────────────────────
  builder.queryField('organizations', (t: any) =>
    t.drizzleConnection({
      type: 'organizations',
      args: {
        search: t.arg.string({ required: false }),
      },
      authScopes: { permission: { resource: 'organization', actions: ['read'] } },
      resolve: async (query: any, _root: any, args: any) => {
        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any
        return db.query.organizations.findMany(
          query({
            where: args.search
              ? (o: any, { ilike }: any) => ilike(o.name, `%${args.search}%`)
              : undefined,
          }),
        )
      },
      edgesField: {},
    }),
  )

  // ── checkSlug(slug) — verify organization slug availability ───────────────
  builder.queryField('checkSlug', (t: any) =>
    t.field({
      type: 'Boolean',
      args: {
        slug: t.arg.string({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        const result = await (orgService as any).checkSlug(args.slug, ctx.request?.headers)
        return result?.status === 'available' || result?.available === true || false
      },
    }),
  )

  // ── members(organizationId) — list members of an org ─────────────────────
  // Direct service call since org members don't appear in authRelations
  builder.queryField('members', (t: any) =>
    t.field({
      type: ['Member'],
      args: {
        organizationId: t.arg.id({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        const result = await (orgService as any).listMembers(
          { organizationId: String(args.organizationId) },
          ctx.request?.headers,
        )
        return result?.members ?? result ?? []
      },
    }),
  )

  // ── invitation(id) — single invitation by ID ─────────────────────────────
  builder.queryField('invitation', (t: any) =>
    t.field({
      type: 'Invitation',
      nullable: true,
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        return (orgService as any).getInvitation(String(args.id), ctx.request?.headers)
      },
    }),
  )

  // ── invitations(organizationId) — list invitations for an org ────────────
  builder.queryField('invitations', (t: any) =>
    t.field({
      type: ['Invitation'],
      args: {
        organizationId: t.arg.id({ required: false }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        const result = await (orgService as any).listInvitations(
          args.organizationId ? String(args.organizationId) : undefined,
          ctx.request?.headers,
        )
        return result ?? []
      },
    }),
  )

  // ── myInvitations — invitations for the authenticated user ────────────────
  builder.queryField('myInvitations', (t: any) =>
    t.field({
      type: ['Invitation'],
      authScopes: { loggedIn: true },
      resolve: async (_root: any, _args: any, ctx: any) => {
        const authUser = (ctx as any).auth?.user
        if (!authUser) throw new UnauthenticatedError()

        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        const result = await (orgService as any).listUserInvitations(
          authUser.email,
          ctx.request?.headers,
        )
        return result ?? []
      },
    }),
  )

  // ── activeMember — the active member record for the authenticated user ────
  builder.queryField('activeMember', (t: any) =>
    t.field({
      type: 'Member',
      nullable: true,
      authScopes: { loggedIn: true },
      resolve: async (_root: any, _args: any, ctx: any) => {
        if (!(ctx as any).auth?.user) throw new UnauthenticatedError()

        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        return (orgService as any).getActiveMember(ctx.request?.headers)
      },
    }),
  )

  // ── activeMemberRole — role of the active member ──────────────────────────
  builder.queryField('activeMemberRole', (t: any) =>
    t.field({
      type: 'String',
      nullable: true,
      authScopes: { loggedIn: true },
      resolve: async (_root: any, _args: any, ctx: any) => {
        if (!(ctx as any).auth?.user) throw new UnauthenticatedError()

        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        const result = await (orgService as any).getActiveMemberRole({}, ctx.request?.headers)
        return result?.role ?? null
      },
    }),
  )
}
