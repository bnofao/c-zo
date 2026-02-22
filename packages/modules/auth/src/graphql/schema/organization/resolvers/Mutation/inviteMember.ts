import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const inviteMember: NonNullable<MutationResolvers['inviteMember']> = async (_parent, _arg, _ctx) => {
  const result = await _ctx.auth.organizationService.inviteMember(_ctx.request.headers, {
    email: _arg.input.email,
    role: _arg.input.role,
    organizationId: _arg.input.organizationId ?? undefined,
    resend: _arg.input.resend ?? undefined,
  })
  if (!result) throw new Error('Failed to invite member')
  return result
}
