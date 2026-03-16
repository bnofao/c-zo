---
sidebar_position: 3
---

# Events

The stock location module publishes domain events through `@czo/kit/event-bus` using a fire-and-forget pattern. A failed publish logs a warning but never fails the originating request.

All event types are declared in `src/events/types.ts` via `EventMap` declaration merging, giving full payload type safety to any subscriber.

## stockLocation.location.created

Published after a new stock location and its address are successfully committed to the database.

**Payload:**

```typescript
interface StockLocationCreatedPayload {
  id: string            // Location ID
  organizationId: string
  handle: string        // The resolved handle (auto-generated or explicit)
  name: string
}
```

**Example:**

```json
{
  "id": "cma1b2c3d...",
  "organizationId": "org_01j...",
  "handle": "main-warehouse",
  "name": "Main Warehouse"
}
```

---

## stockLocation.location.updated

Published after one or more fields on a stock location are changed. The `changes` array is intent-based — it lists the logical field names that were part of the update input, not necessarily every column that changed in the database.

**Payload:**

```typescript
interface StockLocationUpdatedPayload {
  id: string
  organizationId: string
  changes: string[]  // e.g. ['name', 'address.city', 'isActive']
}
```

`changes` is populated from the update input keys. Address sub-fields are prefixed with `address.` (e.g. `address.countryCode`). This lets subscribers react specifically to what changed without fetching the full record.

---

## stockLocation.location.statusChanged

Published when `isActive` is toggled.

**Payload:**

```typescript
interface StockLocationStatusChangedPayload {
  id: string
  organizationId: string
  isActive: boolean  // New value
}
```

---

## stockLocation.location.deleted

Published after a location is soft-deleted.

**Payload:**

```typescript
interface StockLocationDeletedPayload {
  id: string
  organizationId: string
  handle: string
}
```

---

## stockLocation.location.defaultChanged

Published when the default location for an organization changes.

**Payload:**

```typescript
interface StockLocationDefaultChangedPayload {
  id: string                      // New default location ID
  organizationId: string
  previousDefaultId: string | null  // Previous default, null if none
}
```

---

## Subscribing

```typescript
import { useHookable } from '@czo/kit/event-bus'

const bus = await useHookable()

bus.subscribe('stockLocation.location.created', async (event) => {
  const { id, organizationId, handle } = event.payload
  // handle the event
})

// Subscribe to all stock location events
bus.subscribe('stockLocation.location.*', async (event) => {
  // event.type will be one of the specific event strings
})
```
