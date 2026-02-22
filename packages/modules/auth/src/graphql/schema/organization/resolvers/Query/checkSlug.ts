import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const checkSlug: NonNullable<QueryResolvers['checkSlug']> = async (_parent, _arg, _ctx) => {
  const result = await _ctx.auth.organizationService.checkSlug(_ctx.request.headers, _arg.slug)
  return { available: result?.status === true }
}
