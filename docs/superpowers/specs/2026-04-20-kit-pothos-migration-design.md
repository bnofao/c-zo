# Design — Migration `@czo/kit` vers Pothos

**Date** : 2026-04-20
**Scope** : Le package `@czo/kit` uniquement (fondation pour les modules `auth` et `stock-location`)
**Stratégie globale** : Kit livré en premier, puis modules consommateurs, sans commits intermédiaires

---

## 1. Contexte & motivation

### État actuel

Le GraphQL de c-zo est **schema-first** :
- Fichiers `.graphql` dans chaque module
- Codegen via `@eddeee888/gcg-typescript-resolver-files` → `schema.generated.graphqls`, `types.generated.ts`
- `graphql-middleware` pour les concerns transversaux (validation, permissions, userExists)
- `Repository<Table, Relations>` générique de 935 LoC dans `@czo/kit/db` qui absorbe CRUD + soft-delete + optimistic locking + pagination Relay

### Problèmes identifiés

1. **Drift schéma ↔ code**. Le module `auth` a ~20 erreurs TypeScript causées par des méthodes référencées dans les resolvers mais absentes du service (`Property 'impersonate' does not exist on ServiceOf<UserRepository>`, etc.). Le codegen ne protège pas contre ce drift.
2. **`Repository<T>` opaque**. 935 LoC de generics TypeScript masquent la logique réelle. Les invariants soft-delete/optimistic locking sont noyés.
3. **Divergence read-path**. Les resolvers GraphQL lisent via `Repository`. Les consommateurs non-GraphQL (CLI, jobs) peuvent taper Drizzle directement, avec le risque d'oublier le filtre soft-delete.
4. **Verbosité des middlewares**. Le pattern `[userExists('user'), updateUserMiddleware]` est un array que `graphql-middleware` n'accepte pas (erreur TS courante, cf. `middleware/index.ts:10-11`).

### Objectif de la migration

Passer à **Pothos + plugin-drizzle + plugin-relay + plugin-errors + plugin-scope-auth + plugin-zod**, avec une couche data simplifiée (**B'** : suppression du `Repository<T>` générique, extraction des invariants dans des helpers micro-ciblés).

---

## 2. Décisions actées (brainstorm 2026-04-20)

| # | Décision | Valeur |
|---|---|---|
| Scope | Plan de migration complet | **C** |
| Stratégie | Kit d'abord, puis modules, **sans commits** | **D** |
| Contrat API GraphQL | Liberté totale de breaking changes | **D** |
| Couche données | Repository supprimé, helpers micro-ciblés | **B'** |
| better-auth | Reste source de vérité runtime | **A** |
| Erreurs GraphQL | Typed errors via unions (`@pothos/plugin-errors`) | **B** |
| Ordre auth | Tout en bloc, pas de phases | **D** |
| Global ID | Défaut plugin-relay (`base64('Type:id')`) | **8.1=a** |
| SDL output | Émis dans `schema.graphqls` committé | **8.2=b** |
| Assembly | `apps/mazo/api/graphql.ts` appelle `initBuilder` + `buildSchema` ; modules appellent `registerSchema` | **8.3** |
| Testing services | Unit + intégration mixés | **8.4=c** |
| Double build | `buildSchema` throw si rappelé | **(a)** |
| Collision `registerSchema` | Imports par chemin (`@czo/kit/db` vs `@czo/kit/graphql`) | **C** |

---

## 3. Architecture

### 3.1 Structure de package cible

```
packages/kit/src/
├── db/
│   ├── manager.ts              # (inchangé) connection, transaction, useDatabase
│   ├── scope.ts                # ✨ NEW  notDeleted(), onlyDeleted()
│   ├── optimistic.ts           # ✨ NEW  optimisticUpdate(), OptimisticLockError
│   ├── errors.ts               # ✨ NEW  DatabaseError, toDatabaseError()
│   ├── repository.ts           # ❌ DELETED (935 → 0 LoC)
│   ├── relations.ts            # (inchangé) registerRelations, registeredRelations
│   ├── schema.ts               # (inchangé) registerSchema [DB], registeredSchema
│   └── seed.ts                 # (inchangé) registerSeeder
├── graphql/
│   ├── builder.ts              # ✨ NEW  initBuilder(), registerSchema() [GQL], buildSchema()
│   ├── plugins/
│   │   ├── auth-scope.ts       # ✨ NEW  config @pothos/plugin-scope-auth
│   │   └── drizzle-transform.ts # ✨ NEW  null-prototype normalization (ex-middleware drizzle)
│   ├── errors/
│   │   ├── index.ts            # ✨ NEW  ValidationError, NotFoundError, ConflictError, ForbiddenError, UnauthenticatedError
│   │   └── builders.ts         # ✨ NEW  registerErrorTypes(builder)
│   ├── scalars/
│   │   └── index.ts            # ✨ NEW  DateTime + scalaires partagés
│   ├── context/                # (inchangé) buildGraphQLContext + types
│   ├── sdl.ts                  # ✨ NEW  emitSDL(), verifySDL()
│   ├── middleware/             # ❌ DELETED (registerMiddleware + drizzle middleware)
│   ├── directive/              # ❌ DELETED (applyDirectives + directive typedefs)
│   ├── relay/                  # ❌ DELETED (fromGlobalId → plugin-relay)
│   ├── resolvers/              # ❌ DELETED (registerResolvers)
│   └── schema/                 # ❌ DELETED (registerTypeDefs)
├── testing/
│   └── fixtures.ts             # ✨ NEW  createTestDb(), truncate() — exporté via '@czo/kit/testing'
└── index.ts                    # re-exports (voir §3.3)
```

### 3.2 Builder factory

```ts
// packages/kit/src/graphql/builder.ts
import SchemaBuilder, { type SchemaBuilderOptions, type PothosPlugin } from '@pothos/core'
import DrizzlePlugin from '@pothos/plugin-drizzle'
import RelayPlugin from '@pothos/plugin-relay'
import ErrorsPlugin from '@pothos/plugin-errors'
import ScopeAuthPlugin from '@pothos/plugin-scope-auth'
import ValidationPlugin from '@pothos/plugin-zod'
import TracingPlugin, { isRootField } from '@pothos/plugin-tracing'
import type { GraphQLSchema } from 'graphql'
import { trace } from '@opentelemetry/api'
import { DateTimeResolver, JSONObjectResolver } from 'graphql-scalars'
import { registerErrorTypes } from './errors/builders'

export interface CZOBuilderOptions<DB, Relations> {
  db: DB
  relations: Relations
  extraPlugins?: Array<PothosPlugin>
  extraPluginOptions?: Partial<SchemaBuilderOptions<any>>
}

export type CZOBuilder<DB, Relations, Ctx> = SchemaBuilder<{
  Context: Ctx
  DrizzleRelations: Relations
  Scalars: {
    DateTime: { Input: Date; Output: Date }
    JSONObject: { Input: Record<string, unknown>; Output: Record<string, unknown> }
  }
  AuthScopes: { permission: { resource: string; actions: string[] } }
  DefaultFieldNullability: false
}>

const contributions: Array<(builder: CZOBuilder<any, any, any>) => void> = []
let built = false

export function initBuilder<DB, Relations, Ctx>(
  opts: CZOBuilderOptions<DB, Relations>,
): CZOBuilder<DB, Relations, Ctx> {
  const builder = new SchemaBuilder({
    plugins: [
      DrizzlePlugin,
      RelayPlugin,
      ErrorsPlugin,
      ScopeAuthPlugin,
      ValidationPlugin,
      TracingPlugin,
      ...(opts.extraPlugins ?? []),
    ],
    drizzle: { client: opts.db, relations: opts.relations },
    relay: { clientMutationId: 'omit', cursorType: 'String' },
    scopeAuth: {
      authScopes: async (ctx) => ({
        permission: async ({ resource, actions }) =>
          ctx.auth?.authService?.hasPermission?.({ resource, actions }) ?? false,
      }),
    },
    tracing: {
      default: (config) => isRootField(config),
      wrap: (resolver, _options, fieldConfig) => async (...args) => {
        const tracer = trace.getTracer('graphql')
        return tracer.startActiveSpan(
          `graphql.${fieldConfig.parentType}.${fieldConfig.name}`,
          async (span) => {
            try { return await resolver(...args) }
            catch (err) {
              span.recordException(err as Error)
              throw err
            }
            finally { span.end() }
          },
        )
      },
    },
    ...opts.extraPluginOptions,
  }) as CZOBuilder<DB, Relations, Ctx>

  builder.addScalarType('DateTime', DateTimeResolver)
  builder.addScalarType('JSONObject', JSONObjectResolver)
  builder.queryType({})
  builder.mutationType({})
  registerErrorTypes(builder)

  return builder
}

export function registerSchema<DB, Relations, Ctx>(
  contribute: (builder: CZOBuilder<DB, Relations, Ctx>) => void,
): void {
  contributions.push(contribute as any)
}

export function buildSchema(builder: CZOBuilder<any, any, any>): GraphQLSchema {
  if (built) throw new Error('buildSchema() called twice — schema already assembled')
  for (const contribute of contributions) contribute(builder)
  built = true
  return builder.toSchema()
}
```

### 3.3 Plugins Pothos enregistrés dans `createBuilder()`

| Plugin | Rôle | Usage |
|---|---|---|
| `@pothos/plugin-drizzle` | Auto-select colonnes, auto-batch relations, `builder.drizzleNode()`, `builder.drizzleConnection()` | Cœur — résoud N+1 |
| `@pothos/plugin-relay` | Node interface, globalID, Connection helpers | Remplace `fromGlobalId` |
| `@pothos/plugin-errors` | Errors typés en unions via `errors.types` | Décision 6=B |
| `@pothos/plugin-scope-auth` | `authScopes: { permission: { … } }` déclaratif | Remplace `userExists` middleware |
| `@pothos/plugin-zod` | `validate: { schema: z.object(...) }` sur inputs | Remplace middleware de validation |
| `@pothos/plugin-tracing` | Wrap chaque resolver dans un span OpenTelemetry | Bridge entre la stack `kit/telemetry` existante et les resolvers GraphQL — trace end-to-end HTTP → resolver → DB |

**Extension possible via `extraPlugins`** : mazo peut ajouter des plugins app-level (complexity, caching, logging) sans modifier kit. Les plugins custom ne sont **pas** visibles dans le type `CZOBuilder` (limitation voulue).

### 3.4 Flow runtime (lifecycle c-zo)

```
[server start]
  │
  ├─ kit plugin (packages/kit/src/plugins/index.ts) fires:
  │   │
  │   ├─ czo:init       → modules register DB schema, relations, seeders
  │   ├─ czo:register   → modules register access domains, actor types
  │   └─ czo:boot       → modules create services + call registerSchema((b) => register<Module>Schema(b))
  │
[server ready]
  │
[first HTTP request on /api/graphql]
  │
  └─ apps/mazo/api/graphql.ts imported (lazy Nitro route)
      │
      ├─ const db = await useDatabase()
      ├─ const builder = initBuilder({ db, relations: registeredRelations(), extraPlugins: [...] })
      ├─ const schema = buildSchema(builder)   // itère contributions, appelle builder.toSchema()
      └─ createYoga({ schema, ... })
```

**Contrat implicite** : `registerSchema(fn)` doit être appelé pendant `czo:boot` ou plus tôt. Appel ultérieur = contribution ignorée.

### 3.5 Nouveau `apps/mazo/api/graphql.ts` (exemple, hors scope kit mais documenté ici)

```ts
import { NoSchemaIntrospectionCustomRule } from 'graphql'
import { createYoga } from 'graphql-yoga'
import { fromNodeHandler } from 'nitro/h3'
import { initBuilder, buildSchema, buildGraphQLContext } from '@czo/kit/graphql'
import { useDatabase, registeredRelations } from '@czo/kit/db'

const isDev = process.env.NODE_ENV !== 'production'

const db = await useDatabase()
const builder = initBuilder({ db, relations: registeredRelations() })
const schema = buildSchema(builder)

const yoga = createYoga({
  schema,
  ...(!isDev && {
    validationRules: [NoSchemaIntrospectionCustomRule],
  }),
  context: initialContext =>
    buildGraphQLContext(initialContext as unknown as Record<string, unknown>, (initial) => initial.request as Request),
})

export default fromNodeHandler(yoga)
```

---

## 4. Helpers DB (refactor B')

Remplacent `Repository<Table, Relations>` (935 LoC → ~130 LoC répartis sur 3 fichiers).

### 4.1 `packages/kit/src/db/errors.ts`

```ts
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message)
    this.name = 'DatabaseError'
  }
}

export class OptimisticLockError extends Error {
  constructor(
    public readonly entityId: number | string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number | null,
  ) {
    super(
      `Optimistic lock failed: entity ${entityId} expected version ${expectedVersion}, `
      + `but found ${actualVersion === null ? 'deleted record' : `version ${actualVersion}`}`,
    )
    this.name = 'OptimisticLockError'
  }
}

export function toDatabaseError(err: unknown): DatabaseError {
  if (err instanceof DatabaseError) return err
  if (err instanceof Error && 'code' in err) {
    const pgCode = (err as any).code
    if (pgCode === '23505') {
      const detail = (err as any).detail as string | undefined
      const match = detail?.match(/Key \((\w+)\)=/)
      const field = match?.[1]
      return new DatabaseError('Unique constraint violated', field ? { [field]: ['must be unique'] } : undefined)
    }
    if (pgCode === '23503') {
      return new DatabaseError('Foreign key constraint violated')
    }
  }
  throw err
}
```

### 4.2 `packages/kit/src/db/scope.ts`

Deux styles de helpers, couvrant respectivement le query builder Drizzle (v1) et les Relational Queries v2 (RQBv2) — plugin-drizzle consomme la v2.

```ts
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import { and, isNull, isNotNull, type SQL, type SQLWrapper } from 'drizzle-orm'

type TableWithDeletedAt = PgTable & { deletedAt: AnyPgColumn }

// ── Style v1 (query builder : db.select/update/delete) ──
// Utilisé dans les services pour checks ad-hoc et writes.

export function notDeleted<T extends TableWithDeletedAt>(
  table: T,
  extraWhere?: SQL | SQLWrapper,
): SQL {
  const deletedFilter = isNull(table.deletedAt)
  return extraWhere ? and(deletedFilter, extraWhere)! : deletedFilter
}

export function onlyDeleted<T extends TableWithDeletedAt>(table: T): SQL {
  return isNotNull(table.deletedAt)
}

// ── Style v2 (RQBv2 : db.query.*.findMany/findFirst) ──
// Utilisé par les resolvers plugin-drizzle et par les reads avec relations.

export const notDeletedFilter = {
  deletedAt: { isNull: true },
} as const

/** Merge un filter RQBv2 avec la condition not-deleted. */
export function withNotDeleted<T extends Record<string, unknown>>(
  filter?: T,
): T & typeof notDeletedFilter {
  return { ...(filter ?? ({} as T)), ...notDeletedFilter }
}
```

**Règle pratique** :

- Services (checks d'existence, writes transactionnels) → `db.select/update/delete` + `notDeleted()` SQL
- Reads avec relations → `db.query.*` + `withNotDeleted()` / `notDeletedFilter`
- Resolvers Pothos (`drizzleField`, `drizzleConnection`) → **toujours** `db.query.*` + filter object (contrat plugin-drizzle)

### 4.3 `packages/kit/src/db/optimistic.ts`

```ts
import type { PgTable } from 'drizzle-orm/pg-core'
import { and, eq, sql, type InferInsertModel, type InferSelectModel } from 'drizzle-orm'
import type { Database } from './manager'
import { OptimisticLockError } from './errors'

type TableWithVersion = PgTable & {
  id: any
  version: any
  updatedAt: any
}

interface OptimisticUpdateParams<T extends TableWithVersion> {
  db: Database
  table: T
  id: number | string
  expectedVersion: number
  values: Partial<InferInsertModel<T>>
}

export async function optimisticUpdate<T extends TableWithVersion>(
  { db, table, id, expectedVersion, values }: OptimisticUpdateParams<T>,
): Promise<InferSelectModel<T>> {
  const updated = await db
    .update(table)
    .set({
      ...values,
      version: sql`${table.version} + 1`,
      updatedAt: sql`NOW()`,
    } as any)
    .where(and(eq(table.id, id), eq(table.version, expectedVersion)))
    .returning()

  if (updated.length === 0) {
    const [current] = await db
      .select({ version: table.version })
      .from(table)
      .where(eq(table.id, id))
      .limit(1)

    throw new OptimisticLockError(id, expectedVersion, current?.version ?? null)
  }

  return updated[0] as InferSelectModel<T>
}
```

### 4.4 Philosophie

- Chaque helper fait **une chose**
- Zéro génériques ésotériques — types Drizzle natifs
- Composables avec plugin-drizzle (`notDeleted(users)` passe direct dans `query({ where: ... })`)
- Pas de flag `includeDeleted: boolean` — explicite via "ne pas appeler `notDeleted`" pour admin views
- Pas d'helper `softDelete(table, id)` ni `restore` — un `UPDATE ... SET deleted_at = NOW()` direct suffit

---

## 5. Classes d'erreur GraphQL

### 5.1 Hiérarchie

```
Error (standard)
└─ BaseGraphQLError (abstract)
   ├─ ValidationError
   ├─ NotFoundError
   ├─ ConflictError
   ├─ ForbiddenError
   └─ UnauthenticatedError
```

`DatabaseError` et `OptimisticLockError` ne sont **pas** dans cette hiérarchie — elles remontent comme `GraphQLError` top-level, pas comme variants de payload.

### 5.2 `packages/kit/src/graphql/errors/index.ts`

```ts
import type { z } from 'zod'

export interface FieldError {
  path: string
  message: string
  code: string
}

export abstract class BaseGraphQLError extends Error {
  abstract readonly code: string
}

export class ValidationError extends BaseGraphQLError {
  readonly code = 'VALIDATION_ERROR'
  constructor(public readonly fields: FieldError[], message = 'Validation failed') {
    super(message)
    this.name = 'ValidationError'
  }

  static fromZod(err: z.ZodError): ValidationError {
    return new ValidationError(
      err.issues.map(i => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    )
  }
}

export class NotFoundError extends BaseGraphQLError {
  readonly code = 'NOT_FOUND'
  constructor(public readonly resource: string, public readonly id: string | number) {
    super(`${resource} '${id}' not found`)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends BaseGraphQLError {
  readonly code = 'CONFLICT'
  constructor(
    public readonly resource: string,
    public readonly conflictField: string,
    message?: string,
  ) {
    super(message ?? `${resource} conflict on ${conflictField}`)
    this.name = 'ConflictError'
  }
}

export class ForbiddenError extends BaseGraphQLError {
  readonly code = 'FORBIDDEN'
  constructor(public readonly requiredPermission: string) {
    super(`Missing permission: ${requiredPermission}`)
    this.name = 'ForbiddenError'
  }
}

export class UnauthenticatedError extends BaseGraphQLError {
  readonly code = 'UNAUTHENTICATED'
  constructor(message = 'Authentication required') {
    super(message)
    this.name = 'UnauthenticatedError'
  }
}
```

### 5.3 `packages/kit/src/graphql/errors/builders.ts`

```ts
import type { CZOBuilder } from '../builder'
import {
  BaseGraphQLError, ValidationError, NotFoundError, ConflictError,
  ForbiddenError, UnauthenticatedError, type FieldError,
} from './index'

export function registerErrorTypes(builder: CZOBuilder<any, any, any>) {
  const ErrorInterface = builder.interfaceRef<BaseGraphQLError>('Error').implement({
    fields: (t) => ({
      message: t.exposeString('message'),
      code: t.string({ resolve: (e) => e.code }),
    }),
  })

  const FieldErrorObject = builder.objectRef<FieldError>('FieldError').implement({
    fields: (t) => ({
      path: t.exposeString('path'),
      message: t.exposeString('message'),
      code: t.exposeString('code'),
    }),
  })

  builder.objectType(ValidationError, {
    name: 'ValidationError',
    interfaces: [ErrorInterface],
    fields: (t) => ({
      fields: t.field({ type: [FieldErrorObject], resolve: (e) => e.fields }),
    }),
  })

  builder.objectType(NotFoundError, {
    name: 'NotFoundError',
    interfaces: [ErrorInterface],
    fields: (t) => ({
      resource: t.exposeString('resource'),
      id: t.id({ resolve: (e) => String(e.id) }),
    }),
  })

  builder.objectType(ConflictError, {
    name: 'ConflictError',
    interfaces: [ErrorInterface],
    fields: (t) => ({
      resource: t.exposeString('resource'),
      conflictField: t.exposeString('conflictField'),
    }),
  })

  builder.objectType(ForbiddenError, {
    name: 'ForbiddenError',
    interfaces: [ErrorInterface],
    fields: (t) => ({
      requiredPermission: t.exposeString('requiredPermission'),
    }),
  })

  builder.objectType(UnauthenticatedError, {
    name: 'UnauthenticatedError',
    interfaces: [ErrorInterface],
    fields: (t) => ({}),
  })
}
```

Appelé automatiquement par `initBuilder()` — les modules n'ont rien à faire.

### 5.4 Schema GraphQL généré (extrait)

```graphql
interface Error {
  message: String!
  code: String!
}

type ValidationError implements Error {
  message: String!
  code: String!
  fields: [FieldError!]!
}

type FieldError {
  path: String!
  message: String!
  code: String!
}

type NotFoundError implements Error { message: String!  code: String!  resource: String!  id: ID! }
type ConflictError implements Error { message: String!  code: String!  resource: String!  conflictField: String! }
type ForbiddenError implements Error { message: String!  code: String!  requiredPermission: String! }
type UnauthenticatedError implements Error { message: String!  code: String! }
```

### 5.5 Usage côté module (exemple)

```ts
builder.mutationField('createUser', (t) =>
  t.field({
    type: 'User',
    errors: { types: [ValidationError, ConflictError, ForbiddenError] },
    args: { input: t.arg({ type: CreateUserInput, required: true }) },
    authScopes: { permission: { resource: 'user', actions: ['create'] } },
    resolve: async (_r, { input }, ctx) => {
      const parsed = createUserSchema.safeParse(input)
      if (!parsed.success) throw ValidationError.fromZod(parsed.error)
      if (await ctx.auth.userService.exists({ email: parsed.data.email })) {
        throw new ConflictError('User', 'email', `Email '${parsed.data.email}' already in use`)
      }
      return ctx.auth.userService.create(parsed.data)
    },
  }),
)
```

Schema généré pour cette mutation :
```graphql
union CreateUserResult = User | ValidationError | ConflictError | ForbiddenError
type Mutation { createUser(input: CreateUserInput!): CreateUserResult! }
```

---

## 6. Émission du SDL (`schema.graphqls`)

### 6.1 Stratégie

- **Un seul** fichier SDL "master" : `apps/mazo/schema.graphqls`
- Pas de SDL par module (les refs cross-modules rendent un SDL partiel incomplet)
- Script standalone → kit fournit juste l'helper `emitSDL` / `verifySDL`
- CI vérifie la sync via `pnpm verify-sdl`

### 6.2 `packages/kit/src/graphql/sdl.ts`

```ts
import { printSchema, lexicographicSortSchema, type GraphQLSchema } from 'graphql'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'

export interface EmitSDLOptions {
  schema: GraphQLSchema
  outputPath: string
  sort?: boolean
  header?: string
}

const DEFAULT_HEADER = '# AUTO-GENERATED — do not edit. Run `pnpm generate-sdl` to regenerate.\n\n'

export function emitSDL({ schema, outputPath, sort = true, header }: EmitSDLOptions): void {
  const finalSchema = sort ? lexicographicSortSchema(schema) : schema
  writeFileSync(outputPath, (header ?? DEFAULT_HEADER) + printSchema(finalSchema) + '\n')
}

export function verifySDL({ schema, outputPath, sort = true, header }: EmitSDLOptions): boolean {
  if (!existsSync(outputPath)) return false
  const finalSchema = sort ? lexicographicSortSchema(schema) : schema
  const expected = (header ?? DEFAULT_HEADER) + printSchema(finalSchema) + '\n'
  return readFileSync(outputPath, 'utf-8') === expected
}
```

### 6.3 Script `apps/mazo/scripts/generate-sdl.ts` (hors scope kit, documenté ici)

```ts
import { initBuilder, registerSchema, buildSchema, emitSDL } from '@czo/kit/graphql'
import { registerAuthSchema } from '@czo/auth/graphql'
import { registerStockLocationSchema } from '@czo/stock-location/graphql'
import * as authSchema from '@czo/auth/schema'
import * as stockLocationSchema from '@czo/stock-location/schema'
import { authRelations } from '@czo/auth/relations'
import { stockLocationRelations } from '@czo/stock-location/relations'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { resolve } from 'node:path'

const db = drizzle(new Pool({ connectionString: 'postgres://localhost:0/unused' }), {
  schema: { ...authSchema, ...stockLocationSchema },
})

registerSchema(registerAuthSchema)
registerSchema(registerStockLocationSchema)

const builder = initBuilder({
  db,
  relations: { ...authRelations, ...stockLocationRelations },
})
const schema = buildSchema(builder)

emitSDL({ schema, outputPath: resolve(__dirname, '../schema.graphqls') })
console.log('✓ schema.graphqls written')
```

### 6.4 Intégration CI

`apps/mazo/package.json` :
```json
{
  "scripts": {
    "generate-sdl": "tsx scripts/generate-sdl.ts",
    "verify-sdl": "tsx scripts/verify-sdl.ts"
  }
}
```

Workspace root :
```json
{
  "scripts": {
    "generate-sdl": "pnpm --filter mazo generate-sdl",
    "verify-sdl": "pnpm --filter mazo verify-sdl"
  }
}
```

**CI workflow** : `pnpm verify-sdl` doit être exécuté dans le job lint/test. Échec si mismatch.

### 6.5 Pourquoi `lexicographicSortSchema`

`printSchema` par défaut trie selon l'ordre de construction Pothos — qui varie avec l'ordre de `registerSchema`. `lexicographicSortSchema` trie alphabétiquement → diffs git reflètent uniquement les vraies modifications sémantiques.

---

## 7. Stratégie de tests

### 7.1 Matrice

| Module | Type | DB requise | Fichier |
|---|---|---|---|
| `db/errors.ts` | Unit | ❌ | `db/errors.test.ts` |
| `db/scope.ts` | Unit (SQL generation via `.toSQL()`) | ❌ | `db/scope.test.ts` |
| `db/optimistic.ts` | **Intégration** | ✅ | `db/optimistic.test.ts` |
| `graphql/errors/index.ts` | Unit | ❌ | `graphql/errors/index.test.ts` |
| `graphql/builder.ts` | Unit (stub db) | ❌ | `graphql/builder.test.ts` |
| `graphql/sdl.ts` | Unit | ❌ | `graphql/sdl.test.ts` |

**Ratio** : ~85% unit, ~15% intégration.

### 7.2 Helpers partagés — `packages/kit/src/testing/fixtures.ts`

```ts
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { sql } from 'drizzle-orm'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  ?? 'postgresql://postgres:postgres@localhost:5432/czo_test'

let cachedDb: NodePgDatabase | null = null

export function createTestDb() {
  if (cachedDb) return cachedDb
  const pool = new Pool({ connectionString: TEST_DATABASE_URL })
  cachedDb = drizzle(pool)
  return cachedDb
}

export async function truncate<T extends { [k: string]: any }>(db: NodePgDatabase, ...tables: T[]) {
  for (const table of tables) {
    await db.execute(sql`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
  }
}
```

Exporté via `@czo/kit/testing`. Utilisé par `auth` et `stock-location` dans leurs propres tests d'intégration.

### 7.3 Vitest config

Single config, pas de séparation unit/integration :

```ts
// packages/kit/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 10_000,
    pool: 'forks',
    env: {
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL
        ?? 'postgresql://postgres:postgres@localhost:5432/czo_test',
    },
  },
})
```

### 7.4 Migrations pour tests

Pas de migrations dédiées — kit ne possède pas de schéma métier. Tables ad-hoc créées dans `beforeAll` par test (ex. `things` pour `optimistic.test.ts`).

### 7.5 Exclusions

- Pas de coverage ≥80% imposé sur kit (re-exports, index.ts trivial)
- Pas de tests e2e dans kit
- Pas de tests des plugins Pothos eux-mêmes

---

## 8. Delta API publique

### 8.1 `@czo/kit/graphql`

| Avant | Après | Statut |
|---|---|---|
| `registerTypeDefs(typeDef)` | — | ❌ supprimé |
| `registeredTypeDefs()` | — | ❌ supprimé |
| `registerResolvers(resolvers)` | — | ❌ supprimé |
| `registeredResolvers()` | — | ❌ supprimé |
| `registerDirective(...)` | — | ❌ supprimé |
| `registeredDirectiveTypeDefs()` | — | ❌ supprimé |
| `applyDirectives(schema)` | — | ❌ supprimé |
| `registerMiddleware(middleware)` | — | ❌ supprimé |
| `registeredMiddlewares()` | — | ❌ supprimé |
| `fromGlobalId(id)` | `builder.globalID.toId(id)` | ♻️ via plugin-relay |
| `toGlobalId(type, id)` | `encodeGlobalID(type, id)` | ♻️ via plugin-relay |
| `registerNodeResolver(type, fn)` | `builder.drizzleNode('table', ...)` | ♻️ via plugin-drizzle |
| `withPaylaod(...)` | `throw new ValidationError(...)` + `errors.types` | ♻️ via plugin-errors |
| `buildGraphQLContext(...)` | `buildGraphQLContext(...)` | ✅ inchangé |
| `registerContext(factory)` | `registerContext(factory)` | ✅ inchangé |
| — | `initBuilder(opts): CZOBuilder` | ✨ nouveau |
| — | `registerSchema(fn)` | ✨ nouveau |
| — | `buildSchema(builder): GraphQLSchema` | ✨ nouveau |
| — | `emitSDL({ schema, outputPath })` | ✨ nouveau |
| — | `verifySDL({ schema, outputPath })` | ✨ nouveau |
| — | `CZOBuilder<DB, Rel, Ctx>` (type) | ✨ nouveau |
| — | `ValidationError`, `NotFoundError`, `ConflictError`, `ForbiddenError`, `UnauthenticatedError` | ✨ nouveau |
| — | `BaseGraphQLError` (abstract) | ✨ nouveau |
| — | `FieldError` (type) | ✨ nouveau |

### 8.2 `@czo/kit/db`

| Avant | Après | Statut |
|---|---|---|
| `Repository<Table, Relations>` | — | ❌ supprimé (935 LoC) |
| `createRepository(...)` | — | ❌ supprimé |
| `ServiceOf<Repo, ...>` | — | ❌ supprimé |
| `DatabaseError` | `DatabaseError` | ✅ déplacé vers `db/errors.ts` |
| `OptimisticLockError` | `OptimisticLockError` | ✅ déplacé vers `db/errors.ts` |
| `useDatabase()` | `useDatabase()` | ✅ inchangé |
| `registerSchema(schema)` | `registerSchema(schema)` | ✅ inchangé (DB — différent de `@czo/kit/graphql`) |
| `registeredSchema()` | `registeredSchema()` | ✅ inchangé |
| `registerRelations(rel)` | `registerRelations(rel)` | ✅ inchangé |
| `registeredRelations()` | `registeredRelations()` | ✅ inchangé |
| `registerSeeder(name, opts)` | `registerSeeder(name, opts)` | ✅ inchangé |
| — | `notDeleted(table, extraWhere?)` (style v1 — SQL) | ✨ nouveau |
| — | `onlyDeleted(table)` (style v1 — SQL) | ✨ nouveau |
| — | `notDeletedFilter` (style v2 — filter object) | ✨ nouveau |
| — | `withNotDeleted(filter?)` (style v2 — compose filter object) | ✨ nouveau |
| — | `optimisticUpdate({ db, table, id, expectedVersion, values })` | ✨ nouveau |
| — | `toDatabaseError(err)` | ✨ nouveau |

### 8.3 Collision `registerSchema`

Intentionnellement conservée. Les deux `registerSchema` coexistent et les consommateurs distinguent par chemin d'import :

```ts
import { registerSchema as registerDbSchema } from '@czo/kit/db'        // Drizzle schema
import { registerSchema as registerGqlSchema } from '@czo/kit/graphql'  // Pothos contribution
```

Cohérent avec le pattern existant du codebase (`@czo/kit/db`, `@czo/kit/graphql`, `@czo/kit/ioc`).

### 8.4 `@czo/kit/testing` (nouveau sous-chemin)

```ts
export { createTestDb, truncate } from './fixtures'
```

Exporté via `packages/kit/package.json` `exports` map. **Non inclus** dans le build de prod.

---

## 9. Dépendances

### 9.1 Ajouter à `packages/kit/package.json`

```json
{
  "dependencies": {
    "@pothos/core": "catalog:",
    "@pothos/plugin-drizzle": "catalog:",
    "@pothos/plugin-relay": "catalog:",
    "@pothos/plugin-errors": "catalog:",
    "@pothos/plugin-scope-auth": "catalog:",
    "@pothos/plugin-zod": "catalog:",
    "@pothos/plugin-tracing": "catalog:",
    "graphql-scalars": "catalog:"
  }
}
```

> **Note** : `@opentelemetry/api` est déjà une dépendance de kit (utilisé par `telemetry/sdk.ts`, `db/instrumentation.ts`) — réutilisé pour le wrap tracing.

### 9.2 Retirer de `packages/kit/package.json`

```
@graphql-tools/merge
@graphql-tools/schema
graphql-middleware
@envelop/graphql-middleware
```

### 9.3 Mettre à jour `pnpm-workspace.yaml` catalogs

Ajouter versions Pothos dans la section `catalogs`. Les modules qui voudraient utiliser Pothos directement passent par le catalog.

### 9.4 `apps/mazo/package.json`

Mêmes suppressions. Kit ré-exporte tout ce qui est nécessaire. Ajouter `pg` (déjà là probablement pour Drizzle).

---

## 10. Risques & rollback

### 10.1 Risques techniques

| Risque | Probabilité | Mitigation |
|---|---|---|
| `plugin-drizzle` immature — bug sur relations complexes | Moyenne | POC `stock-location` avant `auth` ; fallback sur `t.field` manuel |
| `plugin-zod` ne gère pas les `transform` (trim, lowercase) | Faible | Tester dans `builder.test.ts` |
| `lexicographicSortSchema` change la sortie → gros diff initial | Certaine | Accepter le diff one-shot dans la première PR |
| Breaking change API services casse consommateurs non-GraphQL (CLI, jobs) | Moyenne | Inventorier usages hors-GraphQL dans spec `auth` |
| Top-level `await useDatabase()` dans `api/graphql.ts` | Faible | Valider TLA en ESM avec Nitro dans le POC |

### 10.2 Rollback

Rollback progressif **impossible** (stratégie "sans commits" + suppression de `Repository<T>`). En cas d'échec en production :

1. **Revert git** sur la branche de migration
2. **Aucune migration DB** — la migration Pothos ne touche pas le schéma DB
3. **Recompilation** — `pnpm build` remet l'ancien code

Risque uniquement code, pas données.

---

## 11. Points de vigilance pour les specs aval

À finaliser/documenter dans les specs `auth` et `stock-location` :

- [ ] Inventaire des appels hors-GraphQL aux services (CLI, jobs, webhook listener) — doivent être compatibles avec la nouvelle API services
- [ ] Mapping sous-module → fichiers Pothos (ex. `schema/user/{types,queries,mutations,inputs}.ts`)
- [ ] Stratégie de tests services avec Drizzle direct (pas de mock Repository)
- [ ] Pattern d'usage de `notDeleted()` dans les resolvers de connection
- [ ] Classes d'erreur domain-specific (ex. `CannotBanSelfError` dans `auth`) — héritent de `BaseGraphQLError`

---

## 12. Hors scope (explicitement)

- Migration des modules `auth` et `stock-location` — specs séparés
- Modifications du schéma DB — aucune prévue
- Refactor de `better-auth` integration — reste source de vérité runtime (décision A)
- Performance tuning (DataLoader ajustements, complexity limits) — post-migration
- Frontend `apps/paiya` — pas de consommateur strict (décision D)

---

## 13. Checklist de livraison kit

### 13.1 Convention `old/` — safety net

Tous les fichiers à **supprimer** ou **modifier** sont d'abord copiés/déplacés dans `packages/kit/old/<path>` (miroir de la structure originelle). Le dossier `old/` est supprimé en **dernière étape** de l'implémentation, une fois que tests + types + lint passent.

**Pattern** :

- Suppression : `git mv packages/kit/src/db/repository.ts packages/kit/old/db/repository.ts` puis tuer les imports
- Modification : `cp packages/kit/src/db/manager.ts packages/kit/old/db/manager.ts` avant d'éditer

### 13.2 Pre-refactor — préservation `old/`

- [ ] `mkdir -p packages/kit/old/{db,graphql/{middleware,directive,relay,resolvers,schema}}`
- [ ] Copier les fichiers à **modifier** vers `old/` (version pré-édition) :
  - `packages/kit/src/db/manager.ts` → `packages/kit/old/db/manager.ts`
  - `packages/kit/src/db/relations.ts` → `packages/kit/old/db/relations.ts`
  - `packages/kit/src/db/schema.ts` → `packages/kit/old/db/schema.ts`
  - `packages/kit/src/db/seed.ts` → `packages/kit/old/db/seed.ts`
  - `packages/kit/src/graphql/context/*` → `packages/kit/old/graphql/context/*`
  - `packages/kit/src/index.ts` → `packages/kit/old/index.ts`
  - `packages/kit/package.json` → `packages/kit/old/package.json`
- [ ] Déplacer les fichiers à **supprimer** vers `old/` :
  - `packages/kit/src/db/repository.ts` → `packages/kit/old/db/repository.ts`
  - `packages/kit/src/graphql/middleware/*` → `packages/kit/old/graphql/middleware/*`
  - `packages/kit/src/graphql/directive/*` → `packages/kit/old/graphql/directive/*`
  - `packages/kit/src/graphql/relay/*` → `packages/kit/old/graphql/relay/*`
  - `packages/kit/src/graphql/resolvers/*` → `packages/kit/old/graphql/resolvers/*`
  - `packages/kit/src/graphql/schema/*` → `packages/kit/old/graphql/schema/*`

### 13.3 Implémentation

- [ ] Package.json deps ajoutées/supprimées
- [ ] `db/errors.ts`, `db/scope.ts`, `db/optimistic.ts` écrits + tests
- [ ] `graphql/builder.ts` + `graphql/errors/` + `graphql/scalars/` + `graphql/sdl.ts` écrits + tests
- [ ] `@czo/kit/testing` exporté avec `createTestDb` + `truncate`
- [ ] `pnpm build` passe
- [ ] `pnpm test` passe (unit + intégration)
- [ ] `pnpm check-types` passe
- [ ] `pnpm lint` passe

### 13.4 Post-refactor — cleanup `old/`

- [ ] **Dernière étape** : `rm -rf packages/kit/old`
- [ ] Vérifier que `pnpm build` et `pnpm test` passent toujours (détecte les imports résiduels vers `old/`)
- [ ] Commit séparé du cleanup pour faciliter la revue
