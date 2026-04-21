import type { AppResolvers } from './../../../__generated__/types.generated'
import { toGlobalId } from '@czo/kit/graphql'

export const App: AppResolvers = {
  organizationId: parent => parent.organizationId ? toGlobalId('Organization', parent.organizationId) : parent.organizationId,
  id: parent => parent.id ? toGlobalId('App', parent.id) : parent.id,
}
