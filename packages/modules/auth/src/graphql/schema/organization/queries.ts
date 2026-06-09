import type { AuthGraphQLSchemaBuilder } from '../..'
import { UnauthenticatedError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { OrganizationService } from '../../../services/organization'

// ─── Organization Queries ─────────────────────────────────────────────────────

export function registerOrganizationQueries(builder: AuthGraphQLSchemaBuilder): void {
  // ── organization(id) — single org by ID ──────────────────────────────────
  builder.queryField('organization', t =>
    t.drizzleField({
      type: 'organizations',
      description: 'Fetches a single organization by its global ID, returning null if it does not exist or is not accessible.',
      nullable: true,
      args: {
        id: t.arg.globalID({ for: 'Organization', required: true, description: 'The global ID of the organization to fetch.' }),
      },
      // Org-scoped: the org IS the resource. Unknown id → require auth and let
      // the nullable field resolve to null (resolver catches OrganizationNotFound).
      authScopes: async (_parent, args, ctx) => {
        const id = args.id.id
        const organization = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            const org = yield* svc.findFirst({ where: { id: Number(id) } }).pipe(
              Effect.catchTag('OrganizationNotFound', () => Effect.succeed(null)),
            )
            return org?.id ?? null
          }),
        )
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'organization', actions: ['read'], organization } }
      },
      resolve: async (_query, _root, args, ctx) => {
        const id = args.id.id
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
      description: 'Lists the organizations the authenticated caller is a member of, optionally filtered by name.',
      args: {
        search: t.arg.string({ required: false, description: 'An optional case-insensitive substring to filter organizations by name.' }),
      },
      // "My organizations": any authenticated user lists the orgs they belong
      // to. There is no global `organization:list` capability, and listing all
      // orgs would cross tenants — so the result is filtered to the caller's
      // memberships via the `members` relation.
      authScopes: { auth: true },
      resolve: async (query, _root, args, ctx) => {
        const authUser = ctx.auth?.user
        if (!authUser)
          throw new UnauthenticatedError()

        const program = Effect.gen(function* () {
          const svc = yield* OrganizationService
          return yield* svc.findMany(query({
            // Tenant boundary: only orgs where the caller is a member. The
            // optional name search is AND-ed in.
            where: {
              members: { userId: Number(authUser.id) },
              ...(args.search ? { name: { ilike: `%${args.search}%` } } : {}),
            },
          }))
        })
        return ctx.runEffect(program)
      },
    }))

  // ── checkSlug(slug) — verify organization slug availability ───────────────
  builder.queryField('checkSlug', t =>
    t.field({
      type: 'Boolean',
      description: 'Checks whether an organization slug is available, returning true if no organization already uses it.',
      args: {
        slug: t.arg.string({ required: true, description: 'The slug whose availability is being checked.' }),
      },
      // Pre-creation utility (no existing org to scope against), like
      // `createOrganization` — any authenticated user may check availability.
      authScopes: { auth: true },
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
      description: 'Lists the members of an organization; requires read permission on members within that organization.',
      args: {
        organizationId: t.arg.globalID({ for: 'Organization', required: true, description: 'The global ID of the organization whose members are listed.' }),
      },
      authScopes: (_parent, args) => ({
        permission: {
          resource: 'member',
          actions: ['read'],
          organization: Number(args.organizationId.id),
        },
      }),
      resolve: async (query, _root, args, ctx) => {
        const id = args.organizationId.id
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
      description: 'Fetches a single invitation by its global ID, returning null if it does not exist or is not accessible.',
      nullable: true,
      args: {
        id: t.arg.globalID({ for: 'Invitation', required: true, description: 'The global ID of the invitation to fetch.' }),
      },
      // Org-scoped: the org is derived from the invitation. Unknown id →
      // require auth and let the nullable field resolve to null.
      authScopes: async (_parent, args, ctx) => {
        const id = args.id.id
        const organization = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            const inv = yield* svc.getInvitation(Number(id)).pipe(
              Effect.catchTag('InvitationNotFound', () => Effect.succeed(null)),
            )
            return inv?.organizationId ?? null
          }),
        )
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'invitation', actions: ['read'], organization } }
      },
      resolve: async (_query, _root, args, ctx) => {
        const id = args.id.id
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
      description: 'Lists the invitations issued for an organization; requires read permission on invitations within that organization.',
      args: {
        organizationId: t.arg.globalID({ for: 'Organization', required: true, description: 'The global ID of the organization whose invitations are listed.' }),
      },
      authScopes: (_parent, args) => ({
        permission: {
          resource: 'invitation',
          actions: ['read'],
          organization: Number(args.organizationId.id),
        },
      }),
      resolve: async (query, _root, args, ctx) => {
        const id = args.organizationId.id
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
      description: 'Lists the pending invitations addressed to the authenticated caller, matched by their email address.',
      // The caller's own invitations (matched by their email) — not org-scoped.
      authScopes: { auth: true },
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
