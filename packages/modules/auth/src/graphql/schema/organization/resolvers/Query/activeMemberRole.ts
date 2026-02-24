import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const activeMemberRole: NonNullable<QueryResolvers['activeMemberRole']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.organizationService.getActiveMemberRole({
    userId: _arg.userId ?? undefined,
    organizationId: _arg.organizationId ?? undefined,
    organizationSlug: _arg.organizationSlug ?? undefined,
  }, _ctx.request.headers)
