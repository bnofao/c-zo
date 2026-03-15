import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const installApp: NonNullable<MutationResolvers['installApp']> = async (_parent, _arg, _ctx) => {
  const userId = _ctx.auth.session!.userId
  const result = await _ctx.auth.appService.installFromUrl(
    _arg.input.manifestUrl,
    userId,
    _arg.input.organizationId ?? undefined,
  )
  return {
    app: result,
    apiKeyId: result.apiKey?.id ?? '',
  }
}
