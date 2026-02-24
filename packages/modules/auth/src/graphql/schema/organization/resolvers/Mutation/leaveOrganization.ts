import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const leaveOrganization: NonNullable<MutationResolvers['leaveOrganization']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.organizationService.leave(_arg.organizationId, _ctx.request.headers)
  return true
}
