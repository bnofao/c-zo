---
sidebar_position: 3
---

# Architecture

This page explains the building blocks of c-zo and how they interact.

## 1. Monorepo Layout

The repository is divided into **apps** and **packages**:

```
apps/
  mazo/          # Nitro backend — registers and boots all modules
  paiya/         # Next.js frontend
  docs/          # Docusaurus documentation site

packages/
  kit/           # @czo/kit — shared primitives (module system, IoC, DB, GraphQL, CLI)
  modules/
    auth/        # @czo/auth — authentication and RBAC
    stock-location/  # @czo/stock-location — physical inventory locations
  ui/            # Shared React components
```

`packages/kit` is the foundation every module depends on. Module packages are never imported by each other — they communicate through the IoC container and the event bus.

The backend app (`apps/mazo`) is the only place that registers modules into Nitro:

```typescript
// apps/mazo/nitro.config.ts
export default defineNitroConfig({
  modules: [
    '@czo/auth',
    '@czo/stock-location',
  ],
})
```

## 2. Module Anatomy

A module is a Nitro module (`defineNitroModule`) that adds a Nitro plugin. The plugin hooks into three ordered lifecycle events.

### defineNitroModule

```typescript
// packages/modules/stock-location/src/module.ts
import { addPlugin, createResolver, defineNitroModule } from '@czo/kit/nitro'
import './types'

export default defineNitroModule({
  name: 'stock-location',
  setup: async (nitro) => {
    const resolver = createResolver(import.meta.url)
    addPlugin(resolver.resolve('./plugins/index'), nitro)
  },
})
```

### Plugin Lifecycle

Plugins register handlers on three hooks that fire in this exact order:

| Hook | Purpose |
|------|---------|
| `czo:init` | Register Drizzle schema tables and relations into the shared `SchemaRegistry` |
| `czo:register` | Register access control domains, routes, or other module-to-module contracts |
| `czo:boot` | Instantiate services, bind them to the IoC container, load GraphQL schema |

The stock-location plugin shows all three hooks in action:

```typescript
// packages/modules/stock-location/src/plugins/index.ts
export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('czo:init', async () => {
    registerSchema(stockLocationSchema)
    registerRelations(stockLocationRelations)
  })

  nitroApp.hooks.hook('czo:register', async () => {
    const container = useContainer()
    const accessService = await container.make('auth:access')
    accessService.register({
      name: 'stock-location',
      statements: {
        'stock-location': ['create', 'read', 'update', 'delete'],
      },
      hierarchy: [
        { name: 'member', permissions: { 'stock-location': ['read'] } },
        { name: 'manager', permissions: { 'stock-location': ['create', 'read', 'update'] } },
        { name: 'owner', permissions: { 'stock-location': ['create', 'read', 'update', 'delete'] } },
      ],
    })
  })

  nitroApp.hooks.hook('czo:boot', async () => {
    const container = useContainer()
    const db = await useDatabase()
    const service = createStockLocationService(db)
    container.singleton('stockLocation:service', () => service)
    await import('@czo/stock-location/graphql')
  })
})
```

## 3. Database Layer

### Drizzle Schema

Each module defines its tables in `src/database/schema.ts` using Drizzle ORM's `pgTable` builder. All entity tables follow common conventions: a CUID `id`, `deletedAt` for soft deletion, `version` for optimistic locking, and `createdAt`/`updatedAt` timestamps.

### SchemaRegistry Merging

The global `SchemaRegistry` interface in `@czo/kit/db` is empty by default. Modules extend it via TypeScript declaration merging:

```typescript
declare module '@czo/kit/db' {
  interface SchemaRegistry {
    stockLocations: typeof import('./database/schema').stockLocations
    stockLocationAddresses: typeof import('./database/schema').stockLocationAddresses
  }
}
```

During `czo:init`, `registerSchema()` adds the module's tables to the runtime registry so that relations defined across modules can reference each other.

### Repository Base Class

`@czo/kit/db` exports a `Repository<Schema, Table, TableName>` base class that provides common query helpers. Module services extend it:

```typescript
class StockLocationRepository extends Repository<
  StockLocationSchema,
  typeof stockLocations,
  'stockLocations'
> {}
```

## 4. GraphQL Layer

### Schema-First Workflow

GraphQL types and mutations are written in `.graphql` files under `src/graphql/schema/*/`. After editing a schema file, run:

```bash
pnpm generate  # from the module directory
```

This runs `@eddeee888/gcg-typescript-resolver-files` codegen and produces:

- `__generated__/types.generated.ts` — TypeScript types for all GraphQL types
- `__generated__/typedefs.generated.ts` — runtime SDL string
- `__generated__/resolvers.generated.ts` — resolver map wired to implementation files

### Resolver Implementation

Resolvers receive the IoC-injected context. The context shape is fully typed through `GraphQLContextMap` merging (see §5). A typical mutation resolver:

```typescript
export const createStockLocation: NonNullable<MutationResolvers['createStockLocation']> =
  async (_parent, _arg, _ctx) => {
    return _ctx.stockLocation.service.create({
      name: _arg.input.name,
      organizationId: _arg.input.organizationId,
      // ...
    })
  }
```

## 5. IoC Container

The container is provided by `@adonisjs/fold`. Each module extends the `ContainerBindings` interface with its service tokens:

```typescript
declare module '@czo/kit/ioc' {
  interface ContainerBindings {
    'stockLocation:service': StockLocationService
  }
}
```

At runtime, services are retrieved with `container.make('stockLocation:service')`. The merged declarations ensure every call-site is typed.

### GraphQLContextMap

The GraphQL context is assembled from a merged `GraphQLContextMap` interface:

```typescript
declare module '@czo/kit/graphql' {
  interface GraphQLContextMap {
    stockLocation: {
      service: StockLocationService
    }
  }
}
```

Context factories read from the container and populate the map, so resolvers always receive fully-typed services.

## 6. Event Bus

Modules publish typed domain events using `@czo/kit/event-bus`. Each module extends the `EventMap` interface:

```typescript
declare module '@czo/kit/event-bus' {
  interface EventMap {
    'stockLocation.location.created': StockLocationCreatedPayload
    'stockLocation.location.updated': StockLocationUpdatedPayload
    'stockLocation.location.deleted': StockLocationDeletedPayload
  }
}
```

**Naming convention**: `<domain>.<entity>.<verb>` — all lowercase with dots as separators (e.g., `stockLocation.location.created`).

Publishing an event:

```typescript
await publishStockLocationEvent(
  STOCK_LOCATION_EVENTS.CREATED,
  { id, organizationId, handle, name },
)
```

Any module can subscribe to events from other modules without importing their packages.

## 7. Data Flow

```
Client (GraphQL request)
        │
        ▼
   GraphQL Yoga
        │
        ▼
   Resolver  ──── resolves typed context from IoC container
        │
        ▼
   Service  ──── validates input with Zod
        │
        ├──────────────────────────────────┐
        ▼                                  ▼
   Repository                         Event Bus
   (Drizzle ORM)              (publishes domain events)
        │
        ▼
   PostgreSQL
(stock_locations, ...)
```

The resolver layer is thin — it maps GraphQL arguments to service method parameters and returns the result. Business logic lives entirely in the service. The repository layer handles query construction and soft-delete filtering.
