import type { AuthGraphQLSchemaBuilder } from '../..'
import { UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import z from 'zod'
import { OrganizationService } from '../../../services/organization'
import { SessionService } from '../../../services/session'
import { sg } from '../subgraphs'
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
  const O = sg('org')
  const ACC = sg('account')

  // ── createOrganization ────────────────────────────────────────────────────
  builder.relayMutationField(
    'createOrganization',
    {
      ...ACC.input,
      inputFields: t => ({
        name: t.string({ required: true, validate: z.string().max(255).min(1).transform(name => name.trim()), description: 'The display name for the new organization.' }),
        slug: t.string({ required: true, validate: slugSchema, description: 'The unique URL-safe identifier for the organization; lowercase letters, numbers, and hyphens only.' }),
        logo: t.string({ validate: z.url(), description: 'The URL of the organization\'s logo image.' }),
        type: t.string({ description: 'An optional caller-defined classification of the organization.' }),
        metadata: t.field({ type: 'JSONObject', description: 'Arbitrary JSON metadata to attach to the organization.' }),
      }),
    },
    {
      ...ACC.field,
      description: 'Creates a new organization and makes the authenticated caller its owner.',
      errors: {
        types: [
          ValidationError,
          OrgUserNotFound,
          OrganizationSlugTaken,
          OrganizationLimitReached,
        ],
        ...ACC.errorOpts,
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
      ...ACC.payload,
      outputFields: t => ({
        organization: t.field({ type: 'Organization', resolve: payload => payload.organization, description: 'The newly created organization.' }),
      }),
    },
  )

  // ── updateOrganization ────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateOrganization',
    {
      ...O.input,
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
      ...O.field,
      description: 'Updates an existing organization; requires the organization:update permission within that organization.',
      errors: {
        types: [
          ValidationError,
          OrganizationNotFound,
          OrganizationSlugTaken,
          OrgNoChanges,
        ],
        ...O.errorOpts,
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
      ...O.payload,
      outputFields: t => ({
        organization: t.field({ type: 'Organization', resolve: payload => payload.organization, description: 'The organization after the update was applied.' }),
      }),
    },
  )

  // ── deleteOrganization ────────────────────────────────────────────────────
  builder.relayMutationField(
    'deleteOrganization',
    {
      ...O.input,
      inputFields: t => ({
        id: t.globalID({ for: 'Organization', required: true, description: 'The global ID of the organization to delete.' }),
      }),
    },
    {
      ...O.field,
      description: 'Deletes an organization; requires the organization:delete permission within that organization.',
      errors: { types: [OrganizationNotFound], ...O.errorOpts },
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
      ...O.payload,
      outputFields: t => ({
        success: t.boolean({ resolve: payload => payload.success, description: 'Whether the organization was successfully deleted.' }),
      }),
    },
  )

  // ── inviteMember ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'inviteMember',
    {
      ...O.input,
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'The global ID of the organization to invite the recipient to.' }),
        email: t.string({ required: true, description: 'The email address to send the invitation to.' }),
        role: t.string({ required: true, description: 'The role the recipient will be granted upon accepting the invitation.' }),
        resend: t.boolean({ required: false, description: 'Whether to resend the invitation if one already exists for this email.' }),
      }),
    },
    {
      ...O.field,
      description: 'Invites a user by email to join an organization; requires the invitation:create permission within that organization.',
      errors: { types: [OrganizationNotFound, OrgInvalidRole, MemberAlreadyExists, InvitationAlreadyExists], ...O.errorOpts },
      authScopes: (_parent, args, _ctx) => ({
        permission: {
          resource: 'invitation',
          actions: ['create'],
          organization: Number(args.input.organizationId.id),
        },
      }),
      resolve: async (_root, { input }, ctx) => {
        // The `permission` authScope (Task 6) rejects anonymous requests,
        // non-members, and members lacking `invitation:create` in THIS org
        // before `resolve` runs — so `ctx.auth!.user!` is sound.
        const orgId = input.organizationId.id
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
      ...O.payload,
      outputFields: t => ({
        invitation: t.field({ type: 'Invitation', resolve: p => p.invitation }),
      }),
    },
  )

  // ── acceptInvitation ──────────────────────────────────────────────────────
  builder.relayMutationField(
    'acceptInvitation',
    { ...ACC.input, inputFields: t => ({ invitationId: t.globalID({ for: 'Invitation', required: true }) }) },
    {
      ...ACC.field,
      errors: { types: [InvitationNotFound, InvitationNotPending, InvitationExpired, InvitationEmailMismatch, MemberAlreadyExists, OrgUserNotFound], ...ACC.errorOpts },
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        // `auth` authScope (Task 6) rejects anonymous requests before
        // `resolve` runs, so `ctx.auth!.user!` below is sound.
        const invitationId = input.invitationId.id
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
      ...ACC.payload,
      outputFields: t => ({
        invitation: t.field({ type: 'Invitation', resolve: p => p.invitation }),
        member: t.field({ type: 'Member', resolve: p => p.member }),
      }),
    },
  )

  // ── rejectInvitation ──────────────────────────────────────────────────────
  builder.relayMutationField(
    'rejectInvitation',
    { ...ACC.input, inputFields: t => ({ invitationId: t.globalID({ for: 'Invitation', required: true }) }) },
    {
      ...ACC.field,
      errors: { types: [InvitationNotFound, InvitationNotPending, InvitationEmailMismatch, OrgUserNotFound], ...ACC.errorOpts },
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        // `auth` authScope (Task 6) rejects anonymous requests before
        // `resolve` runs, so `ctx.auth!.user!` below is sound.
        const invitationId = input.invitationId.id
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
      ...ACC.payload,
      outputFields: t => ({
        invitation: t.field({ type: 'Invitation', resolve: p => p.invitation }),
      }),
    },
  )

  // ── cancelInvitation ──────────────────────────────────────────────────────
  builder.relayMutationField(
    'cancelInvitation',
    {
      ...O.input,
      inputFields: t => ({
        invitationId: t.globalID({ for: 'Invitation', required: true }),
      }),
    },
    {
      ...O.field,
      errors: { types: [InvitationNotFound], ...O.errorOpts },
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
      ...O.payload,
      outputFields: t => ({
        success: t.boolean({ resolve: payload => payload.success }),
      }),
    },
  )

  // ── leaveOrganization ────────────────────────────────────────────────────
  builder.relayMutationField(
    'leaveOrganization',
    { ...ACC.input, inputFields: t => ({ organizationId: t.globalID({ for: 'Organization', required: true }) }) },
    {
      ...ACC.field,
      errors: { types: [MemberNotFound, CannotRemoveLastOwner], ...ACC.errorOpts },
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        // `auth` authScope (Task 6) rejects anonymous requests before
        // `resolve` runs, so `ctx.auth!.user!` below is sound.
        const orgId = input.organizationId.id
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
    { ...ACC.payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )

  // ── setActiveOrganization ─────────────────────────────────────────────────
  builder.relayMutationField(
    'setActiveOrganization',
    { ...ACC.input, inputFields: t => ({ organizationId: t.globalID({ for: 'Organization', required: false }) }) },
    {
      ...ACC.field,
      errors: { types: [NotAMember], ...ACC.errorOpts },
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        const orgId = input.organizationId
          ? Number(input.organizationId.id)
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
    { ...ACC.payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )

  // ── removeMember ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'removeMember',
    {
      ...O.input,
      inputFields: t => ({
        memberId: t.globalID({ for: 'Member', required: true }),
        organizationId: t.globalID({ for: 'Organization', required: true }),
      }),
    },
    {
      ...O.field,
      errors: { types: [MemberNotFound, CannotRemoveLastOwner], ...O.errorOpts },
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
      ...O.payload,
      outputFields: t => ({
        success: t.boolean({ resolve: payload => payload.success }),
      }),
    },
  )

  // ── updateMemberRole ──────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateMemberRole',
    {
      ...O.input,
      inputFields: t => ({
        memberId: t.globalID({ for: 'Member', required: true }),
        organizationId: t.globalID({ for: 'Organization', required: true }),
        role: t.string({ required: true }),
      }),
    },
    {
      ...O.field,
      errors: {
        types: [
          MemberNotFound,
          OrgInvalidRole,
          CannotPromoteToOwner,
          CannotLeaveAsLastOwner,
        ],
        ...O.errorOpts,
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
      ...O.payload,
      outputFields: t => ({
        member: t.field({ type: 'Member', resolve: payload => payload.member }),
      }),
    },
  )
}
