import type { QueryResolvers } from './../../../../__generated__/types.generated'
import { resolveNode } from '@czo/kit/graphql'

export const node: NonNullable<QueryResolvers['node']> = async (_parent, _arg, _ctx) => {
  return resolveNode(_arg.id, _ctx) as any
}
