import type { QueryResolvers } from './../../../../__generated__/types.generated'

// The @connection directive transforms PaginateResult into AppConnection at runtime
export const apps: NonNullable<QueryResolvers['apps']> = async (_parent, _arg, _ctx) => {
  return _ctx.auth.appService.listApps(
    { first: _arg.first ?? undefined, after: _arg.after ?? undefined, last: _arg.last ?? undefined, before: _arg.before ?? undefined },
    _arg.orderBy ?? undefined,
    _ctx.auth.session?.organizationId ?? undefined,
  ) as any
}
