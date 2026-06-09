import type { AuthGraphQLSchemaBuilder } from '../..'
import { UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import z from 'zod'
import { OrganizationService } from '../../../services/organization'
import { SessionService } from '../../../services/session'
import { requireSessionToken, requireUserId } from '../../require-user'
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
        name: t.string({ required: true, validate: z.string().max(255).min(1).transform(name => name.trim()), description: 'The display name for the new organization.' }),
        slug: t.string({ required: true, validate: slugSchema, description: 'The unique URL-safe identifier for the organization; lowercase letters, numbers, and hyphens only.' }),
        logo: t.string({ validate: z.url(), description: 'The URL of the organization\'s logo image.' }),
        type: t.string({ description: 'An optional caller-defined classification of the organization.' }),
        metadata: t.field({ type: 'JSONObject', description: 'Arbitrary JSON metadata to attach to the organization.' }),
      }),
    },
    {
      description: 'Creates a new organization and makes the authenticated caller its owner.',
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
            // No explicit role — the service grants the configured org-owner
            // role (`authConfig.orgOwnerRole`) by default.
            return yield* svc.create({
              ...input,
              metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
              userId: Number(authUser.id),
            })
          }),
        )
        return { organization: result }
      },
    },
    {
      outputFields: t => ({
        organization: t.field({ type: 'Organization', resolve: payload => payload.organization, description: 'The newly created organization.' }),
      }),
    },
  )

  // ── updateOrganization ────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateOrganization',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Organization', required: true, description: 'The global ID of the organization to update.' }),
        name: t.string({ validate: z.string().max(255).nullable().optional(), description: 'The new display name for the organization.' }),
        slug: t.string({ validate: slugSchema.optional(), description: 'The new unique URL-safe identifier for the organization.' }),
        logo: t.string({ validate: z.url().optional(), description: 'The new URL of the organization\'s logo image.' }),
        type: t.string({ description: 'The new caller-defined classification of the organization.' }),
        metadata: t.field({ type: 'JSONObject', description: 'The new arbitrary JSON metadata to attach to the organization.' }),
      }),
    },
    {
      description: 'Updates an existing organization; requires the organization:update permission within that organization.',
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
          organization: Number(args.input.id.id),
        },
      }),
      resolve: async (_root, { input }, ctx) => {
        // Strip the relay-global `id` from the spread — it must NOT reach the
        // Drizzle `SET` (it's a string global id, the PK is an int identity, so
        // `SET id = 'Org:..'` errors). Only the updatable fields go through.
        const { id: globalId, ...rest } = input
        const orgId = Number(globalId.id)

        const result = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.update(orgId, {
              ...rest,
              metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
            })
          }),
        )

        return { organization: result }
      },
    },
    {
      outputFields: t => ({
        organization: t.field({ type: 'Organization', resolve: payload => payload.organization, description: 'The organization after the update was applied.' }),
      }),
    },
  )

  // ── deleteOrganization ────────────────────────────────────────────────────
  builder.relayMutationField(
    'deleteOrganization',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Organization', required: true, description: 'The global ID of the organization to delete.' }),
      }),
    },
    {
      description: 'Deletes an organization; requires the organization:delete permission within that organization.',
      errors: { types: [OrganizationNotFound] },
      authScopes: (_parent, args, _ctx) => ({
        permission: {
          resource: 'organization',
          actions: ['delete'],
          organization: Number(args.input.id.id),
        },
      }),
      resolve: async (_root, { input }, ctx) => {
        const orgId = Number(input.id.id)

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
        success: t.boolean({ resolve: payload => payload.success, description: 'Whether the organization was successfully deleted.' }),
      }),
    },
  )

  // ── inviteMember ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'inviteMember',
    {
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'The global ID of the organization to invite the recipient to.' }),
        email: t.string({ required: true, description: 'The email address to send the invitation to.' }),
        role: t.string({ required: true, description: 'The role the recipient will be granted upon accepting the invitation.' }),
        resend: t.boolean({ required: false, description: 'Whether to resend the invitation if one already exists for this email.' }),
      }),
    },
    {
      description: 'Invites a user by email to join an organization; requires the invitation:create permission within that organization.',
      errors: { types: [OrganizationNotFound, OrgInvalidRole, MemberAlreadyExists, InvitationAlreadyExists] },
      authScopes: (_parent, args, _ctx) => ({
        permission: {
          resource: 'invitation',
          actions: ['create'],
          organization: Number(args.input.organizationId.id),
        },
      }),
      resolve: async (_root, { input }, ctx) => {
        const orgId = input.organizationId.id
        const invitation = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.createInvitation({
              organizationId: Number(orgId),
              email: input.email,
              role: input.role,
              inviterId: requireUserId(ctx),
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
    { inputFields: t => ({ invitationId: t.globalID({ for: 'Invitation', required: true }) }) },
    {
      errors: { types: [InvitationNotFound, InvitationNotPending, InvitationExpired, InvitationEmailMismatch, MemberAlreadyExists, OrgUserNotFound] },
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        const invitationId = input.invitationId.id
        const { invitation, member } = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.acceptInvitation(Number(invitationId), requireUserId(ctx))
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
    { inputFields: t => ({ invitationId: t.globalID({ for: 'Invitation', required: true }) }) },
    {
      errors: { types: [InvitationNotFound, InvitationNotPending, InvitationEmailMismatch, OrgUserNotFound] },
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        const invitationId = input.invitationId.id
        const invitation = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.rejectInvitation(Number(invitationId), requireUserId(ctx))
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
        invitationId: t.globalID({ for: 'Invitation', required: true }),
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
        const id = args.input.invitationId.id
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
        const id = input.invitationId.id
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
    { inputFields: t => ({ organizationId: t.globalID({ for: 'Organization', required: true }) }) },
    {
      errors: { types: [MemberNotFound, CannotRemoveLastOwner] },
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        const orgId = input.organizationId.id
        const userId = requireUserId(ctx)
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            const membership = yield* svc.findFirstMember(Number(orgId), {
              where: { userId },
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
    { inputFields: t => ({ organizationId: t.globalID({ for: 'Organization', required: false }) }) },
    {
      errors: { types: [NotAMember] },
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        const orgId = input.organizationId
          ? Number(input.organizationId.id)
          : null
        const token = requireSessionToken(ctx)
        const userId = requireUserId(ctx)
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
        memberId: t.globalID({ for: 'Member', required: true }),
        organizationId: t.globalID({ for: 'Organization', required: true }),
      }),
    },
    {
      errors: { types: [MemberNotFound, CannotRemoveLastOwner] },
      authScopes: (_parent, args, _ctx) => ({
        permission: {
          resource: 'member',
          actions: ['delete'],
          organization: Number(args.input.organizationId.id),
        },
      }),
      resolve: async (_root, { input }, ctx) => {
        const memberId = input.memberId.id
        const orgId = input.organizationId.id

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
        memberId: t.globalID({ for: 'Member', required: true }),
        organizationId: t.globalID({ for: 'Organization', required: true }),
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
          organization: Number(args.input.organizationId.id),
        },
      }),
      resolve: async (_root, { input }, ctx) => {
        const memberId = input.memberId.id
        const orgId = input.organizationId.id

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
