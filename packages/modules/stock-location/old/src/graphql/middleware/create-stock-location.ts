import type { GraphQLResolveInfo } from 'graphql'
import type { GraphQLContext } from '../../types'
import type { MutationcreateStockLocationArgs, ResolversParentTypes, ResolversTypes } from '../__generated__/types.generated'
import { z } from 'zod'

const HANDLE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const createStockLocationSchema = z.object({
  name: z.string().min(1).max(255),
  handle: z.string().regex(HANDLE_REGEX).max(255).optional(),
  organization: z.string().min(1),
  address: z.object({
    addressLine1: z.string().min(1).max(500),
    addressLine2: z.string().max(500).optional(),
    city: z.string().min(1).max(255),
    province: z.string().max(255).optional(),
    postalCode: z.string().max(20).optional(),
    countryCode: z.string().length(2),
    phone: z.string().max(50).optional(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
})

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Middleware that validates and normalizes CreateStockLocationInput:
 * - Validates input with Zod
 * - Generates handle from name if not provided
 *
 * The resolver receives the validated and normalized input.
 */
export async function createStockLocationMiddleware(resolve: (root: ResolversParentTypes['Mutation'], args: MutationcreateStockLocationArgs, ctx: GraphQLContext, info: GraphQLResolveInfo) => ResolversTypes['StockLocation'] | Promise<ResolversTypes['StockLocation']>, root: ResolversParentTypes['Mutation'], args: MutationcreateStockLocationArgs, ctx: GraphQLContext, info: GraphQLResolveInfo) {
  const validated = createStockLocationSchema.parse(args.input)
  const handle = validated.handle ?? slugify(validated.name)

  if (!(await ctx.stockLocation.service.exists({ where: { handle } }))) {
    // TODO: throw exception
  }

  // TODO: check organizationId exists

  return resolve(root, {
    ...args,
    input: { ...validated, handle },
  }, ctx, info)
}
