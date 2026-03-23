import type { QueryResolvers } from './../../../../__generated__/types.generated'
import { useContainer } from '@czo/kit/ioc'

export const node: NonNullable<QueryResolvers['node']> = async (_parent, _arg, _ctx) => {
  const nodeRegistry = await useContainer().make('graphql:nodeRegistry')
  return nodeRegistry.resolve(_arg.id, _ctx) as any
}
