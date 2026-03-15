import type { StockLocationResolvers } from './../../../__generated__/types.generated'

export const StockLocation: StockLocationResolvers = {
  id: parent => parent.id,
  organizationId: parent => parent.organizationId,
  handle: parent => parent.handle,
  name: parent => parent.name,
  isDefault: parent => parent.isDefault,
  isActive: parent => parent.isActive,
  metadata: parent => parent.metadata as Record<string, unknown> | null,
  createdAt: parent => parent.createdAt,
  updatedAt: parent => parent.updatedAt,
}
