import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const updateMemberRole: NonNullable<MutationResolvers['updateMemberRole']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.organizationService.updateMemberRole(
    _ctx.request.headers,
    _arg.memberId,
    _arg.role,
    _arg.organizationId ?? undefined,
  )
  return true
}
