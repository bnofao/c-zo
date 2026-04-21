import { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'
import { createOrganizationSchema, inviteMemberSchema, updateOrganizationSchema } from './inputs'
import { CannotLeaveAsLastOwnerError, InvitationExpiredError, MembershipAlreadyExistsError, SlugAlreadyTakenError } from './errors'

// ─── Organization Mutations ───────────────────────────────────────────────────

export function registerOrganizationMutations(builder: any): void {
  // ── createOrganization ────────────────────────────────────────────────────
  builder.mutationField('createOrganization', (t: any) =>
    t.field({
      type: 'Organization',
      errors: { types: [ValidationError, SlugAlreadyTakenError] },
      args: {
        input: t.arg({ type: 'CreateOrganizationInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        const authUser = (ctx as any).auth?.user
        if (!authUser) throw new UnauthenticatedError()

        const parsed = createOrganizationSchema.safeParse(args.input)
        if (!parsed.success) throw ValidationError.fromZod(parsed.error as any)

        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        const result = await (orgService as any).create(
          { ...parsed.data, userId: authUser.id },
          ctx.request?.headers,
        )
        if (!result) throw new NotFoundError('Organization', 'created')
        return result
      },
    }),
  )

  // ── updateOrganization ────────────────────────────────────────────────────
  builder.mutationField('updateOrganization', (t: any) =>
    t.field({
      type: 'Organization',
      errors: { types: [ValidationError, NotFoundError, SlugAlreadyTakenError] },
      args: {
        id: t.arg.id({ required: false }),
        input: t.arg({ type: 'UpdateOrganizationInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        const parsed = updateOrganizationSchema.safeParse(args.input)
        if (!parsed.success) throw ValidationError.fromZod(parsed.error as any)

        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        const result = await (orgService as any).update(
          {
            organizationId: args.id ? String(args.id) : undefined,
            data: parsed.data,
          },
          ctx.request?.headers,
        )
        if (!result) throw new NotFoundError('Organization', String(args.id ?? 'active'))
        return result
      },
    }),
  )

  // ── deleteOrganization ────────────────────────────────────────────────────
  builder.mutationField('deleteOrganization', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError, ForbiddenError] },
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'organization', actions: ['delete'] } },
      resolve: async (_root: any, args: any, ctx: any) => {
        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        await (orgService as any).remove(String(args.id), ctx.request?.headers)
        return true
      },
    }),
  )

  // ── inviteMember ──────────────────────────────────────────────────────────
  builder.mutationField('inviteMember', (t: any) =>
    t.field({
      type: 'Invitation',
      errors: { types: [ValidationError, MembershipAlreadyExistsError] },
      args: {
        input: t.arg({ type: 'InviteMemberInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        const parsed = inviteMemberSchema.safeParse(args.input)
        if (!parsed.success) throw ValidationError.fromZod(parsed.error as any)

        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        const result = await (orgService as any).inviteMember(parsed.data, ctx.request?.headers)
        if (!result) throw new NotFoundError('Invitation', 'created')
        return result
      },
    }),
  )

  // ── acceptInvitation ──────────────────────────────────────────────────────
  builder.mutationField('acceptInvitation', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError, InvitationExpiredError] },
      args: {
        invitationId: t.arg.id({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        await (orgService as any).acceptInvitation(String(args.invitationId), ctx.request?.headers)
        return true
      },
    }),
  )

  // ── rejectInvitation ──────────────────────────────────────────────────────
  builder.mutationField('rejectInvitation', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError] },
      args: {
        invitationId: t.arg.id({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        await (orgService as any).rejectInvitation(String(args.invitationId), ctx.request?.headers)
        return true
      },
    }),
  )

  // ── cancelInvitation ──────────────────────────────────────────────────────
  builder.mutationField('cancelInvitation', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError] },
      args: {
        invitationId: t.arg.id({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        await (orgService as any).cancelInvitation(String(args.invitationId), ctx.request?.headers)
        return true
      },
    }),
  )

  // ── removeMember ──────────────────────────────────────────────────────────
  builder.mutationField('removeMember', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError, ForbiddenError] },
      args: {
        memberIdOrEmail: t.arg.string({ required: true }),
        organizationId: t.arg.id({ required: false }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        await (orgService as any).removeMember(
          {
            memberIdOrEmail: args.memberIdOrEmail,
            organizationId: args.organizationId ? String(args.organizationId) : undefined,
          },
          ctx.request?.headers,
        )
        return true
      },
    }),
  )

  // ── updateMemberRole ──────────────────────────────────────────────────────
  builder.mutationField('updateMemberRole', (t: any) =>
    t.field({
      type: 'Member',
      errors: { types: [NotFoundError, ForbiddenError] },
      args: {
        memberId: t.arg.id({ required: true }),
        role: t.arg.string({ required: true }),
        organizationId: t.arg.id({ required: false }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        const result = await (orgService as any).updateMemberRole(
          {
            memberId: String(args.memberId),
            role: args.role,
            organizationId: args.organizationId ? String(args.organizationId) : undefined,
          },
          ctx.request?.headers,
        )
        if (!result) throw new NotFoundError('Member', String(args.memberId))
        return result.member ?? result
      },
    }),
  )

  // ── setActiveOrganization ─────────────────────────────────────────────────
  builder.mutationField('setActiveOrganization', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError] },
      args: {
        organizationId: t.arg.id({ required: false }),
        organizationSlug: t.arg.string({ required: false }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        if (!(ctx as any).auth?.user) throw new UnauthenticatedError()

        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        await (orgService as any).setActive(
          {
            organizationId: args.organizationId ? String(args.organizationId) : undefined,
            organizationSlug: args.organizationSlug ?? undefined,
          },
          ctx.request?.headers,
        )
        return true
      },
    }),
  )

  // ── leaveOrganization ─────────────────────────────────────────────────────
  builder.mutationField('leaveOrganization', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError, ForbiddenError, CannotLeaveAsLastOwnerError] },
      args: {
        organizationId: t.arg.id({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        if (!(ctx as any).auth?.user) throw new UnauthenticatedError()

        const container = useContainer()
        const orgService = await container.make('auth:organizations')
        await (orgService as any).leave(String(args.organizationId), ctx.request?.headers)
        return true
      },
    }),
  )
}
