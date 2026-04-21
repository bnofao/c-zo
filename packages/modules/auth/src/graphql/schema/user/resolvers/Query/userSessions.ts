import type { QueryResolvers } from './../../../../__generated__/types.generated'
import { fromGlobalId } from '@czo/kit/graphql'

export const userSessions: NonNullable<QueryResolvers['userSessions']> = async (_parent, _arg, _ctx) => _ctx.auth.authService.session.findMany({
  where: { userId: Number(fromGlobalId(_arg.userId).id) },
})
