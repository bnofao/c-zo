import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const createOrganization: NonNullable<MutationResolvers['createOrganization']> = async (_parent, _arg, _ctx) => {
  const result = await _ctx.auth.organizationService.create({
    name: _arg.input.name,
    slug: _arg.input.slug,
    logo: _arg.input.logo ?? undefined,
    type: _arg.input.type ?? undefined,
    keepCurrentActiveOrganization: _arg.input.keepCurrentActiveOrganization ?? undefined,
  }, _ctx.request.headers)
  if (!result)
    throw new Error('Failed to create organization')
  return result
}
