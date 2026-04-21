# Design — Migration `@czo/stock-location` vers Pothos

**Date** : 2026-04-20
**Scope** : Module `@czo/stock-location` uniquement
**Dépendance d'ordre** : `@czo/kit` ET `@czo/auth` doivent être migrés **avant** ce module (décision B — auth avant stock-location pour la ref cross-module `Organization`)

---

## 1. Contexte

### État actuel

- 2 tables : `stockLocations` et `stockLocationAddresses`
- 1 mutation : `createStockLocation` (avec `withPaylaod` + `userErrors`)
- 0 queries exposée
- 5 event types déclarés (`stockLocation.location.{created,updated,statusChanged,deleted,defaultChanged}`), **1 seul publié** aujourd'hui (CREATED)
- Utilise `Repository<T>` via `StockLocationRepository.buildService([db])` et `StockLocationAddressRepository.buildService([db])`
- Cross-module : `stockLocations.organizationId` est un `text` qui référence les organizations d'`auth`

### Motivation

Le module est un bon POC de la stack Pothos+Drizzle parce que petit (~200 LoC source), avec assez de surface pour exercer tous les patterns du kit :
- `drizzleNode` avec globalID
- `drizzleConnection` avec filtres
- Relations 1:0..1 (StockLocation → StockLocationAddress)
- Cross-module ref (StockLocation.organization → Organization d'auth)
- Mutations avec transactions
- Events de domaine
- Optimistic locking
- Soft delete

### Portée fonctionnelle (élargie)

Les 5 events déclarés dans `events/types.ts` anticipent un CRUD complet. La migration livre la surface cohérente plutôt que seulement le `create` existant :

| Mutation | Event publié |
|---|---|
| `createStockLocation` | `stockLocation.location.created` |
| `updateStockLocation` | `stockLocation.location.updated` |
| `deleteStockLocation` (soft) | `stockLocation.location.deleted` |
| `setStockLocationStatus` | `stockLocation.location.statusChanged` |
| `setDefaultStockLocation` | `stockLocation.location.defaultChanged` |

Queries ajoutées :
- `stockLocation(id: ID!): StockLocation`
- `stockLocations(organizationId, isActive, isDefault): StockLocationConnection` — Relay

---

## 2. Architecture

### 2.1 Layout de fichiers cible

```
packages/modules/stock-location/src/
├── database/                  # (inchangé)
├── events/                    # (inchangé)
├── services/
│   ├── stock-location.service.ts      # 🔄 REWRITE — Drizzle direct, events, sans Repository
│   └── index.ts
├── graphql/
│   ├── index.ts                       # ✨ exporte registerStockLocationSchema(builder)
│   ├── context-factory.ts             # (léger ajustement — service consolidé)
│   ├── schema/
│   │   ├── stock-location/
│   │   │   ├── types.ts               # ✨ StockLocation + StockLocationAddress (drizzleNode)
│   │   │   ├── inputs.ts              # ✨ inputs + zod schemas
│   │   │   ├── queries.ts             # ✨ stockLocation, stockLocations connection
│   │   │   ├── mutations.ts           # ✨ 5 mutations
│   │   │   └── errors.ts              # ✨ erreurs domain-specific si besoin
│   │   └── index.ts                   # ✨ orchestration des register*
│   ├── middleware/                    # ❌ DELETED
│   ├── resolvers.ts                   # ❌ DELETED
│   ├── typedefs.ts                    # ❌ DELETED
│   ├── schema.generated.graphqls      # ❌ DELETED (SDL centralisé dans apps/mazo)
│   ├── schema/base/                   # ❌ DELETED (types de base dans kit)
│   └── __generated__/                 # ❌ DELETED
├── plugins/
│   └── index.ts                       # 🔄 remplace import side-effect par registerSchema(fn)
├── module.ts                          # (inchangé)
└── types.ts                           # 🔄 ajuster GraphQLContext
```

### 2.2 Type `StockLocationBuilder`

```ts
// packages/modules/stock-location/src/graphql/schema/index.ts
import type { CZOBuilder } from '@czo/kit/graphql'
import type { Database } from '@czo/kit/db'
import type { stockLocationRelations } from '../../database/relations'
import type { GraphQLContext } from '../../types'

export type StockLocationBuilder = CZOBuilder<
  Database,
  ReturnType<typeof stockLocationRelations>,
  GraphQLContext
>
```

Point d'attention : le type `StockLocationBuilder` typera les relations **spécifiques au module**. Au runtime, le builder reçoit `registeredRelations()` qui combine auth + stock-location. Cette discrepancy est acceptable (le module n'accède qu'à ses propres relations), mais si on veut que stock-location fasse `t.relation('organization')` vers une relation auth, il faudrait élargir le type. Pour notre cas (ref explicite via `resolve` → service), ce n'est pas nécessaire.

### 2.3 Flow runtime

```
auth's czo:boot    → registerSchema(registerAuthSchema)          (registration 1)
stock-location's czo:boot → registerSchema(registerStockLocationSchema)  (registration 2)

[first HTTP request]
apps/mazo/api/graphql.ts →
  initBuilder(...) → buildSchema(builder) →
    1. apply registration 1 (auth types, including 'Organization')
    2. apply registration 2 (stock-location types, references 'Organization' by string)
    3. builder.toSchema() resolves string refs → validation passes
```

L'ordre dépend du `modules: [...]` de `apps/mazo/nitro.config.ts`. Auth doit être listé **avant** stock-location pour que les types auth soient enregistrés en premier (en pratique, Pothos résout les refs par nom au `toSchema()` donc l'ordre est peu sensible, mais on préfère la cohérence).

---

## 3. Couche service (B' refactor)

### 3.1 `services/stock-location.service.ts`

```ts
import { and, eq, sql } from 'drizzle-orm'
import { notDeleted, optimisticUpdate, toDatabaseError, type Database } from '@czo/kit/db'
import { stockLocations, stockLocationAddresses } from '../database/schema'
import { publishStockLocationEvent } from '../events/stock-location-events'
import { STOCK_LOCATION_EVENTS } from '../events/types'

export interface CreateStockLocationInput {
  organizationId: string
  name: string
  handle: string
  isDefault?: boolean
  isActive?: boolean
  metadata?: Record<string, unknown>
  address?: CreateStockLocationAddressInput
}

export interface CreateStockLocationAddressInput {
  addressLine1: string
  addressLine2?: string
  city: string
  province?: string
  postalCode?: string
  countryCode: string
  phone?: string
}

export interface UpdateStockLocationInput {
  name?: string
  handle?: string
  metadata?: Record<string, unknown>
  address?: CreateStockLocationAddressInput
}

export function createStockLocationService(db: Database) {
  return {
    async find(id: number) {
      const [row] = await db
        .select()
        .from(stockLocations)
        .where(notDeleted(stockLocations, eq(stockLocations.id, id)))
        .limit(1)
      return row ?? null
    },

    async findByHandle(organizationId: string, handle: string) {
      const [row] = await db
        .select()
        .from(stockLocations)
        .where(notDeleted(stockLocations, and(
          eq(stockLocations.organizationId, organizationId),
          eq(stockLocations.handle, handle),
        )!))
        .limit(1)
      return row ?? null
    },

    async create(input: CreateStockLocationInput) {
      return db.transaction(async (tx) => {
        try {
          const [location] = await tx
            .insert(stockLocations)
            .values({
              organizationId: input.organizationId,
              name: input.name,
              handle: input.handle,
              isDefault: input.isDefault ?? false,
              isActive: input.isActive ?? true,
              metadata: input.metadata ?? null,
            })
            .returning()

          if (input.address) {
            await tx.insert(stockLocationAddresses).values({
              stockLocationId: location.id,
              ...input.address,
            })
          }

          await publishStockLocationEvent(STOCK_LOCATION_EVENTS.CREATED, {
            id: String(location.id),
            organizationId: location.organizationId,
            handle: location.handle,
            name: location.name,
          })

          return location
        }
        catch (err) {
          throw toDatabaseError(err)
        }
      })
    },

    async update(id: number, expectedVersion: number, input: UpdateStockLocationInput) {
      const updated = await optimisticUpdate({
        db, table: stockLocations, id, expectedVersion,
        values: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.handle !== undefined && { handle: input.handle }),
          ...(input.metadata !== undefined && { metadata: input.metadata }),
        },
      })

      if (input.address) {
        await db
          .insert(stockLocationAddresses)
          .values({ stockLocationId: id, ...input.address })
          .onConflictDoUpdate({
            target: stockLocationAddresses.stockLocationId,
            set: input.address,
          })
      }

      await publishStockLocationEvent(STOCK_LOCATION_EVENTS.UPDATED, {
        id: String(id),
        organizationId: updated.organizationId,
        changes: Object.keys(input).filter(k => k !== 'address'),
      })

      return updated
    },

    async softDelete(id: number, expectedVersion: number) {
      const deleted = await optimisticUpdate({
        db, table: stockLocations, id, expectedVersion,
        values: { deletedAt: sql`NOW()` as any },
      })

      await publishStockLocationEvent(STOCK_LOCATION_EVENTS.DELETED, {
        id: String(id),
        organizationId: deleted.organizationId,
        handle: deleted.handle,
      })
      return deleted
    },

    async setStatus(id: number, expectedVersion: number, isActive: boolean) {
      const updated = await optimisticUpdate({
        db, table: stockLocations, id, expectedVersion,
        values: { isActive },
      })
      await publishStockLocationEvent(STOCK_LOCATION_EVENTS.STATUS_CHANGED, {
        id: String(id), organizationId: updated.organizationId, isActive,
      })
      return updated
    },

    async setDefault(id: number, expectedVersion: number) {
      return db.transaction(async (tx) => {
        // Lock target row + resolve its org
        const [target] = await tx
          .select({ organizationId: stockLocations.organizationId })
          .from(stockLocations)
          .where(and(eq(stockLocations.id, id), eq(stockLocations.version, expectedVersion)))
          .for('update')
          .limit(1)
        if (!target) {
          const [current] = await tx
            .select({ version: stockLocations.version })
            .from(stockLocations)
            .where(eq(stockLocations.id, id))
            .limit(1)
          throw new OptimisticLockError(id, expectedVersion, current?.version ?? null)
        }

        // Unset any previous default in the same org
        const [previousDefault] = await tx
          .update(stockLocations)
          .set({ isDefault: false })
          .where(and(
            eq(stockLocations.organizationId, target.organizationId),
            eq(stockLocations.isDefault, true),
          ))
          .returning({ id: stockLocations.id })

        const updated = await optimisticUpdate({
          db: tx as Database, table: stockLocations, id, expectedVersion,
          values: { isDefault: true },
        })

        await publishStockLocationEvent(STOCK_LOCATION_EVENTS.DEFAULT_CHANGED, {
          id: String(id),
          organizationId: target.organizationId,
          previousDefaultId: previousDefault ? String(previousDefault.id) : null,
        })
        return updated
      })
    },
  }
}

export type StockLocationService = ReturnType<typeof createStockLocationService>
```

### 3.2 Helper `generateHandle`

```ts
// services/stock-location.service.ts (privé au module)
function generateHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}
```

Appelé par la mutation `createStockLocation` quand `input.handle` est absent. Dedupe par org géré par `unique('stock_locations_org_handle_uniq')` + `toDatabaseError` → `ConflictError`.

### 3.3 Changements vs l'ancien service

| Ancien | Nouveau |
|---|---|
| `StockLocationRepository extends Repository<...>` | Factory `createStockLocationService(db)` |
| `StockLocationAddressRepository` séparé | Intégré dans `createStockLocationService` (transactions) |
| `Repository.create()` | `db.insert(...).values(...).returning()` direct |
| `Repository.update()` | `optimisticUpdate({...})` |
| `Repository.findMany()` avec soft-delete auto | `db.select().where(notDeleted(...))` explicite |
| Pas d'events dans le repo | `publishStockLocationEvent` dans chaque mutation |

---

## 4. Schéma Pothos

### 4.1 `graphql/schema/stock-location/types.ts`

```ts
import type { StockLocationBuilder } from '../index'
import { stockLocations, stockLocationAddresses } from '../../../database/schema'

export function registerStockLocationTypes(builder: StockLocationBuilder) {
  const StockLocationAddressNode = builder.drizzleNode('stockLocationAddresses', {
    name: 'StockLocationAddress',
    id: { column: (a) => a.id },
    fields: (t) => ({
      addressLine1: t.exposeString('addressLine1'),
      addressLine2: t.exposeString('addressLine2', { nullable: true }),
      city: t.exposeString('city'),
      province: t.exposeString('province', { nullable: true }),
      postalCode: t.exposeString('postalCode', { nullable: true }),
      countryCode: t.exposeString('countryCode'),
      phone: t.exposeString('phone', { nullable: true }),
    }),
  })

  builder.drizzleNode('stockLocations', {
    name: 'StockLocation',
    id: { column: (l) => l.id },
    fields: (t) => ({
      handle: t.exposeString('handle'),
      name: t.exposeString('name'),
      isDefault: t.exposeBoolean('isDefault'),
      isActive: t.exposeBoolean('isActive'),
      metadata: t.field({
        type: 'JSONObject',
        nullable: true,
        resolve: (l) => l.metadata as Record<string, unknown> | null,
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
      version: t.exposeInt('version'),

      // Cross-module ref — résolue via le service IoC-injected d'auth
      organization: t.field({
        type: 'Organization',
        nullable: false,
        resolve: async (loc, _, ctx) =>
          ctx.auth.organizationService.find({ id: loc.organizationId }),
      }),

      // Relation 1:0..1 vers l'address (auto-batchée par plugin-drizzle)
      address: t.relation('address', { nullable: true }),
    }),
  })
}
```

### 4.2 `graphql/schema/stock-location/inputs.ts`

```ts
import { z } from 'zod'
import type { StockLocationBuilder } from '../index'

export const stockLocationAddressSchema = z.object({
  addressLine1: z.string().min(1).max(255),
  addressLine2: z.string().max(255).optional(),
  city: z.string().min(1).max(100),
  province: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  countryCode: z.string().length(2),
  phone: z.string().max(20).optional(),
})

export const createStockLocationSchema = z.object({
  name: z.string().min(1).max(255).transform(v => v.trim()),
  handle: z.string().regex(/^[a-z0-9-]+$/).max(100).optional(),
  organizationId: z.string().min(1),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
  address: stockLocationAddressSchema.optional(),
})

export const updateStockLocationSchema = z.object({
  name: z.string().min(1).max(255).transform(v => v.trim()).optional(),
  handle: z.string().regex(/^[a-z0-9-]+$/).max(100).optional(),
  metadata: z.record(z.any()).optional(),
  address: stockLocationAddressSchema.optional(),
})

export function registerStockLocationInputs(builder: StockLocationBuilder) {
  const StockLocationAddressInput = builder.inputType('StockLocationAddressInput', {
    fields: (t) => ({
      addressLine1: t.string({ required: true }),
      addressLine2: t.string(),
      city: t.string({ required: true }),
      province: t.string(),
      postalCode: t.string(),
      countryCode: t.string({ required: true }),
      phone: t.string(),
    }),
  })

  const CreateStockLocationInput = builder.inputType('CreateStockLocationInput', {
    fields: (t) => ({
      organizationId: t.globalID({ required: true, for: ['Organization'] }),
      name: t.string({ required: true }),
      handle: t.string(),
      isDefault: t.boolean(),
      isActive: t.boolean(),
      metadata: t.field({ type: 'JSONObject' }),
      address: t.field({ type: StockLocationAddressInput }),
    }),
  })

  const UpdateStockLocationInput = builder.inputType('UpdateStockLocationInput', {
    fields: (t) => ({
      name: t.string(),
      handle: t.string(),
      metadata: t.field({ type: 'JSONObject' }),
      address: t.field({ type: StockLocationAddressInput }),
    }),
  })

  return { CreateStockLocationInput, UpdateStockLocationInput, StockLocationAddressInput }
}
```

### 4.3 `graphql/schema/stock-location/queries.ts`

```ts
import { withNotDeleted, useDatabase } from '@czo/kit/db'
import type { StockLocationBuilder } from '../index'

export function registerStockLocationQueries(builder: StockLocationBuilder) {
  builder.queryField('stockLocation', (t) =>
    t.drizzleField({
      type: 'stockLocations',
      nullable: true,
      args: { id: t.arg.globalID({ required: true, for: ['StockLocation'] }) },
      authScopes: { permission: { resource: 'stock-location', actions: ['read'] } },
      resolve: async (query, _r, { id }) => {
        const db = await useDatabase()
        return db.query.stockLocations.findFirst(query({
          where: withNotDeleted({ id: Number(id.id) }),
        }))
      },
    }),
  )

  builder.queryField('stockLocations', (t) =>
    t.drizzleConnection({
      type: 'stockLocations',
      authScopes: { permission: { resource: 'stock-location', actions: ['read'] } },
      args: {
        organizationId: t.arg.globalID({ for: ['Organization'] }),
        isActive: t.arg.boolean(),
        isDefault: t.arg.boolean(),
      },
      resolve: async (query, _r, args) => {
        const db = await useDatabase()
        return db.query.stockLocations.findMany(query({
          where: withNotDeleted({
            ...(args.organizationId && { organizationId: args.organizationId.id }),
            ...(args.isActive !== null && args.isActive !== undefined && { isActive: args.isActive }),
            ...(args.isDefault !== null && args.isDefault !== undefined && { isDefault: args.isDefault }),
          }),
          orderBy: { createdAt: 'desc' },
        }))
      },
    }),
  )
}
```

### 4.4 `graphql/schema/stock-location/mutations.ts`

```ts
import { useContainer } from '@czo/kit/ioc'
import { ConflictError, ValidationError, NotFoundError } from '@czo/kit/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { createStockLocationSchema, updateStockLocationSchema } from './inputs'
import type { StockLocationService } from '../../../services/stock-location.service'
import type { StockLocationBuilder } from '../index'

async function getService(): Promise<StockLocationService> {
  const container = useContainer()
  return container.make('stockLocation:service')
}

function generateHandle(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
}

export function registerStockLocationMutations(builder: StockLocationBuilder) {
  builder.mutationField('createStockLocation', (t) =>
    t.field({
      type: 'StockLocation',
      errors: { types: [ValidationError, ConflictError] },
      args: { input: t.arg({ type: 'CreateStockLocationInput', required: true }) },
      authScopes: { permission: { resource: 'stock-location', actions: ['create'] } },
      resolve: async (_r, { input }) => {
        const parsed = createStockLocationSchema.safeParse({
          ...input,
          organizationId: input.organizationId.id,
          handle: input.handle ?? generateHandle(input.name),
        })
        if (!parsed.success) throw ValidationError.fromZod(parsed.error)

        const service = await getService()
        const existing = await service.findByHandle(parsed.data.organizationId, parsed.data.handle!)
        if (existing) {
          throw new ConflictError('StockLocation', 'handle', `Handle '${parsed.data.handle}' already exists in organization`)
        }
        return service.create(parsed.data as any)
      },
    }),
  )

  builder.mutationField('updateStockLocation', (t) =>
    t.field({
      type: 'StockLocation',
      errors: { types: [ValidationError, NotFoundError, OptimisticLockError] },
      args: {
        id: t.arg.globalID({ required: true, for: ['StockLocation'] }),
        version: t.arg.int({ required: true }),
        input: t.arg({ type: 'UpdateStockLocationInput', required: true }),
      },
      authScopes: { permission: { resource: 'stock-location', actions: ['update'] } },
      resolve: async (_r, { id, version, input }) => {
        const parsed = updateStockLocationSchema.safeParse(input)
        if (!parsed.success) throw ValidationError.fromZod(parsed.error)
        const service = await getService()
        const existing = await service.find(Number(id.id))
        if (!existing) throw new NotFoundError('StockLocation', id.id)
        return service.update(Number(id.id), version, parsed.data)
      },
    }),
  )

  builder.mutationField('deleteStockLocation', (t) =>
    t.field({
      type: 'StockLocation',
      errors: { types: [NotFoundError, OptimisticLockError] },
      args: {
        id: t.arg.globalID({ required: true, for: ['StockLocation'] }),
        version: t.arg.int({ required: true }),
      },
      authScopes: { permission: { resource: 'stock-location', actions: ['delete'] } },
      resolve: async (_r, { id, version }) => {
        const service = await getService()
        const existing = await service.find(Number(id.id))
        if (!existing) throw new NotFoundError('StockLocation', id.id)
        return service.softDelete(Number(id.id), version)
      },
    }),
  )

  builder.mutationField('setStockLocationStatus', (t) =>
    t.field({
      type: 'StockLocation',
      errors: { types: [NotFoundError, OptimisticLockError] },
      args: {
        id: t.arg.globalID({ required: true, for: ['StockLocation'] }),
        version: t.arg.int({ required: true }),
        isActive: t.arg.boolean({ required: true }),
      },
      authScopes: { permission: { resource: 'stock-location', actions: ['update'] } },
      resolve: async (_r, { id, version, isActive }) => {
        const service = await getService()
        return service.setStatus(Number(id.id), version, isActive)
      },
    }),
  )

  builder.mutationField('setDefaultStockLocation', (t) =>
    t.field({
      type: 'StockLocation',
      errors: { types: [NotFoundError, OptimisticLockError] },
      args: {
        id: t.arg.globalID({ required: true, for: ['StockLocation'] }),
        version: t.arg.int({ required: true }),
      },
      authScopes: { permission: { resource: 'stock-location', actions: ['update'] } },
      resolve: async (_r, { id, version }) => {
        const service = await getService()
        return service.setDefault(Number(id.id), version)
      },
    }),
  )
}
```

### 4.5 `graphql/schema/index.ts` — Orchestration

```ts
import type { CZOBuilder } from '@czo/kit/graphql'
import type { Database } from '@czo/kit/db'
import type { stockLocationRelations } from '../../database/relations'
import type { GraphQLContext } from '../../types'

import { registerStockLocationTypes } from './stock-location/types'
import { registerStockLocationInputs } from './stock-location/inputs'
import { registerStockLocationQueries } from './stock-location/queries'
import { registerStockLocationMutations } from './stock-location/mutations'

export type StockLocationBuilder = CZOBuilder<
  Database,
  ReturnType<typeof stockLocationRelations>,
  GraphQLContext
>

export function registerStockLocationSchema(builder: StockLocationBuilder) {
  registerStockLocationTypes(builder)
  registerStockLocationInputs(builder)
  registerStockLocationQueries(builder)
  registerStockLocationMutations(builder)
}
```

### 4.6 `plugins/index.ts` — Registration runtime

```ts
import { registerSchema } from '@czo/kit/graphql'
import { registerStockLocationSchema } from '@czo/stock-location/graphql'
import { createStockLocationService } from '@czo/stock-location/services'

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('czo:boot', async () => {
    const container = useContainer()
    const db = await useDatabase()
    const service = createStockLocationService(db)
    container.singleton('stockLocation:service', () => service)

    registerSchema(registerStockLocationSchema)
  })
})
```

---

## 5. Stratégie de tests

### 5.1 Matrice

| Cible | Type | DB | Fichier |
|---|---|---|---|
| `stockLocationService.find()`, `findByHandle()` | Unit (SQL gen via `.toSQL()`) | ❌ | `services/stock-location.service.test.ts` |
| `stockLocationService.create()` — transaction, event | **Intégration** | ✅ | idem |
| `stockLocationService.update()` — optimistic lock | **Intégration** | ✅ | idem |
| `stockLocationService.softDelete()` | **Intégration** | ✅ | idem |
| `stockLocationService.setDefault()` — unicité par org, race | **Intégration** | ✅ | idem |
| Zod schemas (`createStockLocationSchema`, etc.) | Unit | ❌ | `graphql/schema/stock-location/inputs.test.ts` |
| `generateHandle()` | Unit | ❌ | idem |
| Resolvers queries (filters, connection, authScopes) | **Intégration GraphQL** | ✅ | `graphql/schema/stock-location/queries.test.ts` |
| Resolvers mutations (errors, authScopes) | **Intégration GraphQL** | ✅ | `graphql/schema/stock-location/mutations.test.ts` |

**Ratio** : ~30% unit, ~70% intégration.

### 5.2 Exemple — test d'intégration mutation

```ts
// graphql/schema/stock-location/mutations.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { createTestDb, truncate } from '@czo/kit/testing'
import { initBuilder, registerSchema, buildSchema } from '@czo/kit/graphql'
import { registerStockLocationSchema } from '../../../graphql'
import { graphql, type GraphQLSchema } from 'graphql'
import { stockLocations, stockLocationAddresses } from '../../../../database/schema'
import { stockLocationRelations } from '../../../../database/relations'

describe('createStockLocation mutation', () => {
  const db = createTestDb()
  let schema: GraphQLSchema

  beforeAll(async () => {
    registerSchema(registerStockLocationSchema)
    const builder = initBuilder({ db, relations: stockLocationRelations(...) })
    schema = buildSchema(builder)
  })

  beforeEach(() => truncate(db, stockLocations, stockLocationAddresses))

  it('creates a location + address in a transaction', async () => {
    const result = await graphql({
      schema,
      source: `
        mutation CreateLoc($input: CreateStockLocationInput!) {
          createStockLocation(input: $input) {
            __typename
            ... on StockLocation {
              id name handle isDefault isActive
              address { city countryCode }
            }
          }
        }
      `,
      variableValues: { input: { organizationId: '...', name: 'Main', address: { addressLine1: '...', city: 'Paris', countryCode: 'FR' } } },
      contextValue: mockContext({ permissions: { 'stock-location': ['create'] } }),
    })
    expect((result.data as any).createStockLocation.__typename).toBe('StockLocation')
    const addresses = await db.select().from(stockLocationAddresses)
    expect(addresses).toHaveLength(1)
  })

  it('returns ConflictError on duplicate handle in same org', async () => {
    await db.insert(stockLocations).values({ organizationId: 'org-1', handle: 'main', name: 'Main' })
    const result = await graphql({
      schema,
      source: `mutation { createStockLocation(input: { organizationId: "...", name: "Main", handle: "main" }) { __typename ... on ConflictError { conflictField } } }`,
      contextValue: mockContext(...),
    })
    expect((result.data as any).createStockLocation.__typename).toBe('ConflictError')
  })

  it('returns ForbiddenError without stock-location:create permission', async () => {
    const result = await graphql({
      schema,
      source: `mutation { createStockLocation(input: {...}) { __typename } }`,
      contextValue: mockContext({ permissions: {} }),
    })
    expect((result.data as any).createStockLocation.__typename).toBe('ForbiddenError')
  })
})
```

### 5.3 Helper `mockContext`

Fichier local au module — construit un `GraphQLContext` minimal avec `auth.authService.hasPermission(...)` mockable. Pas remonté en kit (chaque module a son propre contexte).

### 5.4 Setup DB tests

Migrations existantes du module appliquées via un script `pnpm migrate:latest` avant la suite. Les tests d'intégration utilisent `@czo/kit/testing` (`createTestDb`, `truncate`).

---

## 6. Checklist de migration

### 6.1 Convention `old/` — safety net

Tous les fichiers à **supprimer** ou **modifier** sont d'abord copiés/déplacés dans `packages/modules/stock-location/old/<path>` (miroir de la structure originelle). Le dossier `old/` est supprimé en **dernière étape**.

### 6.2 Pre-refactor — préservation `old/`

- [ ] `mkdir -p packages/modules/stock-location/old/{graphql/{middleware,schema/{base,stock-location/resolvers}},plugins,services}`
- [ ] Copier les fichiers à **modifier** vers `old/` (version pré-édition) :
  - `services/stock-location.service.ts` → `old/services/stock-location.service.ts`
  - `plugins/index.ts` → `old/plugins/index.ts`
  - `types.ts` → `old/types.ts`
  - `graphql/context-factory.ts` → `old/graphql/context-factory.ts`
  - `package.json` → `old/package.json`
- [ ] Déplacer les fichiers à **supprimer** vers `old/` :
  - `graphql/middleware/*` → `old/graphql/middleware/*`
  - `graphql/resolvers.ts` → `old/graphql/resolvers.ts`
  - `graphql/typedefs.ts` → `old/graphql/typedefs.ts`
  - `graphql/schema.generated.graphqls` → `old/graphql/schema.generated.graphqls`
  - `graphql/__generated__/*` → `old/graphql/__generated__/*`
  - `graphql/schema/base/schema.graphql` → `old/graphql/schema/base/schema.graphql`
  - `graphql/schema/stock-location/schema.graphql` → `old/graphql/schema/stock-location/schema.graphql`
  - `graphql/schema/stock-location/resolvers/*` → `old/graphql/schema/stock-location/resolvers/*`
  - `codegen.ts` → `old/codegen.ts` (si présent)

### 6.3 Création

- [ ] `services/stock-location.service.ts` réécrit (Drizzle direct + `optimisticUpdate` + events + `generateHandle`)
- [ ] `graphql/schema/stock-location/types.ts`
- [ ] `graphql/schema/stock-location/inputs.ts`
- [ ] `graphql/schema/stock-location/queries.ts`
- [ ] `graphql/schema/stock-location/mutations.ts`
- [ ] `graphql/schema/index.ts` (export `registerStockLocationSchema`, type `StockLocationBuilder`)
- [ ] `graphql/index.ts` (re-export)

### 6.4 Modification

- [ ] `plugins/index.ts` : remplacer `await import('@czo/stock-location/graphql')` par enregistrement service IoC + `registerSchema(registerStockLocationSchema)`
- [ ] `package.json` :
  - Retirer : `@graphql-codegen/*`, `@eddeee888/gcg-typescript-resolver-files`, `graphql-middleware`, `@envelop/graphql-middleware`
  - Script `generate` supprimé
- [ ] `types.ts` : ajuster `GraphQLContext` (un seul `stockLocation.service` au lieu de `service` + `addressService`)
- [ ] `context-factory.ts` : service consolidé

### 6.5 Tests

- [ ] Tests services unit + intégration
- [ ] Tests GraphQL queries + mutations
- [ ] `pnpm test` passe

### 6.6 Post-refactor — cleanup `old/`

- [ ] **Dernière étape** : `rm -rf packages/modules/stock-location/old`
- [ ] Vérifier `pnpm build && pnpm test` passent toujours
- [ ] Commit séparé du cleanup

---

## 7. Risques

| Risque | Probabilité | Mitigation |
|---|---|---|
| Cross-module ref `Organization` non résolvable — auth pas encore migré | **Faible** (auth migre avant, décision B) | Ordre de migration fixé ; `buildSchema()` crashe explicitement si ref manquante en dev |
| `setDefault` race condition — 2 mutations concurrentes même org | Moyenne | `SELECT ... FOR UPDATE` sur la ligne cible dans la transaction (cf. §3.1) |
| Handle collision malgré `findByHandle` (TOCTOU) | Moyenne | `toDatabaseError(err)` sur le pg code `23505` → `ConflictError` propre |
| `JSONObject` scalaire manquant dans kit | Certaine si pas ajouté | **Action dans kit spec** : ajouter `JSONObjectResolver` de `graphql-scalars` à `createBuilder()` au même titre que `DateTime` |
| Migration d'`organizationId` (text) vers une vraie FK | Hors scope | Pas changé dans cette migration — reste un `text` libre |

---

## 8. Dépendances de l'ordre d'implémentation

**Prérequis** :

1. ✅ `@czo/kit` migré (spec séparé — `2026-04-20-kit-pothos-migration-design.md`)
2. ✅ `@czo/auth` migré (spec séparé — `2026-04-20-auth-pothos-migration-design.md`)
3. Ensuite seulement : `@czo/stock-location` (ce spec)

**Pourquoi cet ordre** (décision B du brainstorm) :
- Stock-location référence `Organization` (type d'auth) via `type: 'Organization'`
- Le type doit exister dans le builder à `buildSchema()` time
- Migrer auth d'abord garantit la disponibilité, sans passe ultérieure

---

## 9. Hors scope

- Refactor du event bus — `publishStockLocationEvent` reste inchangé
- Webhooks stock-location — non implémentés aujourd'hui, pas dans ce scope
- FK `organizationId` → `organizations.id` — reste un `text` libre
- Permissions hierarchiques custom — atomiques uniquement (`stock-location:{read,create,update,delete}`)
- Indexation search / full-text sur `name` — future concern
