import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const organizations: NonNullable<QueryResolvers['organizations']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.organizationService.list(_ctx.request.headers)
