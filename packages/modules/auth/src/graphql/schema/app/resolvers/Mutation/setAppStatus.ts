import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const setAppStatus: NonNullable<MutationResolvers['setAppStatus']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.appService.setStatus(_arg.appId, _arg.status as any)
