import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const activeMember: NonNullable<QueryResolvers['activeMember']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.organizationService.getActiveMember(_ctx.request.headers)
