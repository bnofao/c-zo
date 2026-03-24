import type { MutationResolvers } from './../../../../__generated__/types.generated'

// The @relayMutation directive wraps the return value into { app, userErrors } at runtime
export const updateAppManifest: NonNullable<MutationResolvers['updateAppManifest']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.appService.updateManifest(_arg.input.appId, _arg.input.manifest as any) as any
