import type { UserResolvers } from './../../../__generated__/types.generated'
import { toGlobalId } from '@czo/kit/graphql'

export const User: UserResolvers = {
  id: parent => parent.id ? toGlobalId('User', `${parent.id}`) : parent.id,
}
