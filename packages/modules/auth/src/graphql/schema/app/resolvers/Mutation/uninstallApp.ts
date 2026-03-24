import type { MutationResolvers } from './../../../../__generated__/types.generated'

// The @relayMutation directive wraps the return value into { app, userErrors } at runtime
export const uninstallApp: NonNullable<MutationResolvers['uninstallApp']> = async (_parent, _arg, _ctx) => {
  return _ctx.auth.appService.uninstall(_arg.appId) as any
}
