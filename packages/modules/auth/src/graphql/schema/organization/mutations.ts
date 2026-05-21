import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { decodeGlobalID, UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { OrganizationService } from '../../../services/organization'
import {
  CannotLeaveAsLastOwner,
  CannotPromoteToOwner,
  CannotRemoveLastOwner,
  InvitationNotFound,
  MemberNotFound,
  NotAMember,
  OrganizationLimitReached,
  OrganizationNotFound,
  OrganizationSlugTaken,
  OrgInvalidRole,
  OrgNoChanges,
  OrgUserNotFound,
} from './errors'
import z from 'zod'

const slugSchema = z.string().min(3, "Slug must be at least 3 characters").max(50, "Slug is too long").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  message: "Slug must be lowercase and only contain letters, numbers, and hyphens (no trailing/leading hyphens)",
})

// ─── Organization Mutations ───────────────────────────────────────────────────

export function registerOrganizationMutations(builder: AuthGraphQLSchemaBuilder): void {
  // ── createOrganization ────────────────────────────────────────────────────
  builder.relayMutationField(
    'createOrganization',
    {
      inputFields: t => ({
        name: t.string({ required: true, validate: z.string().max(255).min(1).transform(name => name.trim()) }),
        slug: t.string({ required: true, validate:  slugSchema }),
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
      authScopes: { permission: { resource: 'organization', actions: ['create'] } },
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
              userId: Number(authUser.id)
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
          NotAMember,
          OrgNoChanges,
        ],
      },
      authScopes: { permission: { resource: 'organization', actions: ['update'] } },
      resolve: async (_root, { input }, ctx) => {
        const { id } = decodeGlobalID(input.id)
        const orgId = Number(id)
        const actorId = ctx.auth?.user?.id != null ? Number(ctx.auth.user.id) : undefined

        const result = await ctx.runEffect(
Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.update(orgId, {
              ...input,
              metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
            }, actorId)
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
      errors: { types: [OrganizationNotFound, NotAMember] },
      authScopes: { permission: { resource: 'organization', actions: ['delete'] } },
      resolve: async (_root, { input }, ctx) => {
        const { id } = decodeGlobalID(input.id)
        const orgId = Number(id)
        const actorId = ctx.auth?.user?.id != null ? Number(ctx.auth.user.id) : undefined

        await ctx.runEffect(
Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.remove(orgId, actorId)
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

  // ── cancelInvitation ──────────────────────────────────────────────────────
  builder.relayMutationField(
    'cancelInvitation',
    {
      inputFields: t => ({
        invitationId: t.id({ required: true }),
      }),
    },
    {
      errors: { types: [InvitationNotFound, NotAMember] },
      authScopes: { permission: { resource: 'organization', actions: ['invite'] } },
      resolve: async (_root, { input }, ctx) => {
        const { id } = decodeGlobalID(input.invitationId)
        const actorId = ctx.auth?.user?.id != null ? Number(ctx.auth.user.id) : undefined
        await ctx.runEffect(
Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.cancelInvitation(Number(id), actorId)
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

  // ── removeMember ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'removeMember',
    {
      inputFields: t => ({
        identifier: t.string({ required: true }),
        organizationId: t.id({ required: true }),
      }),
    },
    {
      errors: { types: [MemberNotFound, CannotRemoveLastOwner] },
      authScopes: { permission: { resource: 'organization', actions: ['remove-member'] } },
      resolve: async (_root, { input }, ctx) => {
        const { id: orgId } = decodeGlobalID(input.organizationId)
        const identifier = input.identifier.includes('@')
          ? input.identifier
          : Number(input.identifier)

        await ctx.runEffect(
Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.removeMember({
              identifier: identifier as never,
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
      authScopes: { permission: { resource: 'organization', actions: ['update-member-role'] } },
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

  // ─── better-auth-backed mutations (phase 2) ────────────────────────────────
  // The following mutations wrap better-auth's organization plugin API which
  // requires a session-aware Headers object. They will be re-introduced when
  // the BetterAuth Tag exposes the request-scoped session context.
  //
  // - inviteMember
  // - acceptInvitation
  // - rejectInvitation
  // - setActiveOrganization
  // - leaveOrganization
}
