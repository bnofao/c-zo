import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const createStockLocation: NonNullable<MutationResolvers['createStockLocation']> = async (_parent, _arg, _ctx) => {
  const result = await _ctx.stockLocation.service.create({
    name: _arg.input.name,
    handle: _arg.input.handle ?? undefined,
    organizationId: _arg.input.organizationId ?? undefined,
    address: {
      addressLine1: _arg.input.address.addressLine1,
      addressLine2: _arg.input.address.addressLine2 ?? undefined,
      city: _arg.input.address.city,
      province: _arg.input.address.province ?? undefined,
      postalCode: _arg.input.address.postalCode ?? undefined,
      countryCode: _arg.input.address.countryCode,
      phone: _arg.input.address.phone ?? undefined,
    },
    metadata: _arg.input.metadata as Record<string, unknown> | undefined,
  })

  return result
}
