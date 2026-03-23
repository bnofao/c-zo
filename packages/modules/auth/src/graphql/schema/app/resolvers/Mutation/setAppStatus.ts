import type { MutationResolvers } from './../../../../__generated__/types.generated'

// The @relayMutation directive wraps the return value into { app, userErrors } at runtime
export const setAppStatus: NonNullable<MutationResolvers['setAppStatus']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.appService.setStatus(_arg.input.appId, _arg.input.status as any) as any
