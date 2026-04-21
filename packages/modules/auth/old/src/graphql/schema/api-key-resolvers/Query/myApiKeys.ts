import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const myApiKeys: NonNullable<QueryResolvers['myApiKeys']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.apiKeyService.list(_ctx.request.headers)
