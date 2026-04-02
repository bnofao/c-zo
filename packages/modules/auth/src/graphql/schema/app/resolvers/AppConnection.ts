import type { AppConnectionResolvers } from './../../../__generated__/types.generated'

export const AppConnection: AppConnectionResolvers = {
  totalCount: (parent) => {
    const count = (parent as Record<string, unknown>).totalCount
    return typeof count === 'function' ? count() : count
  },
}
