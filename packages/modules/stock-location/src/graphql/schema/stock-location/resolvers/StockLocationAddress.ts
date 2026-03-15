import type { StockLocationAddressResolvers } from './../../../__generated__/types.generated'

export const StockLocationAddress: StockLocationAddressResolvers = {
  id: parent => parent.id,
  addressLine1: parent => parent.addressLine1,
  addressLine2: parent => parent.addressLine2,
  city: parent => parent.city,
  province: parent => parent.province,
  postalCode: parent => parent.postalCode,
  countryCode: parent => parent.countryCode,
  phone: parent => parent.phone,
}
