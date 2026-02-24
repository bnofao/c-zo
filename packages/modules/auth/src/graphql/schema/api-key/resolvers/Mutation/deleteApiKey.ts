import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const deleteApiKey: NonNullable<MutationResolvers['deleteApiKey']> = async (_parent, _arg, _ctx) => {
  const result = await _ctx.auth.apiKeyService.remove(_arg.keyId, _ctx.request.headers)
  return result.success
}
