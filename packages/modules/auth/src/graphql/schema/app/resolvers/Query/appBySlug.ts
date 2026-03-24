import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const appBySlug: NonNullable<QueryResolvers['appBySlug']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.appService.getApp(_arg.appId)
