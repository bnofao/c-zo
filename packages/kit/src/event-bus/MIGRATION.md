# Event Bus Migration Guide

This guide covers migrating from direct EventEmitter usage to the new `DomainEvent` envelope standard.

## Event Format

### Before (raw EventEmitter)

```typescript
emitter.emit('product:created', { id: '123', title: 'Widget' })
```

### After (DomainEvent envelope)

```typescript
import { createDomainEvent, useEventBus } from '@czo/kit'

const bus = await useEventBus()

const event = createDomainEvent({
  type: 'product.item.created',
  payload: { id: '123', title: 'Widget' },
  metadata: {
    source: 'product-service',
  },
})

await bus.publish(event)
```

Key changes:
- **Dot-delimited types** instead of colon-delimited (`product.item.created` not `product:created`)
- **Payload wrapped** in a `DomainEvent` envelope with `id`, `type`, `timestamp`, and `metadata`
- **Immutable** — the returned event is frozen via `Object.freeze()`

## Adding Metadata

Every event carries an `EventMetadata` object:

```typescript
createDomainEvent({
  type: 'order.placed',
  payload: { orderId: 'abc' },
  metadata: {
    source: 'order-service', // required — identifies the producer
    version: 2, // schema version (default: 1)
    shopId: 'shop-xyz', // multi-tenant routing
    actorId: 'user-456', // who triggered the event
    actorType: 'user', // 'user' | 'app' | 'system'
  },
})
```

Fields `shopId`, `actorId`, and `actorType` are optional but recommended for audit trails and tenant-scoped subscriptions.

## Subscribing with Pattern Matching

```typescript
const bus = await useEventBus()

// Exact match
bus.subscribe('product.item.created', handler)

// Single-word wildcard — matches product.created, product.updated
bus.subscribe('product.*', handler)

// Multi-word wildcard — matches product.item.created, product.variant.added
bus.subscribe('product.#', handler)
```

## Correlation and Causation Chaining

`correlationId` is auto-generated (UUID v4) when not provided, so every event is traceable by default.

For **distributed tracing**, pass the parent event's `correlationId` and set `causationId` to the parent's `id`:

```typescript
function handleOrderPlaced(orderEvent: DomainEvent<OrderPayload>) {
  const paymentEvent = createDomainEvent({
    type: 'payment.initiated',
    payload: { orderId: orderEvent.payload.orderId, amount: 99.99 },
    metadata: {
      source: 'payment-service',
      correlationId: orderEvent.metadata.correlationId, // propagate trace
      causationId: orderEvent.id, // link to cause
    },
  })

  return bus.publish(paymentEvent)
}
```

This creates a trace chain: `order.placed → payment.initiated → payment.captured`, all sharing the same `correlationId`.

## EventMap Declaration (Type Safety)

Modules can declare their event types for compile-time payload checking:

```typescript
// In your module's types file
declare module '@czo/kit' {
  interface EventMap {
    'product.item.created': { id: string, title: string, handle: string }
    'product.item.updated': { id: string, changes: Record<string, unknown> }
    'product.item.deleted': { id: string }
  }
}
```

Once declared, `createDomainEvent` infers the payload type:

```typescript
// TypeScript knows payload must be { id: string; title: string; handle: string }
const event = createDomainEvent({
  type: 'product.item.created' as const,
  payload: { id: '1', title: 'Widget', handle: 'widget' },
})

// Type error — missing 'handle'
createDomainEvent({
  type: 'product.item.created' as const,
  payload: { id: '1', title: 'Widget' }, // TS error
})
```

Use `as const` on the `type` string to enable narrowing.

## Backward Compatibility

- The **EventEmitter** (`@czo/kit` queue system) continues to work alongside the EventBus
- No existing code breaks — all changes are additive
- Migrate producers first (wrap payloads in `createDomainEvent`), then migrate consumers to `bus.subscribe()`
- Both systems can coexist during the transition period
