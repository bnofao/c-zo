import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const totpUri: NonNullable<QueryResolvers['totpUri']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.authService.getTotpUri(_arg.password, _ctx.request.headers)
