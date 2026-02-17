import type { MutationResolvers, QueryResolvers } from './__generated__/resolver-types'
import { registerResolvers } from '@czo/kit/graphql'
import { validateOrgType } from '../services/organization-types'

const Query: QueryResolvers = {
  myAuthConfig: async (_parent, _args, ctx) => {
    return ctx.authRestrictions.getEffectiveConfig(ctx.auth.user.id)
  },
  myOrganizations: async (_parent, _args, ctx) => {
    const result = await ctx.authInstance.api.listOrganizations({
      headers: ctx.request.headers,
    })
    return result ?? []
  },
  organization: async (_parent, args, ctx) => {
    const result = await ctx.authInstance.api.getFullOrganization({
      headers: ctx.request.headers,
      query: { organizationId: args.id },
    })
    return result ?? null
  },
  myApiKeys: async (_parent, _args, ctx) => {
    const result = await ctx.authInstance.api.listApiKeys({
      headers: ctx.request.headers,
    })
    return result ?? []
  },
}

const Mutation: MutationResolvers = {
  createOrganization: async (_parent, args, ctx) => {
    const validatedType = validateOrgType(args.input.type)
    const body: Record<string, unknown> = { name: args.input.name }
    if (args.input.slug) {
      body.slug = args.input.slug
    }
    if (validatedType) {
      body.type = validatedType
    }
    const result = await ctx.authInstance.api.createOrganization({
      headers: ctx.request.headers,
      body: body as { name: string, slug: string },
    })
    if (!result)
      throw new Error('Failed to create organization')
    return result
  },
  setActiveOrganization: async (_parent, args, ctx) => {
    const result = await ctx.authInstance.api.setActiveOrganization({
      headers: ctx.request.headers,
      body: { organizationId: args.organizationId ?? null },
    })
    return result ?? null
  },
  inviteMember: async (_parent, args, ctx) => {
    const result = await ctx.authInstance.api.createInvitation({
      headers: ctx.request.headers,
      body: {
        organizationId: args.organizationId,
        email: args.email,
        role: args.role as 'viewer',
      },
    })
    if (!result)
      throw new Error('Failed to create invitation')
    return result
  },
  removeMember: async (_parent, args, ctx) => {
    await ctx.authInstance.api.removeMember({
      headers: ctx.request.headers,
      body: {
        organizationId: args.organizationId,
        memberIdOrEmail: args.memberIdToRemove,
      },
    })
    return true
  },
  acceptInvitation: async (_parent, args, ctx) => {
    const result = await ctx.authInstance.api.acceptInvitation({
      headers: ctx.request.headers,
      body: { invitationId: args.invitationId },
    })
    if (!result)
      throw new Error('Failed to accept invitation')
    return result.member
  },
}

registerResolvers({ Query, Mutation })
