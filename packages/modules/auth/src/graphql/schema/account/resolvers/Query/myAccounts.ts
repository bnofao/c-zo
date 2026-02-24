import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const myAccounts: NonNullable<QueryResolvers['myAccounts']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.authService.listAccounts(_ctx.request.headers)
