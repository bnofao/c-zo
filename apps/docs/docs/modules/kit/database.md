---
sidebar_position: 2
---

# Database

`@czo/kit/db` provides a Drizzle ORM wrapper with automatic connection management, a generic `Repository` base class, schema/relations registry for dynamic module composition, and optional read-replica support.

## Schema Definition

Define tables with `pgTable` from `drizzle-orm/pg-core`. Every entity should include `deletedAt` and `version` columns to participate in soft-delete and optimistic locking:

```typescript
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: integer('version').notNull().default(1),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```

### Schema Registry

Modules register their Drizzle schema and relations at `czo:init` time so the centralized database instance can compose all tables for migrations and relational queries:

```typescript
import { registerSchema, registerRelations } from '@czo/kit/db'
import * as mySchema from './database/schema'
import { myRelations } from './database/relations'

nitroApp.hooks.hook('czo:init', async () => {
  registerSchema(mySchema)
  registerRelations(myRelations)
})
```

`registeredSchemas()` merges all registered schemas into a single `SchemaRegistry` object. `registeredRelations()` calls each `RelationsFactory` with the merged schema and returns a flat relations map passed to Drizzle.

## Repository Class

Extend `Repository` to get full CRUD, soft-delete, optimistic locking, and lifecycle hooks:

```typescript
import { Repository } from '@czo/kit/db'
import { products } from './schema'
import type { ProductSchema } from './schema'

class ProductRepository extends Repository<ProductSchema, typeof products, 'products'> {}
```

### API Reference

| Method | Signature | Description |
|---|---|---|
| `create` | `(value, opts?) => Promise<Row \| null>` | Insert a single row. Automatically sets `version: 1`. |
| `createMany` | `(values, opts?) => Promise<Row[]>` | Batch insert. |
| `update` | `(value, opts?) => Promise<Row[]>` | Update matching rows. Increments `version` and sets `updatedAt`. |
| `delete` | `(opts?) => Promise<Row[]>` | Hard or soft delete. Pass `soft: true` to set `deletedAt`. |
| `restore` | `(opts?) => Promise<Row[]>` | Clear `deletedAt` to un-delete a soft-deleted row. |
| `findFirst` | `(opts?) => Promise<Row \| null>` | Return the first matching row. |
| `findMany` | `(opts?) => Promise<Row[]>` | Return all matching rows. |
| `paginateByOffset` | `(opts?) => Promise<PaginationResult>` | Cursor-free offset pagination. |

All methods accept an optional `tx` field to participate in a transaction.

By default `findFirst` and `findMany` automatically apply `WHERE deletedAt IS NULL`. Pass `includeDeleted: true` to include soft-deleted rows.

### Optimistic Locking

Pass `expectedVersion` to `update` to enable optimistic locking. If the current `version` in the database does not match, an `OptimisticLockError` is thrown:

```typescript
await repo.update(
  { name: 'New Name' },
  {
    where: eq(products.id, productId),
    expectedVersion: 3,  // must match current version in DB
  },
)
```

### Lifecycle Hooks

Override these async methods in your repository subclass:

```typescript
class ProductRepository extends Repository<...> {
  async beforeCreate(value: PgInsertValue<typeof products>) { /* validate / enrich */ }
  async afterCreate(row: InferSelectModel<typeof products>) { return row }
  async beforeUpdate(value: PgUpdateSetSource<typeof products>) {}
  async afterUpdate(row: InferSelectModel<typeof products>) {}
  async afterDelete(row: InferSelectModel<typeof products>) {}
  async afterFind(row: InferSelectModel<typeof products>) {}
}
```

## useDatabase()

`useDatabase()` returns a singleton Drizzle client. The connection URL is resolved from `runtimeConfig.database.url` or the `DATABASE_URL` environment variable. Supports comma-separated URLs for read replicas:

```typescript
import { useDatabase } from '@czo/kit/db'

const db = await useDatabase()
```

To pass explicit Drizzle config (e.g. during tests), call `useDatabase(config)` once; subsequent calls return the cached instance.

## Transactions

Pass `{ tx: tx as any }` to repository methods inside a `db.transaction` callback to enrol them in the same transaction:

```typescript
const db = await useDatabase()

await db.transaction(async (tx) => {
  const location = await locationRepo.create({ ... }, { tx: tx as any })
  const address = await addressRepo.create({ ... }, { tx: tx as any })
})
```

## Migrations

Run Drizzle Kit commands from the module directory:

```bash
# Apply all pending migrations
pnpm migrate:latest

# Create a new migration file
pnpm migrate:create <migration-name>

# Show pending migration status
pnpm migrate:status

# Regenerate TypeScript types from the database
pnpm generate:types
```

Migration files live in `packages/modules/<name>/migrations/`.
