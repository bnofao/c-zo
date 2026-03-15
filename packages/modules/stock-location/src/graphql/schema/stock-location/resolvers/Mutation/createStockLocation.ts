import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const createStockLocation: NonNullable<MutationResolvers['createStockLocation']> = async (_parent, _arg, _ctx) => {
  const result = await _ctx.stockLocation.service.create({
    name: _arg.input.name,
    handle: _arg.input.handle ?? undefined,
    organizationId: _arg.input.organizationId,
    addressLine1: _arg.input.addressLine1,
    addressLine2: _arg.input.addressLine2 ?? undefined,
    city: _arg.input.city,
    province: _arg.input.province ?? undefined,
    postalCode: _arg.input.postalCode ?? undefined,
    countryCode: _arg.input.countryCode,
    phone: _arg.input.phone ?? undefined,
    metadata: _arg.input.metadata as Record<string, unknown> | undefined,
  })

  return result
}
