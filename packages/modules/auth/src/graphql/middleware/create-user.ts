import type { GraphQLResolveInfo } from 'graphql'
import type { GraphQLContext } from '../../types'
import type { MutationcreateUserArgs, ResolversParentTypes, ResolversTypes } from '../__generated__/types.generated'
import { withPaylaod } from '@czo/kit/graphql'
import { z } from 'zod'

const createUserSchema = z.object({
  email: z.string().email().max(255).transform(v => v.toLowerCase()),
  name: z.string().min(1).max(255).transform(v => v.trim()),
  password: z.string().min(8).max(128).optional(),
  role: z.array(z.string().min(1).max(50)).optional(),
})

/**
 * Middleware that validates CreateUserInput:
 * - Validates input fields with Zod
 * - Trims and normalizes name
 * - Lowercases email
 *
 * The resolver receives the validated and normalized input.
 */
export async function createUserMiddleware(
  resolve: (
    root: ResolversParentTypes['Mutation'],
    args: MutationcreateUserArgs,
    ctx: GraphQLContext,
    info: GraphQLResolveInfo,
  ) => ResolversTypes['CreateUserPayload'] | Promise<ResolversTypes['CreateUserPayload']>,
  root: ResolversParentTypes['Mutation'],
  args: MutationcreateUserArgs,
  ctx: GraphQLContext,
  info: GraphQLResolveInfo,
) {
  const validated = createUserSchema.safeParse(args.input)

  if (!validated.success) {
    return await withPaylaod({ key: 'user', row: null, error: validated.error })
  }

  if (await ctx.auth.userService.exists({ where: { email: validated.data.email } })) {
    return await withPaylaod({
      key: 'user',
      row: null,
      error: new z.ZodError([{
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: `email '${validated.data.email}' already exists`,
      }]),
    })
  }

  return resolve(root, {
    ...args,
    input: validated.data,
  }, ctx, info)
}
