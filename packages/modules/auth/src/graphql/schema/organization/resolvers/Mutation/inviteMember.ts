import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const inviteMember: NonNullable<MutationResolvers['inviteMember']> = async (_parent, _arg, _ctx) => {
  const result = await _ctx.auth.organizationService.inviteMember({
    email: _arg.input.email,
    role: _arg.input.role,
    organizationId: _arg.input.organizationId ?? undefined,
    resend: _arg.input.resend ?? undefined,
  }, _ctx.request.headers)
  if (!result) throw new Error('Failed to invite member')
  return result
}
