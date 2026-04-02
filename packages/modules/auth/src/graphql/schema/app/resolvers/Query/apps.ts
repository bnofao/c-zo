import type { QueryResolvers } from './../../../../__generated__/types.generated'
import { fromWhereGlobalId, withConnection } from '@czo/kit/graphql'

export const apps: NonNullable<QueryResolvers['apps']> = async (_parent, _arg, _ctx) => {
  const { where: _where, orderBy, ...args } = _arg
  const { organization, ...where } = _where ?? {}

  // Auto-scope to session org when no explicit organizationId filter
  const orgFilter = organization
    ? fromWhereGlobalId('organizationId', organization)
    : _ctx.auth.session?.organizationId
      ? { organizationId: { eq: _ctx.auth.session.organizationId } }
      : {}

  return await withConnection({
    args,
    findFunction: _ctx.auth.appService.findMany,
    countFunction: _ctx.auth.appService.count,
    where: {
      ...where,
      ...orgFilter,
    },
    orderBy,
    tiebreakers: ['id'],
  }) as any
}
