import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const updateAppManifest: NonNullable<MutationResolvers['updateAppManifest']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.appService.updateManifest(_arg.appId, _arg.manifest as any)
