import type { QueryResolvers } from './../../../../__generated__/types.generated'
import { fromGlobalId } from '@czo/kit/graphql'

export const app: NonNullable<QueryResolvers['app']> = async (_parent, _arg, _ctx) => {
  const { id } = fromGlobalId(_arg.id)
  return _ctx.auth.appService.findFirst({ where: { id } })
}
