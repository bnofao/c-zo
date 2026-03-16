---
sidebar_position: 5
---

# Event Bus

`@czo/kit/event-bus` provides a provider-agnostic domain event bus. The in-process provider (`hookable`) is used by default; a RabbitMQ provider is available for cross-service delivery. All domain events share the same `DomainEvent` envelope and are typed through the extensible `EventMap` interface.

## EventMap Declaration Merging

The `EventMap` interface is empty by default. Modules extend it via declaration merging to register their event types and payload shapes. Place the declaration in the module's `src/events/types.ts`:

```typescript
declare module '@czo/kit/event-bus' {
  interface EventMap {
    'stockLocation.location.created': StockLocationCreatedPayload
    'stockLocation.location.updated': StockLocationUpdatedPayload
    'stockLocation.location.deleted': StockLocationDeletedPayload
  }
}
```

Once declared, `createDomainEvent` and `bus.publish` enforce the correct payload type for each event type string at compile time.

## Event Payloads

Payload interfaces live alongside the `EventMap` declaration. Examples from the `stock-location` module:

```typescript
// stockLocation.location.created
interface StockLocationCreatedPayload {
  id: string
  organizationId: string
  handle: string
  name: string
}

// stockLocation.location.updated
// changes is an intent-based list of field names that were modified
interface StockLocationUpdatedPayload {
  id: string
  organizationId: string
  changes: string[]   // e.g. ['name', 'address.city']
}

// stockLocation.location.statusChanged
interface StockLocationStatusChangedPayload {
  id: string
  organizationId: string
  isActive: boolean
}

// stockLocation.location.deleted
interface StockLocationDeletedPayload {
  id: string
  organizationId: string
  handle: string
}
```

## Publishing Events

The pattern used across all modules is fire-and-forget with a catch-and-warn guard so a publishing failure never breaks the calling request:

```typescript
import { createDomainEvent, useHookable } from '@czo/kit/event-bus'
import { useLogger } from '@czo/kit'

const logger = useLogger('my-module:events')

export async function publishMyEvent(
  type: 'myModule.entity.created',
  payload: { id: string; organizationId: string },
): Promise<void> {
  try {
    const bus = await useHookable()
    const event = createDomainEvent({
      type,
      payload,
      metadata: { source: 'my-module' },
    })
    await bus.publish(event)
  } catch (err) {
    logger.warn(`Failed to publish ${type} event`, (err as Error).message)
  }
}
```

`createDomainEvent` automatically adds a UUID `id`, an ISO-8601 `timestamp`, and injects the current OpenTelemetry correlation ID as `metadata.correlationId`.

## Naming Convention

Event types follow the dot-delimited `module.domain.action` pattern:

- `stockLocation.location.created`
- `stockLocation.location.updated`
- `stockLocation.location.statusChanged`
- `stockLocation.location.defaultChanged`
- `auth.app.installed`

Use present-perfect tense for the action segment (`created`, `updated`, `deleted`), and camelCase for multi-word segments (`statusChanged`, `defaultChanged`).

## Subscribing

The `EventBus` interface exposes a `subscribe(pattern, handler)` method that accepts exact patterns or wildcards:

```typescript
const bus = await useHookable()

// Exact match
const unsubscribe = bus.subscribe('stockLocation.location.created', async (event) => {
  console.log('New location:', event.payload.id)
})

// Single-word wildcard — matches stockLocation.location.created, stockLocation.location.updated, etc.
bus.subscribe('stockLocation.location.*', handler)

// Multi-word wildcard — matches any stockLocation event regardless of depth
bus.subscribe('stockLocation.#', handler)

// Unsubscribe when no longer needed
unsubscribe()
```

For durable cross-service subscriptions, use the RabbitMQ provider via `useMessageBroker()`.
