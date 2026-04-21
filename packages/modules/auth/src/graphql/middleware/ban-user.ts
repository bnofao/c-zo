import type { GraphQLResolveInfo } from 'graphql'
import type { GraphQLContext } from '../../types'
import type { MutationbanUserArgs, ResolversParentTypes, ResolversTypes } from '../__generated__/types.generated'
import { fromGlobalId, withPaylaod } from '@czo/kit/graphql'
import { z } from 'zod'

/**
 * Middleware that prevents a user from banning themselves.
 */
export async function banUserMiddleware(
  resolve: (
    root: ResolversParentTypes['Mutation'],
    args: MutationbanUserArgs,
    ctx: GraphQLContext,
    info: GraphQLResolveInfo,
  ) => ResolversTypes['BanUserPayload'] | Promise<ResolversTypes['BanUserPayload']>,
  root: ResolversParentTypes['Mutation'],
  args: MutationbanUserArgs,
  ctx: GraphQLContext,
  info: GraphQLResolveInfo,
) {
  const { id } = fromGlobalId(args.userId)

  if (String(ctx.auth.user!.id) === String(id)) {
    return await withPaylaod({
      key: 'user',
      row: null,
      error: new z.ZodError([{
        code: z.ZodIssueCode.custom,
        path: ['userId'],
        message: 'You cannot ban yourself',
      }]),
    })
  }

  return resolve(root, args, ctx, info)
}
