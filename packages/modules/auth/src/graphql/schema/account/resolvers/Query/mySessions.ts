import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const mySessions: NonNullable<QueryResolvers['mySessions']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.authService.listSessions(_ctx.request.headers)
