---
sidebar_position: 4
---

# Creating a Module

This guide walks through every step required to build a new c-zo module. We use `@czo/stock-location` as the running example — you can follow along by reading the actual files in `packages/modules/stock-location/`.

---

## Step 1: Scaffold the package

Create the package directory and a `package.json` with the standard exports map:

```json
{
  "name": "@czo/stock-location",
  "type": "module",
  "version": "0.0.1",
  "exports": {
    ".":        { "types": "./src/module.ts",             "default": "./dist/module.mjs" },
    "./types":  { "types": "./src/types.ts",              "default": "./dist/types.mjs" },
    "./schema": { "types": "./src/database/schema.ts",    "default": "./dist/database/schema.mjs" },
    "./relations": { "types": "./src/database/relations.ts", "default": "./dist/database/relations.mjs" },
    "./services":  { "types": "./src/services/index.ts", "default": "./dist/services/index.mjs" },
    "./graphql":   { "types": "./src/graphql/index.ts",  "default": "./dist/graphql/index.mjs" },
    "./events":    { "types": "./src/events/index.ts",   "default": "./dist/events/index.mjs" }
  },
  "scripts": {
    "build":            "unbuild",
    "graphql:generate": "graphql-codegen --config codegen.ts",
    "migrate:generate": "drizzle-kit generate",
    "migrate:latest":   "drizzle-kit migrate",
    "migrate:status":   "drizzle-kit check",
    "test":             "vitest run",
    "check-types":      "pnpm tsc --noEmit"
  }
}
```

The exports map is the contract that other packages and the app use. Keep every logical boundary behind its own export path.

Also add `tsconfig.json` (extending `@workspace/typescript-config/base`) and `build.config.ts` (unbuild).

---

## Step 2: Define the database schema

Create `src/database/schema.ts` using Drizzle ORM's `pgTable`. Follow the entity conventions: CUID `id`, `deletedAt` for soft deletion, `version` for optimistic locking.

```typescript
// src/database/schema.ts
import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'

export const stockLocations = pgTable('stock_locations', {
  id:             text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  handle:         text('handle').notNull(),
  name:           text('name').notNull(),
  isDefault:      boolean('is_default').notNull().default(false),
  isActive:       boolean('is_active').notNull().default(true),
  metadata:       jsonb('metadata'),
  deletedAt:      timestamp('deleted_at'),
  version:        integer('version').notNull().default(1),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('stock_locations_organization_id_idx').on(t.organizationId),
  unique('stock_locations_org_handle_uniq').on(t.organizationId, t.handle),
])

export const stockLocationAddresses = pgTable('stock_location_addresses', {
  id:              text('id').primaryKey(),
  stockLocationId: text('stock_location_id').notNull()
    .references(() => stockLocations.id, { onDelete: 'cascade' }).unique(),
  addressLine1:    text('address_line_1').notNull(),
  addressLine2:    text('address_line_2'),
  city:            text('city').notNull(),
  province:        text('province'),
  postalCode:      text('postal_code'),
  countryCode:     text('country_code').notNull(),
  phone:           text('phone'),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
})
```

If your entities have relationships, define them in `src/database/relations.ts` using `defineRelationsPart` from `drizzle-orm`. Relations receive the full `SchemaRegistry` so they can reference tables from other modules without hard imports.

---

## Step 3: Create a migration

Add a `drizzle.config.ts` at the module root pointing at your schema and migrations directory, then generate and apply the migration:

```bash
pnpm migrate:generate   # generates SQL from schema diff
pnpm migrate:latest     # applies pending migrations
```

The generated SQL for stock-location looks like this:

```sql
CREATE TABLE "stock_locations" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "handle" text NOT NULL,
  "name" text NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb,
  "deleted_at" timestamp,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "stock_locations_org_handle_uniq" UNIQUE("organization_id", "handle")
);

CREATE INDEX "stock_locations_organization_id_idx" ON "stock_locations" ("organization_id");
```

Migration files live in `migrations/` and are committed to source control.

---

## Step 4: Implement the service

Services are created with a factory function that receives a `Database` instance. This makes them trivially testable — just pass a test database.

```typescript
// src/services/stock-location.service.ts (abbreviated)
import type { Database } from '@czo/kit/db'
import { Repository } from '@czo/kit/db'
import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'

class StockLocationRepository extends Repository<
  StockLocationSchema,
  typeof stockLocations,
  'stockLocations'
> {}

class StockLocationAddressRepository extends Repository<
  StockLocationSchema,
  typeof stockLocationAddresses,
  'stockLocationAddresses'
> {}

export function createStockLocationService(db: Database) {
  const locationRepo = new StockLocationRepository(db, stockLocations, 'stockLocations')
  const addressRepo  = new StockLocationAddressRepository(db, stockLocationAddresses, 'stockLocationAddresses')

  return {
    async create(input: CreateStockLocationInput) {
      // 1. Validate with Zod
      // 2. Generate id and handle
      // 3. Insert into DB (transaction)
      // 4. Publish created event
    },
    // update, delete, findById, list …
  }
}

export type StockLocationService = ReturnType<typeof createStockLocationService>
```

Key practices:
- Use **Zod** to validate all inputs at the service boundary before touching the database.
- Use **`@paralleldrive/cuid2`** for ID generation.
- Use **transactions** for operations that touch multiple tables.
- Publish a domain event after every state-changing operation.

---

## Step 5: Define events

Create `src/events/types.ts` with the event key map and payload interfaces. Extend the global `EventMap` with declaration merging so that the event bus is fully typed across the entire workspace:

```typescript
// src/events/types.ts
export const STOCK_LOCATION_EVENTS = {
  CREATED:         'stockLocation.location.created',
  UPDATED:         'stockLocation.location.updated',
  STATUS_CHANGED:  'stockLocation.location.statusChanged',
  DELETED:         'stockLocation.location.deleted',
  DEFAULT_CHANGED: 'stockLocation.location.defaultChanged',
} as const

export interface StockLocationCreatedPayload {
  id: string
  organizationId: string
  handle: string
  name: string
}

// … other payload interfaces …

declare module '@czo/kit/event-bus' {
  interface EventMap {
    'stockLocation.location.created': StockLocationCreatedPayload
    'stockLocation.location.updated': StockLocationUpdatedPayload
    'stockLocation.location.statusChanged': StockLocationStatusChangedPayload
    'stockLocation.location.deleted': StockLocationDeletedPayload
    'stockLocation.location.defaultChanged': StockLocationDefaultChangedPayload
  }
}
```

Then create `src/events/stock-location-events.ts` with a `publishStockLocationEvent` helper that lazily resolves the event bus and fires the event.

**Event naming convention**: `<domain>.<entity>.<verb>` — lowercase, dot-separated.

---

## Step 6: Write the GraphQL schema

Create `src/graphql/schema/<domain>/schema.graphql`. Use `extend type Mutation` (never redefine the root types). Permission directives guard operations.

```graphql
type StockLocation {
  id: ID!
  organizationId: ID!
  handle: String!
  name: String!
  isDefault: Boolean!
  isActive: Boolean!
  metadata: JSON
  address: StockLocationAddress
  createdAt: DateTime!
  updatedAt: DateTime!
}

type StockLocationAddress {
  id: ID!
  addressLine1: String!
  addressLine2: String
  city: String!
  province: String
  postalCode: String
  countryCode: String!
  phone: String
}

input CreateStockLocationInput {
  name: String!
  handle: String
  organizationId: ID!
  addressLine1: String!
  addressLine2: String
  city: String!
  province: String
  postalCode: String
  countryCode: String!
  phone: String
  metadata: JSON
}

extend type Mutation {
  createStockLocation(input: CreateStockLocationInput!): StockLocation!
    @permission(resource: "stock-location", action: "create")
}
```

After writing the schema, run `pnpm graphql:generate` to produce the TypeScript types.

---

## Step 7: Implement resolvers

Resolvers live in `src/graphql/schema/<domain>/resolvers/Mutation/` (or `Query/`). They are intentionally thin — no business logic, just argument mapping.

```typescript
// src/graphql/schema/stock-location/resolvers/Mutation/createStockLocation.ts
import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const createStockLocation: NonNullable<MutationResolvers['createStockLocation']> =
  async (_parent, _arg, _ctx) => {
    return _ctx.stockLocation.service.create({
      name:           _arg.input.name,
      handle:         _arg.input.handle ?? undefined,
      organizationId: _arg.input.organizationId,
      addressLine1:   _arg.input.addressLine1,
      addressLine2:   _arg.input.addressLine2 ?? undefined,
      city:           _arg.input.city,
      province:       _arg.input.province ?? undefined,
      postalCode:     _arg.input.postalCode ?? undefined,
      countryCode:    _arg.input.countryCode,
      phone:          _arg.input.phone ?? undefined,
      metadata:       _arg.input.metadata as Record<string, unknown> | undefined,
    })
  }
```

The codegen configuration in `codegen.ts` maps GraphQL types to their database row types (the `mappers` option), so TypeScript knows what shape each resolver must return.

---

## Step 8: Declare types (declaration merging)

Create `src/types.ts` to extend three global interfaces. This file must be imported in `src/module.ts` so the declarations are applied when the module is loaded.

```typescript
// src/types.ts
import type { GraphQLContextMap } from '@czo/kit/graphql'
import type { StockLocationService } from './services/stock-location.service'

declare module 'nitro/types' {
  interface NitroRuntimeHooks {
    'czo:init':     () => void
    'czo:register': () => void
    'czo:boot':     () => void
  }
}

declare module '@czo/kit/db' {
  interface SchemaRegistry {
    stockLocations:         typeof import('./database/schema').stockLocations
    stockLocationAddresses: typeof import('./database/schema').stockLocationAddresses
  }
}

declare module '@czo/kit/ioc' {
  interface ContainerBindings {
    'stockLocation:service': StockLocationService
  }
}

declare module '@czo/kit/graphql' {
  interface GraphQLContextMap {
    stockLocation: {
      service: StockLocationService
    }
  }
}

export type GraphQLContext = GraphQLContextMap
```

---

## Step 9: Write the plugin

The plugin ties everything together through the three lifecycle hooks:

```typescript
// src/plugins/index.ts
import { useLogger } from '@czo/kit'
import { registerRelations, registerSchema, useDatabase } from '@czo/kit/db'
import { useContainer } from '@czo/kit/ioc'
import { stockLocationRelations } from '@czo/stock-location/relations'
import * as stockLocationSchema from '@czo/stock-location/schema'
import { createStockLocationService } from '@czo/stock-location/services'
import { definePlugin } from 'nitro'

export default definePlugin((nitroApp) => {
  const logger = useLogger('stock-location:plugin')

  // Phase 1 – register schema so relations can reference these tables
  nitroApp.hooks.hook('czo:init', async () => {
    registerSchema(stockLocationSchema)
    registerRelations(stockLocationRelations)
    logger.info('Schema and relations registered')
  })

  // Phase 2 – register access-control domain with the auth module
  nitroApp.hooks.hook('czo:register', async () => {
    const container = useContainer()
    const accessService = await container.make('auth:access')
    accessService.register({
      name: 'stock-location',
      statements: { 'stock-location': ['create', 'read', 'update', 'delete'] },
      hierarchy: [
        { name: 'member',  permissions: { 'stock-location': ['read'] } },
        { name: 'manager', permissions: { 'stock-location': ['create', 'read', 'update'] } },
        { name: 'owner',   permissions: { 'stock-location': ['create', 'read', 'update', 'delete'] } },
      ],
    })
    logger.info('Access domain registered')
  })

  // Phase 3 – instantiate service and load GraphQL schema
  nitroApp.hooks.hook('czo:boot', async () => {
    const container = useContainer()
    const db = await useDatabase()
    const service = createStockLocationService(db)
    container.singleton('stockLocation:service', () => service)
    await import('@czo/stock-location/graphql')
    logger.success('Stock location module booted')
  })
})
```

---

## Step 10: Module entry and registration

Create `src/module.ts` — the package's main entry point. It calls `defineNitroModule`, resolves the plugin path, and imports `./types` so declaration merging takes effect:

```typescript
// src/module.ts
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

Finally, register the module in the backend app:

```typescript
// apps/mazo/nitro.config.ts
export default defineNitroConfig({
  modules: [
    '@czo/auth',
    '@czo/stock-location',  // add your module here
  ],
})
```

Build the new package (`pnpm build` from the module directory) before starting the dev server.

---

## Summary

| Step | File | Purpose |
|------|------|---------|
| 1 | `package.json` | Package identity, exports map, scripts |
| 2 | `src/database/schema.ts` | Drizzle table definitions |
| 3 | `migrations/*.sql` | Schema migrations |
| 4 | `src/services/*.ts` | Business logic, Zod validation |
| 5 | `src/events/types.ts` | Event constants and EventMap merging |
| 6 | `src/graphql/schema/*/*.graphql` | GraphQL SDL |
| 7 | `src/graphql/schema/*/resolvers/**` | Thin resolver implementations |
| 8 | `src/types.ts` | Declaration merging (Schema, IoC, GraphQL context) |
| 9 | `src/plugins/index.ts` | Lifecycle hooks |
| 10 | `src/module.ts` + `apps/mazo/nitro.config.ts` | Module entry and registration |
