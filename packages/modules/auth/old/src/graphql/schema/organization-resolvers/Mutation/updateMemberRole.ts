import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const updateMemberRole: NonNullable<MutationResolvers['updateMemberRole']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.organizationService.updateMemberRole({
    memberId: _arg.memberId,
    role: _arg.role,
    organizationId: _arg.organizationId ?? undefined,
  }, _ctx.request.headers)
  return true
}
