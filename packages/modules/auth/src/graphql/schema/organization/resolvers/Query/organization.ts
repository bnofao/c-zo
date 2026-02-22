import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const organization: NonNullable<QueryResolvers['organization']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.organizationService.get(
    _ctx.request.headers,
    _arg.organizationId ?? undefined,
    _arg.organizationSlug ?? undefined,
  )
