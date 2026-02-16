import type { AdminUser, MutationResolvers, QueryResolvers } from './__generated__/resolver-types'
import { registerResolvers } from '@czo/kit/graphql'
import { GraphQLError } from 'graphql'
import { requireAdmin } from '../services/admin-guard'

const Query: QueryResolvers = {
  adminUsers: async (_parent, args, ctx) => {
    requireAdmin(ctx)

    const result = await ctx.authInstance.api.listUsers({
      headers: ctx.request.headers,
      query: {
        limit: args.limit ?? 10,
        offset: args.offset ?? 0,
        ...(args.search ? { searchValue: args.search, searchField: 'email' as const } : {}),
      },
    })

    const users: AdminUser[] = (result?.users ?? []).map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role ?? 'user',
      banned: u.banned ?? false,
      banReason: u.banReason ?? null,
      banExpires: u.banExpires ?? null,
      createdAt: u.createdAt,
    }))

    return {
      users,
      total: result?.total ?? 0,
    }
  },
}

const Mutation: MutationResolvers = {
  adminImpersonateUser: async (_parent, args, ctx) => {
    requireAdmin(ctx)

    const effectiveConfig = await ctx.authRestrictions.getEffectiveConfig(args.userId)
    if (!effectiveConfig.allowImpersonation) {
      throw new GraphQLError('Impersonation is not allowed for this user', {
        extensions: { code: 'FORBIDDEN', http: { status: 403 } },
      })
    }

    await ctx.authInstance.api.impersonateUser({
      headers: ctx.request.headers,
      body: { userId: args.userId },
    })

    void ctx.authEvents.impersonationStarted({
      adminUserId: ctx.auth.user.id,
      targetUserId: args.userId,
    })

    return true
  },
  adminStopImpersonation: async (_parent, _args, ctx) => {
    requireAdmin(ctx)

    await ctx.authInstance.api.stopImpersonating({
      headers: ctx.request.headers,
    })

    void ctx.authEvents.impersonationStopped({
      adminUserId: ctx.auth.user.id,
      targetUserId: ctx.auth.session.userId,
    })

    return true
  },
  adminBanUser: async (_parent, args, ctx) => {
    requireAdmin(ctx)

    await ctx.authInstance.api.banUser({
      headers: ctx.request.headers,
      body: {
        userId: args.userId,
        ...(args.reason ? { banReason: args.reason } : {}),
        ...(args.expiresIn ? { banExpiresIn: args.expiresIn } : {}),
      },
    })

    void ctx.authEvents.userBanned({
      userId: args.userId,
      bannedBy: ctx.auth.user.id,
      reason: args.reason ?? null,
      expiresIn: args.expiresIn ?? null,
    })

    return true
  },
  adminUnbanUser: async (_parent, args, ctx) => {
    requireAdmin(ctx)

    await ctx.authInstance.api.unbanUser({
      headers: ctx.request.headers,
      body: { userId: args.userId },
    })

    void ctx.authEvents.userUnbanned({
      userId: args.userId,
      unbannedBy: ctx.auth.user.id,
    })

    return true
  },
  adminSetRole: async (_parent, args, ctx) => {
    requireAdmin(ctx)

    await ctx.authInstance.api.setRole({
      headers: ctx.request.headers,
      body: { userId: args.userId, role: args.role as 'user' | 'admin' },
    })

    return true
  },
  adminRemoveUser: async (_parent, args, ctx) => {
    requireAdmin(ctx)

    await ctx.authInstance.api.removeUser({
      headers: ctx.request.headers,
      body: { userId: args.userId },
    })

    return true
  },
  adminRevokeSession: async (_parent, args, ctx) => {
    requireAdmin(ctx)

    await ctx.authInstance.api.revokeUserSession({
      headers: ctx.request.headers,
      body: { sessionToken: args.sessionToken },
    })

    return true
  },
  adminRevokeSessions: async (_parent, args, ctx) => {
    requireAdmin(ctx)

    await ctx.authInstance.api.revokeUserSessions({
      headers: ctx.request.headers,
      body: { userId: args.userId },
    })

    return true
  },
}

registerResolvers({ Query, Mutation })
