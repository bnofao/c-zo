import type { GraphQLResolveInfo } from 'graphql'
import type { GraphQLContext } from '../../types'
import type { ResolversParentTypes } from '../__generated__/types.generated'
import { fromGlobalId, withPaylaod } from '@czo/kit/graphql'

/**
 * Creates a middleware that verifies the user referenced by `userId` exists.
 * Returns a structured payload with userErrors if not found.
 *
 * @param payloadKey - The key used in the mutation payload (e.g. 'user' or 'success')
 */
export function userExists(payloadKey: string) {
  return async function userExistsMiddleware(
    resolve: (root: ResolversParentTypes['Mutation'], args: any, ctx: GraphQLContext, info: GraphQLResolveInfo) => any,
    root: ResolversParentTypes['Mutation'],
    args: { userId: string },
    ctx: GraphQLContext,
    info: GraphQLResolveInfo,
  ) {
    const { id } = fromGlobalId(args.userId)

    if (!(await ctx.auth.userService.exists({ where: { id: Number(id) } }))) {
      return await withPaylaod({
        key: payloadKey,
        row: null,
        error: new Error(`User '${args.userId}' not found`),
      })
    }

    return resolve(root, args, ctx, info)
  }
}
