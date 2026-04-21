import type { GraphQLResolveInfo } from 'graphql'
import type { GraphQLContext } from '../../types'
import type { MutationupdateUserArgs, ResolversParentTypes, ResolversTypes } from '../__generated__/types.generated'
import { withPaylaod } from '@czo/kit/graphql'
import { GraphQLError } from 'graphql'
import { z } from 'zod'

const updateUserSchema = z.object({
  name: z.string().min(1).max(255).transform(v => v.trim()).optional(),
  role: z.array(z.string().min(1).max(50)).optional(),
})

/**
 * Middleware that validates UpdateUserInput:
 * - Validates input fields with Zod
 * - Trims name when provided
 * - Normalizes role array to comma-separated string
 */
export async function updateUserMiddleware(
  resolve: (
    root: ResolversParentTypes['Mutation'],
    args: MutationupdateUserArgs,
    ctx: GraphQLContext,
    info: GraphQLResolveInfo,
  ) => ResolversTypes['UpdateUserPayload'] | Promise<ResolversTypes['UpdateUserPayload']>,
  root: ResolversParentTypes['Mutation'],
  args: MutationupdateUserArgs,
  ctx: GraphQLContext,
  info: GraphQLResolveInfo,
) {
  const validated = updateUserSchema.safeParse(args.input)

  if (!validated.success) {
    return await withPaylaod({ key: 'user', row: null, error: validated.error })
  }

  if (validated.data.role) {
    const allowed = await ctx.auth.authService.hasPermission({
      ctx: { userId: ctx.auth.session!.userId, organizationId: ctx.auth.session!.organizationId },
      role: ctx.auth.user?.role ?? undefined,
      permissions: { user: ['set-role'] },
    })

    if (!allowed) {
      throw new GraphQLError('FORBIDDEN', { extensions: { code: 'FORBIDDEN' } })
    }

    for (const _role of validated.data.role ?? []) {
      if (ctx.auth.authService.roles && !ctx.auth.authService.roles[_role]) {
        return await withPaylaod({
          key: 'user',
          row: null,
          error: new z.ZodError([{
            code: z.ZodIssueCode.custom,
            path: ['role'],
            message: `role '${_role}' does not exist`,
          }]),
        })
      }
    }
  }

  return resolve(root, {
    ...args,
    input: validated.data,
  }, ctx, info)
}
