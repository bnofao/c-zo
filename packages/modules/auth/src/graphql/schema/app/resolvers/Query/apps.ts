import type { QueryResolvers } from './../../../../__generated__/types.generated'
import { toGlobalId } from '@czo/kit/graphql'

// The @connection directive transforms PaginateResult into AppConnection at runtime
export const apps: NonNullable<QueryResolvers['apps']> = async (_parent, _arg, _ctx) => {
  const where = {
    ..._arg.where,
    // Auto-scope to session org if caller didn't provide an explicit organizationId filter
    ...(!_arg.where?.organizationId && _ctx.auth.session?.organizationId
      ? { organizationId: { eq: toGlobalId('Organization', _ctx.auth.session.organizationId) } }
      : {}),
  }

  return _ctx.auth.appService.listApps(
    { first: _arg.first ?? undefined, after: _arg.after ?? undefined, last: _arg.last ?? undefined, before: _arg.before ?? undefined },
    _arg.orderBy ?? undefined,
    Object.keys(where).length > 0 ? where as any : undefined,
  ) as any
}
