export interface StockLocationCreatedPayload {
  id: string
  organizationId: string
  handle: string
  name: string
}

export interface StockLocationUpdatedPayload {
  id: string
  organizationId: string
  changes: string[]
}

export interface StockLocationStatusChangedPayload {
  id: string
  organizationId: string
  isActive: boolean
}

export interface StockLocationDeletedPayload {
  id: string
  organizationId: string
  handle: string
}

export interface StockLocationDefaultChangedPayload {
  id: string
  organizationId: string
  previousDefaultId: string | null
}

export const STOCK_LOCATION_EVENTS = {
  CREATED: 'stockLocation.location.created',
  UPDATED: 'stockLocation.location.updated',
  STATUS_CHANGED: 'stockLocation.location.statusChanged',
  DELETED: 'stockLocation.location.deleted',
  DEFAULT_CHANGED: 'stockLocation.location.defaultChanged',
} as const

export type StockLocationEventType = (typeof STOCK_LOCATION_EVENTS)[keyof typeof STOCK_LOCATION_EVENTS]

declare module '@czo/kit/event-bus' {
  interface EventMap {
    'stockLocation.location.created': StockLocationCreatedPayload
    'stockLocation.location.updated': StockLocationUpdatedPayload
    'stockLocation.location.statusChanged': StockLocationStatusChangedPayload
    'stockLocation.location.deleted': StockLocationDeletedPayload
    'stockLocation.location.defaultChanged': StockLocationDefaultChangedPayload
  }
}
