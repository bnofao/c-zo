import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const updateProfile: NonNullable<MutationResolvers['updateProfile']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.authService.updateProfile({
    name: _arg.input.name ?? undefined,
    image: _arg.input.image ?? undefined,
  }, _ctx.request.headers)
  return _ctx.auth.user! as any
}
