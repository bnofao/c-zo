import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const organization: NonNullable<QueryResolvers['organization']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.organizationService.get(
    _arg.organizationId ?? undefined,
    _ctx.request.headers,
    _arg.organizationSlug ?? undefined,
  )
