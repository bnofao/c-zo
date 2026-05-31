import type { AuthGraphQLSchemaBuilder } from '../..'
import { decodeGlobalID, UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import z from 'zod'
import { OrganizationService } from '../../../services/organization'
import { SessionService } from '../../../services/session'
import {
  CannotLeaveAsLastOwner,
  CannotPromoteToOwner,
  CannotRemoveLastOwner,
  InvitationAlreadyExists,
  InvitationEmailMismatch,
  InvitationExpired,
  InvitationNotFound,
  InvitationNotPending,
  MemberAlreadyExists,
  MemberNotFound,
  NotAMember,
  OrganizationLimitReached,
  OrganizationNotFound,
  OrganizationSlugTaken,
  OrgInvalidRole,
  OrgNoChanges,
  OrgUserNotFound,
} from './errors'

const slugSchema = z.string().min(3, 'Slug must be at least 3 characters').max(50, 'Slug is too long').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  message: 'Slug must be lowercase and only contain letters, numbers, and hyphens (no trailing/leading hyphens)',
})

// ─── Organization Mutations ───────────────────────────────────────────────────

export function registerOrganizationMutations(builder: AuthGraphQLSchemaBuilder): void {
  // ── createOrganization ────────────────────────────────────────────────────
  builder.relayMutationField(
    'createOrganization',
    {
      inputFields: t => ({
        name: t.string({ required: true, validate: z.string().max(255).min(1).transform(name => name.trim()) }),
        slug: t.string({ required: true, validate: slugSchema }),
        logo: t.string({ validate: z.url() }),
        type: t.string(),
        metadata: t.field({ type: 'JSONObject' }),
      }),
    },
    {
      errors: {
        types: [
          ValidationError,
          OrgUserNotFound,
          OrganizationSlugTaken,
          OrganizationLimitReached,
        ],
      },
      // Creating an org is a global capability — there is no existing org to
      // scope membership against, so `permission` (which would fall back to a
      // never-granted `organization:create` global-role check) cannot apply.
      // Any authenticated user may create an org; the resolver makes them owner.
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        const authUser = ctx.auth?.user
        if (!authUser)
          throw new UnauthenticatedError()

        const result = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.create({
              ...input,
              metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
              userId: Number(authUser.id),
            }, { role: 'org:owner'})
          }),
        )
        return { organization: result }
      },
    },
    {
      outputFields: t => ({
        organization: t.field({ type: 'Organization', resolve: payload => payload.organization }),
      }),
    },
  )

  // ── updateOrganization ────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateOrganization',
    {
      inputFields: t => ({
        id: t.id({ required: true }),
        name: t.string({ validate: z.string().max(255).nullable().optional() }),
        slug: t.string({ validate: slugSchema.optional() }),
        logo: t.string({ validate: z.url().optional() }),
        type: t.string(),
        metadata: t.field({ type: 'JSONObject' }),
      }),
    },
    {
      errors: {
        types: [
          ValidationError,
          OrganizationNotFound,
          OrganizationSlugTaken,
          OrgNoChanges,
        ],
      },
      authScopes: (_parent, args, _ctx) => ({
        permission: {
          resource: 'organization',
          actions: ['update'],
          organization: Number(decodeGlobalID(args.input.id).id),
        },
      }),
      resolve: async (_root, { input }, ctx) => {
        const { id } = decodeGlobalID(input.id)
        const orgId = Number(id)

        const result = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.update(orgId, {
              ...input,
              metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
            })
          }),
        )

        return { organization: result }
      },
    },
    {
      outputFields: t => ({
        organization: t.field({ type: 'Organization', resolve: payload => payload.organization }),
      }),
    },
  )

  // ── deleteOrganization ────────────────────────────────────────────────────
  builder.relayMutationField(
    'deleteOrganization',
    {
      inputFields: t => ({
        id: t.id({ required: true }),
      }),
    },
    {
      errors: { types: [OrganizationNotFound] },
      authScopes: (_parent, args, _ctx) => ({
        permission: {
          resource: 'organization',
          actions: ['delete'],
          organization: Number(decodeGlobalID(args.input.id).id),
        },
      }),
      resolve: async (_root, { input }, ctx) => {
        const { id } = decodeGlobalID(input.id)
        const orgId = Number(id)

        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.remove(orgId)
          }),
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({ resolve: payload => payload.success }),
      }),
    },
  )

  // ── inviteMember ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'inviteMember',
    {
      inputFields: t => ({
        organizationId: t.id({ required: true }),
        email: t.string({ required: true }),
        role: t.string({ required: true }),
        resend: t.boolean({ required: false }),
      }),
    },
    {
      errors: { types: [OrganizationNotFound, OrgInvalidRole, MemberAlreadyExists, InvitationAlreadyExists] },
      authScopes: (_parent, args, _ctx) => ({
        permission: {
          resource: 'invitation',
          actions: ['create'],
          organization: Number(decodeGlobalID(args.input.organizationId).id),
        },
      }),
      resolve: async (_root, { input }, ctx) => {
        // The `permission` authScope (Task 6) rejects anonymous requests,
        // non-members, and members lacking `invitation:create` in THIS org
        // before `resolve` runs — so `ctx.auth!.user!` is sound.
        const { id: orgId } = decodeGlobalID(input.organizationId)
        const invitation = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.createInvitation({
              organizationId: Number(orgId),
              email: input.email,
              role: input.role,
              inviterId: Number(ctx.auth!.user!.id),
              resend: input.resend ?? undefined,
            })
          }),
        )
        return { invitation }
      },
    },
    {
      outputFields: t => ({
        invitation: t.field({ type: 'Invitation', resolve: p => p.invitation }),
      }),
    },
  )

  // ── acceptInvitation ──────────────────────────────────────────────────────
  builder.relayMutationField(
    'acceptInvitation',
    { inputFields: t => ({ invitationId: t.id({ required: true }) }) },
    {
      errors: { types: [InvitationNotFound, InvitationNotPending, InvitationExpired, InvitationEmailMismatch, MemberAlreadyExists, OrgUserNotFound] },
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        // `auth` authScope (Task 6) rejects anonymous requests before
        // `resolve` runs, so `ctx.auth!.user!` below is sound.
        const { id: invitationId } = decodeGlobalID(input.invitationId)
        const { invitation, member } = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.acceptInvitation(Number(invitationId), Number(ctx.auth!.user!.id))
          }),
        )
        return { invitation, member }
      },
    },
    {
      outputFields: t => ({
        invitation: t.field({ type: 'Invitation', resolve: p => p.invitation }),
        member: t.field({ type: 'Member', resolve: p => p.member }),
      }),
    },
  )

  // ── rejectInvitation ──────────────────────────────────────────────────────
  builder.relayMutationField(
    'rejectInvitation',
    { inputFields: t => ({ invitationId: t.id({ required: true }) }) },
    {
      errors: { types: [InvitationNotFound, InvitationNotPending, InvitationEmailMismatch, OrgUserNotFound] },
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        // `auth` authScope (Task 6) rejects anonymous requests before
        // `resolve` runs, so `ctx.auth!.user!` below is sound.
        const { id: invitationId } = decodeGlobalID(input.invitationId)
        const invitation = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.rejectInvitation(Number(invitationId), Number(ctx.auth!.user!.id))
          }),
        )
        return { invitation }
      },
    },
    {
      outputFields: t => ({
        invitation: t.field({ type: 'Invitation', resolve: p => p.invitation }),
      }),
    },
  )

  // ── cancelInvitation ──────────────────────────────────────────────────────
  builder.relayMutationField(
    'cancelInvitation',
    {
      inputFields: t => ({
        invitationId: t.id({ required: true }),
      }),
    },
    {
      errors: { types: [InvitationNotFound] },
      // Cancelling is org-scoped: the caller needs `invitation:cancel` in the
      // org that owns the invitation. The org is derived from the invitation
      // itself (the input only carries `invitationId`). Unknown invitation →
      // require auth and defer to the resolver's InvitationNotFound (404),
      // rather than masking existence as a 403.
      authScopes: async (_parent, args, ctx) => {
        const { id } = decodeGlobalID(args.input.invitationId)
        const organization = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            const invitation = yield* svc.getInvitation(Number(id)).pipe(
              Effect.catchTag('InvitationNotFound', () => Effect.succeed(null)),
            )
            return invitation?.organizationId ?? null
          }),
        )
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'invitation', actions: ['cancel'], organization } }
      },
      resolve: async (_root, { input }, ctx) => {
        const { id } = decodeGlobalID(input.invitationId)
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.cancelInvitation(Number(id))
          }),
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({ resolve: payload => payload.success }),
      }),
    },
  )

  // ── leaveOrganization ────────────────────────────────────────────────────
  builder.relayMutationField(
    'leaveOrganization',
    { inputFields: t => ({ organizationId: t.id({ required: true }) }) },
    {
      errors: { types: [MemberNotFound, CannotRemoveLastOwner] },
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        // `auth` authScope (Task 6) rejects anonymous requests before
        // `resolve` runs, so `ctx.auth!.user!` below is sound.
        const { id: orgId } = decodeGlobalID(input.organizationId)
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            const membership = yield* svc.findFirstMember(Number(orgId), {
              where: { userId: Number(ctx.auth!.user!.id) },
            })
            return yield* svc.removeMember({
              memberId: membership.id,
              organizationId: Number(orgId),
            })
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )

  // ── setActiveOrganization ─────────────────────────────────────────────────
  builder.relayMutationField(
    'setActiveOrganization',
    { inputFields: t => ({ organizationId: t.id({ required: false }) }) },
    {
      errors: { types: [NotAMember] },
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        const orgId = input.organizationId
          ? Number(decodeGlobalID(input.organizationId).id)
          : null
        // `auth` authScope guarantees ctx.auth.user; the session-context contributor
        // populates ctx.auth from one `ResolvedSession`, so when `user` is present
        // `session` is too — `ctx.auth!.session!.token` is sound.
        const token = ctx.auth!.session!.token
        const userId = Number(ctx.auth!.user!.id)
        await ctx.runEffect(
          Effect.gen(function* () {
            if (orgId !== null) {
              const org = yield* OrganizationService
              const isMember = yield* org.checkMembership(orgId, userId)
              if (!isMember)
                return yield* Effect.fail(new NotAMember())
            }
            const session = yield* SessionService
            yield* session.update(token, {
              activeOrganizationId: orgId === null ? null : String(orgId),
            })
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )

  // ── removeMember ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'removeMember',
    {
      inputFields: t => ({
        memberId: t.id({ required: true }),
        organizationId: t.id({ required: true }),
      }),
    },
    {
      errors: { types: [MemberNotFound, CannotRemoveLastOwner] },
      authScopes: (_parent, args, _ctx) => ({
        permission: {
          resource: 'member',
          actions: ['remove'],
          organization: Number(decodeGlobalID(args.input.organizationId).id),
        },
      }),
      resolve: async (_root, { input }, ctx) => {
        const { id: memberId } = decodeGlobalID(input.memberId)
        const { id: orgId } = decodeGlobalID(input.organizationId)

        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.removeMember({
              memberId: Number(memberId),
              organizationId: Number(orgId),
            })
          }),
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({ resolve: payload => payload.success }),
      }),
    },
  )

  // ── updateMemberRole ──────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateMemberRole',
    {
      inputFields: t => ({
        memberId: t.id({ required: true }),
        organizationId: t.id({ required: true }),
        role: t.string({ required: true }),
      }),
    },
    {
      errors: {
        types: [
          MemberNotFound,
          OrgInvalidRole,
          CannotPromoteToOwner,
          CannotLeaveAsLastOwner,
        ],
      },
      authScopes: (_parent, args, _ctx) => ({
        permission: {
          resource: 'member',
          actions: ['update'],
          organization: Number(decodeGlobalID(args.input.organizationId).id),
        },
      }),
      resolve: async (_root, { input }, ctx) => {
        const { id: memberId } = decodeGlobalID(input.memberId)
        const { id: orgId } = decodeGlobalID(input.organizationId)

        const result = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.updateMemberRole({
              id: Number(memberId),
              organizationId: Number(orgId),
              role: input.role,
            })
          }),
        )

        return { member: result }
      },
    },
    {
      outputFields: t => ({
        member: t.field({ type: 'Member', resolve: payload => payload.member }),
      }),
    },
  )
}
