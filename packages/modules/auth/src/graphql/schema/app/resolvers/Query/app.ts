import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const app: NonNullable<QueryResolvers['app']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.appService.getApp(_arg.appId)
