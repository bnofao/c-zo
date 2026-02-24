import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const me: NonNullable<QueryResolvers['me']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.user! as any
