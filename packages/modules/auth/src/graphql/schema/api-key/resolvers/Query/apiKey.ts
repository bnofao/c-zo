import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const apiKey: NonNullable<QueryResolvers['apiKey']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.apiKeyService.get(_arg.keyId, _ctx.request.headers)
