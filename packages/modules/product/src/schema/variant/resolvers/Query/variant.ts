import type { QueryResolvers } from '../../../types.generated'

export const variant: NonNullable<QueryResolvers['variant']> = async (
  _parent,
  { id },
  context
) => {
  const variant = await context.services.variant.getVariant(id)
  return variant
}

