import type { MutationResolvers } from './../../../../__generated__/types.generated'

// The @relayMutation directive wraps the return value into { app, userErrors } at runtime
export const installApp: NonNullable<MutationResolvers['installApp']> = async (_parent, _arg, _ctx) => {
  const userId = _ctx.auth.session!.userId
  return _ctx.auth.appService.installFromUrl(
    _arg.input.manifestUrl,
    userId,
    _arg.input.organizationId ?? undefined,
  ) as any
}
