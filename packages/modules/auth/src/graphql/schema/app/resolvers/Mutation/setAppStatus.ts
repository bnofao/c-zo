import type { MutationResolvers } from './../../../../__generated__/types.generated'

// TODO: rename mutation to updateApp — add status validation (AppStatus enum)
// The @relayMutation directive wraps the return value into { app, userErrors } at runtime
export const setAppStatus: NonNullable<MutationResolvers['setAppStatus']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.appService.update(
    { status: _arg.input.status as any },
    { where: { appId: _arg.input.appId } },
  ) as any
