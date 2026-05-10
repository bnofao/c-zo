import type { AuthGraphQLShemaBuilder } from '@czo/auth/types'
import { AUTH_EVENTS, publishAuthEvent } from '@czo/auth/events'
import { runEffect } from '@czo/kit/effect'
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

// ─── Organization Mutations ───────────────────────────────────────────────────

export function registerOrganizationMutations(builder: AuthGraphQLShemaBuilder): void {
  // ── createOrganization ────────────────────────────────────────────────────
  builder.relayMutationField(
    'createOrganization',
    {
      inputFields: t => ({
        data: t.field({ type: 'OrganizationCreateData', required: true }),
      }),
    },
    {
      errors: {
        types: [
          ValidationError,
          OrgUserNotFound, OrganizationSlugTaken, OrganizationLimitReached,
        ],
      },
      authScopes: { permission: { resource: 'organization', actions: ['create'] } },
      resolve: async (_root, { input }, ctx) => {
        const authUser = ctx.auth?.user
        if (!authUser)
          throw new UnauthenticatedError()

        const result = await runEffect(
          ctx.auth.runtime,
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.create({ ...input.data, userId: Number(authUser.id) })
          }),
        )

        await publishAuthEvent(AUTH_EVENTS.ORG_CREATED, {
          orgId: String(result.id),
          ownerId: String(authUser.id),
          name: result.name,
          type: result.type ?? null,
        })

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
        data: t.field({ type: 'OrganizationUpdateData', required: true }),
      }),
    },
    {
      errors: {
        types: [
          ValidationError,
          OrganizationNotFound, OrganizationSlugTaken, NotAMember, OrgNoChanges,
        ],
      },
      authScopes: { permission: { resource: 'organization', actions: ['update'] } },
      resolve: async (_root, { input }, ctx) => {
        const { id } = decodeGlobalID(input.id)
        const orgId = Number(id)
        const actorId = ctx.auth?.user?.id != null ? Number(ctx.auth.user.id) : undefined

        const result = await runEffect(
          ctx.auth.runtime,
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.update(orgId, input.data as never, actorId)
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

        await runEffect(
          ctx.auth.runtime,
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
        await runEffect(
          ctx.auth.runtime,
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

        await runEffect(
          ctx.auth.runtime,
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.removeMember({
              identifier: identifier as never,
              organizationId: Number(orgId),
            })
          }),
        )

        await publishAuthEvent(AUTH_EVENTS.ORG_MEMBER_REMOVED, {
          orgId: String(orgId),
          userId: String(input.identifier),
        })

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
          MemberNotFound, OrgInvalidRole, CannotPromoteToOwner, CannotLeaveAsLastOwner,
        ],
      },
      authScopes: { permission: { resource: 'organization', actions: ['update-member-role'] } },
      resolve: async (_root, { input }, ctx) => {
        const { id: memberId } = decodeGlobalID(input.memberId)
        const { id: orgId } = decodeGlobalID(input.organizationId)

        const result = await runEffect(
          ctx.auth.runtime,
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
