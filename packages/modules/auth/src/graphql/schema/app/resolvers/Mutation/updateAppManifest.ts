import type { MutationResolvers } from './../../../../__generated__/types.generated'

// TODO: will be merged into updateApp mutation
// The @relayMutation directive wraps the return value into { app, userErrors } at runtime
export const updateAppManifest: NonNullable<MutationResolvers['updateAppManifest']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.appService.update(
    { manifest: _arg.input.manifest as any },
    { where: { appId: _arg.input.appId } },
  ) as any
