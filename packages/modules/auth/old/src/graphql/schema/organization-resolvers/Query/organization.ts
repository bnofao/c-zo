import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const organization: NonNullable<QueryResolvers['organization']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.organizationService.get({
    organizationId: _arg.organizationId ?? undefined,
    organizationSlug: _arg.organizationSlug ?? undefined,
  }, _ctx.request.headers)
