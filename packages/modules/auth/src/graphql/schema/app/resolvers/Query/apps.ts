import type { QueryResolvers } from './../../../../__generated__/types.generated'
import { toGlobalId } from '@czo/kit/graphql'

// @connection directive: transforms PaginateResult → AppConnection
// @drizzle annotations on AppWhereInput: auto-decode GlobalIDs in where arg
export const apps: NonNullable<QueryResolvers['apps']> = async (_parent, _arg, _ctx) => {
  // Auto-scope to session org if caller didn't provide an explicit organizationId filter
  const where = {
    ..._arg.where,
    ...(!_arg.where?.organizationId && _ctx.auth.session?.organizationId
      ? { organizationId: { eq: toGlobalId('Organization', _ctx.auth.session.organizationId) } }
      : {}),
  }

  return _ctx.auth.appService.listApps({
    where: Object.keys(where).length > 0 ? where : undefined,
    first: _arg.first ?? undefined,
    after: _arg.after ?? undefined,
    last: _arg.last ?? undefined,
    before: _arg.before ?? undefined,
  }) as any
}
