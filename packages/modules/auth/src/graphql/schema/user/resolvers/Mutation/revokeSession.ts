import type { MutationResolvers } from './../../../../__generated__/types.generated'
import { withPaylaod } from '@czo/kit/graphql'

export const revokeSession: NonNullable<MutationResolvers['revokeSession']> = async (_parent, _arg, _ctx) => {
  const authContext = await _ctx.auth.instance.$context
  return await withPaylaod({
    key: 'success',
    row: async () => {
      await authContext.internalAdapter.deleteSession(_arg.sessionToken)
      return true
    },
  })
}
