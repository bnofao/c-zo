import type { NodeGuard } from '@czo/kit/graphql'

const inventoryReadGuard: NodeGuard = (row: { organizationId: number }) => ({
  permission: { resource: 'inventory', actions: ['read'], organization: row.organizationId },
})

export const inventoryNodeGuards: Record<string, NodeGuard> = {
  InventoryItem: inventoryReadGuard,
  InventoryLevel: inventoryReadGuard,
  Reservation: inventoryReadGuard,
}
