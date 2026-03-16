# @czo/stock-location

Stock location management for the c-zo platform. Manages physical inventory locations (warehouses, stores, fulfillment centers).

## Quick Start

```typescript
// apps/mazo/nitro.config.ts
modules: ['@czo/auth', '@czo/stock-location', kitModule]
```

```bash
cd packages/modules/stock-location
pnpm migrate:latest
```

## Key Concepts

- **Auto-generated handles** — URL-safe slugs from location names
- **1:1 address relation** — Each location has exactly one address
- **Soft delete** — Locations are never hard-deleted (`deletedAt` field)
- **Lifecycle events** — `stockLocation.location.created`, `stockLocation.location.updated`

## API

| Operation | Type | Description |
|-----------|------|-------------|
| `createStockLocation` | Mutation | Create a location with address |
| `updateStockLocation` | Mutation | Update name, handle, metadata, and/or address |
| `updateStockLocationAddress` | Mutation | Update address fields independently |

## Documentation

Full docs: https://docs.c-zo.dev/docs/modules/stock-location/overview
