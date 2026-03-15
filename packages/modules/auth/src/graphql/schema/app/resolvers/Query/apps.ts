import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const apps: NonNullable<QueryResolvers['apps']> = async (_parent, _arg, _ctx) => {
  const organizationId = _arg.organizationId ?? _ctx.auth.session?.organizationId ?? undefined
  return _ctx.auth.appService.listApps(organizationId)
}
