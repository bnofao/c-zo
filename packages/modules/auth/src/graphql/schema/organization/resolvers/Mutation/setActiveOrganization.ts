import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const setActiveOrganization: NonNullable<MutationResolvers['setActiveOrganization']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.organizationService.setActive({
    organizationId: _arg.organizationId ?? undefined,
    organizationSlug: _arg.organizationSlug ?? undefined,
  }, _ctx.request.headers)
