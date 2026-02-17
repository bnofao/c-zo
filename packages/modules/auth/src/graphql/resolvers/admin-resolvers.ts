import type { MutationResolvers, QueryResolvers } from '../__generated__/resolver-types'
import { registerResolvers } from '@czo/kit/graphql'
import { composeResolvers } from '@graphql-tools/resolvers-composition'
import { GraphQLError } from 'graphql'
import { isAdmin } from '../guards/admin-guard'

const Query: QueryResolvers = {
  adminUsers: async (_parent, args, ctx) => {
    return ctx.userService.list(ctx.request.headers, {
      limit: args.limit ?? undefined,
      offset: args.offset ?? undefined,
      search: args.search ?? undefined,
    })
  },
  adminUser: async (_parent, args, ctx) => {
    return ctx.userService.get(ctx.request.headers, args.userId)
  },
  adminUserSessions: async (_parent, args, ctx) => {
    return ctx.userService.listSessions(ctx.request.headers, args.userId)
  },
}

const Mutation: MutationResolvers = {
  adminCreateUser: async (_parent, args, ctx) => {
    return ctx.userService.create(ctx.request.headers, {
      email: args.input.email,
      name: args.input.name,
      password: args.input.password ?? undefined,
      role: args.input.role ?? undefined,
    })
  },
  adminUpdateUser: async (_parent, args, ctx) => {
    return ctx.userService.update(ctx.request.headers, args.userId, {
      name: args.input.name ?? undefined,
      email: args.input.email ?? undefined,
    })
  },
  adminImpersonateUser: async (_parent, args, ctx) => {
    const effectiveConfig = await ctx.authRestrictions.getEffectiveConfig(args.userId)
    if (!effectiveConfig.allowImpersonation) {
      throw new GraphQLError('Impersonation is not allowed for this user', {
        extensions: { code: 'FORBIDDEN', http: { status: 403 } },
      })
    }

    await ctx.userService.impersonate(ctx.request.headers, args.userId)

    void ctx.authEvents.impersonationStarted({
      adminUserId: ctx.auth.user.id,
      targetUserId: args.userId,
    })

    return true
  },
  adminStopImpersonation: async (_parent, _args, ctx) => {
    await ctx.userService.stopImpersonating(ctx.request.headers)

    void ctx.authEvents.impersonationStopped({
      adminUserId: ctx.auth.user.id,
      targetUserId: ctx.auth.session.userId,
    })

    return true
  },
  adminBanUser: async (_parent, args, ctx) => {
    await ctx.userService.ban(
      ctx.request.headers,
      args.userId,
      args.reason ?? undefined,
      args.expiresIn ?? undefined,
    )

    void ctx.authEvents.userBanned({
      userId: args.userId,
      bannedBy: ctx.auth.user.id,
      reason: args.reason ?? null,
      expiresIn: args.expiresIn ?? null,
    })

    return true
  },
  adminUnbanUser: async (_parent, args, ctx) => {
    await ctx.userService.unban(ctx.request.headers, args.userId)

    void ctx.authEvents.userUnbanned({
      userId: args.userId,
      unbannedBy: ctx.auth.user.id,
    })

    return true
  },
  adminSetRole: async (_parent, args, ctx) => {
    await ctx.userService.setRole(ctx.request.headers, args.userId, args.role)

    return true
  },
  adminRemoveUser: async (_parent, args, ctx) => {
    await ctx.userService.remove(ctx.request.headers, args.userId)

    return true
  },
  adminRevokeSession: async (_parent, args, ctx) => {
    await ctx.userService.revokeSession(ctx.request.headers, args.sessionToken)

    return true
  },
  adminRevokeSessions: async (_parent, args, ctx) => {
    await ctx.userService.revokeSessions(ctx.request.headers, args.userId)

    return true
  },
}

const resolversComposition = {
  'Query.*': [isAdmin()],
  'Mutation.*': [isAdmin()],
}

registerResolvers(composeResolvers({ Query, Mutation }, resolversComposition))
