import type { AuthContext } from '@czo/auth/types'
import type { SchemaBuilder } from '@czo/kit/graphql'
import { AUTH_EVENTS, publishAuthEvent } from '@czo/auth/events'
import { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { CannotLeaveAsLastOwnerError, InvitationExpiredError, MembershipAlreadyExistsError, SlugAlreadyTakenError } from './errors'
import { createOrganizationSchema, inviteMemberSchema, updateOrganizationSchema } from './inputs'

interface Ctx { auth: AuthContext, request?: Request }

// ─── Organization Mutations ───────────────────────────────────────────────────

export function registerOrganizationMutations(builder: SchemaBuilder): void {
  // ── createOrganization ────────────────────────────────────────────────────
  builder.mutationField('createOrganization', t =>
    t.field({
      type: 'Organization',
      errors: { types: [ValidationError, SlugAlreadyTakenError] },
      args: {
        input: t.arg({ type: 'CreateOrganizationInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { input: unknown }, ctx: Ctx) => {
        const authUser = ctx.auth?.user
        if (!authUser)
          throw new UnauthenticatedError()

        const parsed = createOrganizationSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        const result = await ctx.auth.organizationService.create(
          { ...parsed.data, userId: authUser.id },
        )
        if (!result)
          throw new NotFoundError('Organization', 'created')

        await publishAuthEvent(AUTH_EVENTS.ORG_CREATED, {
          orgId: result.id,
          ownerId: authUser.id,
          name: result.name,
          type: result.type ?? null,
        })

        return result
      },
    }))

  // ── updateOrganization ────────────────────────────────────────────────────
  builder.mutationField('updateOrganization', t =>
    t.field({
      type: 'Organization',
      errors: { types: [ValidationError, NotFoundError, SlugAlreadyTakenError] },
      args: {
        id: t.arg.id({ required: false }),
        input: t.arg({ type: 'UpdateOrganizationInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { id?: string | null, input: unknown }, ctx: Ctx) => {
        const parsed = updateOrganizationSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        const result = await ctx.auth.organizationService.update(
          {
            organizationId: args.id ? String(args.id) : undefined,
            data: parsed.data,
          },
        )
        if (!result)
          throw new NotFoundError('Organization', String(args.id ?? 'active'))
        return result
      },
    }))

  // ── deleteOrganization ────────────────────────────────────────────────────
  builder.mutationField('deleteOrganization', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError, ForbiddenError] },
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'organization', actions: ['delete'] } },
      resolve: async (_root: unknown, args: { id: string }, ctx: Ctx) => {
        await ctx.auth.organizationService.remove(String(args.id))
        return true
      },
    }))

  // ── inviteMember ──────────────────────────────────────────────────────────
  builder.mutationField('inviteMember', t =>
    t.field({
      type: 'Invitation',
      errors: { types: [ValidationError, MembershipAlreadyExistsError] },
      args: {
        input: t.arg({ type: 'InviteMemberInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { input: unknown }, ctx: Ctx) => {
        const parsed = inviteMemberSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        const result = await ctx.auth.organizationService.inviteMember(parsed.data, ctx.request?.headers ?? new Headers())
        if (!result)
          throw new NotFoundError('Invitation', 'created')
        return result
      },
    }))

  // ── acceptInvitation ──────────────────────────────────────────────────────
  builder.mutationField('acceptInvitation', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError, InvitationExpiredError] },
      args: {
        invitationId: t.arg.id({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { invitationId: string }, ctx: Ctx) => {
        await ctx.auth.organizationService.acceptInvitation(String(args.invitationId), ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── rejectInvitation ──────────────────────────────────────────────────────
  builder.mutationField('rejectInvitation', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError] },
      args: {
        invitationId: t.arg.id({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { invitationId: string }, ctx: Ctx) => {
        await ctx.auth.organizationService.rejectInvitation(String(args.invitationId))
        return true
      },
    }))

  // ── cancelInvitation ──────────────────────────────────────────────────────
  builder.mutationField('cancelInvitation', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError] },
      args: {
        invitationId: t.arg.id({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { invitationId: string }, ctx: Ctx) => {
        await ctx.auth.organizationService.cancelInvitation(String(args.invitationId))
        return true
      },
    }))

  // ── removeMember ──────────────────────────────────────────────────────────
  builder.mutationField('removeMember', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError, ForbiddenError] },
      args: {
        memberIdOrEmail: t.arg.string({ required: true }),
        organizationId: t.arg.id({ required: false }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { memberIdOrEmail: string, organizationId?: string | null }, ctx: Ctx) => {
        await ctx.auth.organizationService.removeMember(
          {
            memberIdOrEmail: args.memberIdOrEmail,
            organizationId: args.organizationId ? String(args.organizationId) : undefined,
          },
        )

        await publishAuthEvent(AUTH_EVENTS.ORG_MEMBER_REMOVED, {
          orgId: args.organizationId ? String(args.organizationId) : '',
          userId: args.memberIdOrEmail,
        })

        return true
      },
    }))

  // ── updateMemberRole ──────────────────────────────────────────────────────
  builder.mutationField('updateMemberRole', t =>
    t.field({
      type: 'Member',
      errors: { types: [NotFoundError, ForbiddenError] },
      args: {
        memberId: t.arg.id({ required: true }),
        role: t.arg.string({ required: true }),
        organizationId: t.arg.id({ required: false }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { memberId: string, role: string, organizationId?: string | null }, ctx: Ctx) => {
        const result = await ctx.auth.organizationService.updateMemberRole(
          {
            memberId: String(args.memberId),
            role: args.role,
            organizationId: args.organizationId ? String(args.organizationId) : undefined,
          },
        )
        if (!result)
          throw new NotFoundError('Member', String(args.memberId))
        return result
      },
    }))

  // ── setActiveOrganization ─────────────────────────────────────────────────
  builder.mutationField('setActiveOrganization', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError] },
      args: {
        organizationId: t.arg.id({ required: false }),
        organizationSlug: t.arg.string({ required: false }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { organizationId?: string | null, organizationSlug?: string | null }, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        await ctx.auth.organizationService.setActive(
          {
            organizationId: args.organizationId ? String(args.organizationId) : undefined,
            organizationSlug: args.organizationSlug ?? undefined,
          },
          ctx.request?.headers ?? new Headers(),
        )
        return true
      },
    }))

  // ── leaveOrganization ─────────────────────────────────────────────────────
  builder.mutationField('leaveOrganization', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError, ForbiddenError, CannotLeaveAsLastOwnerError] },
      args: {
        organizationId: t.arg.id({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { organizationId: string }, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        await ctx.auth.organizationService.leave(String(args.organizationId), ctx.request?.headers ?? new Headers())
        return true
      },
    }))
}
