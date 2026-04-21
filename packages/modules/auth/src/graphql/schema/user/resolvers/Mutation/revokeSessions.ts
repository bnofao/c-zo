import type { MutationResolvers } from './../../../../__generated__/types.generated'
import { fromGlobalId, withPaylaod } from '@czo/kit/graphql'

export const revokeSessions: NonNullable<MutationResolvers['revokeSessions']> = async (_parent, _arg, _ctx) => {
  const authContext = await _ctx.auth.instance.$context
  return await withPaylaod({
    key: 'success',
    row: async () => {
      await authContext.internalAdapter.deleteSessions(fromGlobalId(_arg.userId).id)
      return true
    },
  })
}
