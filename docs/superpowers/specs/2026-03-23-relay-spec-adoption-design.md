# Relay Specification Adoption

**Date:** 2026-03-23
**Status:** Approved
**Scope:** Kit-first implementation, App module as pilot

## Overview

Adopt the full Relay GraphQL specification across the c-zo platform to provide a standardized, public-grade API. This covers Global Object Identification (Node interface), cursor-based Connection pagination, and structured mutation payloads with typed error codes.

The implementation is directive-driven: three custom directives (`@globalId`, `@connection`, `@relayMutation`) handle all Relay transformation logic, keeping resolvers focused on business logic.

## Decisions

| Topic | Decision | Rationale |
|---|---|---|
| Scope | Kit utilities first, then App module as pilot | Validate patterns before rolling out everywhere |
| Global IDs | `base64(Type:localId)` | Standard Relay convention, used by GitHub/Shopify/Saleor |
| Cursors | Encode sort position + ID tiebreaker | Supports dynamic ordering per entity (like Saleor) |
| Mutations | Payload wrapper + typed `userErrors`, no `clientMutationId` | `clientMutationId` deprecated by Shopify; `userErrors` with codes enables client i18n and branching |
| Mechanism | Schema directives via existing `registerDirective()` | Already in place for `@auth`, `@admin`, `@permission`; schema is source of truth |
| Ordering | Per-entity `XxxOrderByInput` defined by each module | Dynamic, type-safe; kit only provides `OrderDirection` |
| Module pilot | App | Recently refactored, intermediate complexity |

## Architecture

### Kit Layer (`packages/kit/src/graphql/relay/`)

#### Base GraphQL Types — `relay/relay-types.graphql`

```graphql
interface Node {
  id: ID!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

type UserError {
  field: [String!]
  message: String!
  code: String!
}

extend type Query {
  node(id: ID!): Node
}
```

A companion `relay-types.ts` calls `registerTypeDefs()` following the existing `filter-types.ts` pattern.

Each module defines its own `XxxConnection`, `XxxEdge`, `XxxOrderField`, and `XxxOrderByInput` in its schema files. The kit does not generate these.

#### Helpers

**`global-id.ts`**

- `toGlobalId(type: string, localId: string): string` — returns `base64("Type:localId")`
- `fromGlobalId(globalId: string): { type: string, id: string }` — decodes, throws on invalid format

**`cursor.ts`**

- `encodeCursor(values: Record<string, unknown>): string` — encodes `base64(JSON.stringify({ sortField: value, id: value }))`
- `decodeCursor(cursor: string): Record<string, unknown>` — decodes, throws on invalid format
- Cursor always encodes the active sort column value + `id` as tiebreaker

**`connection.ts`**

- `buildConnection<T>(opts: { nodes: T[], args: ConnectionArgs, totalCount: number, getCursor: (node: T) => string }): Connection<T>`
- Builds `{ edges: [{ node, cursor }], pageInfo }` from raw nodes
- Handles `first`/`after` and `last`/`before` per Relay spec
- When only `last` is provided without `before`, returns the last N items from the result set

Exported types:

```typescript
interface ConnectionArgs {
  first?: number
  after?: string
  last?: number
  before?: string
}

interface PaginateResult<T> {
  nodes: T[]
  totalCount: number
}
```

**`node-registry.ts`**

- `createNodeRegistry()` — returns a registry instance
- `registry.register(type: string, resolver: (id: string, ctx: GraphQLContext) => Promise<unknown>)` — modules register their types
- `registry.resolve(globalId: string, ctx: GraphQLContext): Promise<unknown>` — decodes global ID, dispatches to the registered resolver, attaches `__typename`
- Registered as IoC singleton: `container.singleton('graphql:nodeRegistry', () => createNodeRegistry())`

**`errors.ts`**

- `toUserErrors(error: unknown): UserError[]` — converts known error types to structured user errors
- Conversion map:
  - `DatabaseError` (23505) → `UNIQUE_CONSTRAINT` with field-level messages
  - `ZodError` → `VALIDATION_ERROR` with field paths
  - `Error` with "not found" → `NOT_FOUND`
  - `Error` with "forbidden"/"permission" → `FORBIDDEN`
  - Other → `INTERNAL_ERROR`

#### Directives (`relay/directives/`)

All three directives use `mapSchema` from `@graphql-tools/utils` and register via the existing `registerDirective()` system.

**Directive registration order matters.** Auth directives (`@auth`, `@admin`, `@permission`) must be registered first, then Relay directives. This ensures the wrapping chain is: permission check → relay transformation → original resolver. The kit's directive import in the plugin must come after auth directive registration.

**`@globalId(type: "App")` — target: `FIELD_DEFINITION`**

- **Output:** After the field resolver runs, encodes `toGlobalId(type, result)` on the `id` field
- **Input decoding:** The `@globalId` directive only handles output encoding on the annotated field (`App.id`). Input decoding (converting a global ID arg to a local ID) is handled separately — see the `@connection` directive for list queries, and each single-item query resolver must explicitly call `fromGlobalId()` to decode incoming `id` arguments. The `node` query uses `nodeRegistry.resolve()` which handles decoding internally.
- Throws `BAD_USER_INPUT` if the decoded type does not match the expected type

**`@connection(maxPageSize: 100)` — target: `FIELD_DEFINITION`**

1. Extracts `first`, `after`, `last`, `before` from args
2. Validates Relay constraints: cannot mix `first`+`last`; `first`/`last` <= `maxPageSize` (default 100, configurable per field)
3. Passes args through to the original resolver — resolver must return `PaginateResult<T>` (`{ nodes, totalCount }`)
4. Calls `buildConnection()` to construct the `Connection` response

**`@relayMutation(payloadField: "app")` — target: `FIELD_DEFINITION`**

1. Calls the original resolver in a try/catch
2. **Success:** Resolver returns the business object, wrapper places it under the key specified by `payloadField` with `userErrors: []`
3. **Error:** Catches the exception, converts via `toUserErrors()`, returns `{ [payloadField]: null, userErrors: [...] }`
4. The `payloadField` argument is **required** — no inference. This avoids ambiguity for mutations like `installApp`, `setAppStatus`, etc.

### Directive Auto-Registration

The directives self-register when imported. The kit's plugin (or the app's `graphql.ts`) imports them:

```typescript
import '@czo/kit/graphql/relay/directives'
```

They are then applied during the existing `applyDirectives(schema)` call in `apps/mazo/api/graphql.ts`.

## Module Pilot: App

### Schema Changes — `packages/modules/auth/src/graphql/schema/app/schema.graphql`

```graphql
type App implements Node {
  id: ID! @globalId(type: "App")
  appId: String!
  manifest: JSON!
  status: String!
  installedBy: String!
  organizationId: String
  createdAt: DateTime!
  updatedAt: DateTime!
}

# ─── Connection types ─────────────────────────
type AppConnection {
  edges: [AppEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type AppEdge {
  node: App!
  cursor: String!
}

# ─── Ordering ─────────────────────────────────
enum AppOrderField {
  CREATED_AT
  APP_ID
  STATUS
}

input AppOrderByInput {
  field: AppOrderField!
  direction: OrderDirection!
}

# ─── Queries ──────────────────────────────────
extend type Query {
  """Fetch an app by its Relay global ID (primary key)."""
  app(id: ID!): App @permission(resource: "apps", action: "read")
  """Fetch an app by its manifest slug (e.g. "my-cool-app")."""
  appBySlug(appId: String!): App @permission(resource: "apps", action: "read")
  apps(
    first: Int
    after: String
    last: Int
    before: String
    orderBy: AppOrderByInput
  ): AppConnection! @permission(resource: "apps", action: "read") @connection(maxPageSize: 100)
}

# ─── Mutation payloads ────────────────────────
type InstallAppPayload {
  app: App
  userErrors: [UserError!]!
}

type UninstallAppPayload {
  app: App
  userErrors: [UserError!]!
}

type UpdateAppManifestPayload {
  app: App
  userErrors: [UserError!]!
}

type SetAppStatusPayload {
  app: App
  userErrors: [UserError!]!
}

extend type Mutation {
  installApp(input: InstallAppInput!): InstallAppPayload! @permission(resource: "apps", action: "install") @relayMutation(payloadField: "app")
  uninstallApp(appId: String!): UninstallAppPayload! @permission(resource: "apps", action: "uninstall") @relayMutation(payloadField: "app")
  updateAppManifest(input: UpdateAppManifestInput!): UpdateAppManifestPayload! @permission(resource: "apps", action: "update") @relayMutation(payloadField: "app")
  setAppStatus(input: SetAppStatusInput!): SetAppStatusPayload! @permission(resource: "apps", action: "update") @relayMutation(payloadField: "app")
}
```

Note: `OrderDirection` is already defined in the kit's `filter-types.graphql` and is available to all modules via `registerTypeDefs()`. Modules must not re-declare it.

### Service Changes — `app.service.ts`

**New method `getAppById`** for node resolution by primary key:

```typescript
async function getAppById(id: string): Promise<AppRow | null> {
  // Queries by primary key `id` column (UUID)
  return repo.findFirst({ where: { id } })
}
```

The existing `getApp(appId)` is preserved — it queries by `appId` (the manifest slug). Both methods are needed: `getAppById` for Relay node resolution, `getApp` for business logic lookups.

**`listApps` changes signature** to accept `ConnectionArgs` and entity-specific ordering:

```typescript
async function listApps(
  connectionArgs: ConnectionArgs,
  orderBy?: AppOrderByInput,
): Promise<PaginateResult<AppRow>>
```

Internally:
1. Decode cursor from `after`/`before` → `{ sortValue, id }`
2. Build keyset `WHERE` clause based on sort direction:
   - Forward (`first`/`after`) + ASC: `(sort_col, id) > (sortValue, cursorId)`
   - Forward (`first`/`after`) + DESC: `(sort_col, id) < (sortValue, cursorId)`
   - Backward (`last`/`before`) + ASC: `(sort_col, id) < (sortValue, cursorId)`
   - Backward (`last`/`before`) + DESC: `(sort_col, id) > (sortValue, cursorId)`
3. Apply existing filters (e.g., `status = 'active'`, organization scope) — these are additive to the keyset WHERE
4. Query with `LIMIT first + 1` to detect `hasNextPage`
5. `totalCount` is computed via a separate `COUNT(*)` query. This is acceptable for the App table (small cardinality). For high-cardinality tables in future modules, consider making `totalCount` nullable and only computed when selected (check `info.fieldNodes`).
6. Return `{ nodes, totalCount }`

### Plugin Changes — `plugins/index.ts`

Register `App` type in the node registry during `czo:boot`:

```typescript
const nodeRegistry = await container.make('graphql:nodeRegistry')
nodeRegistry.register('App', async (localId, ctx) => {
  return ctx.auth.appService.getAppById(localId)
})
```

### Resolver Changes

Resolvers remain thin. Directives handle Relay formatting. Single-item queries decode global IDs explicitly:

```typescript
// Query.app — decode global ID, look up by primary key
export const app = async (_parent, { id }, ctx) => {
  const { id: localId } = fromGlobalId(id)
  return ctx.auth.appService.getAppById(localId)
}

// Query.appBySlug — look up by manifest slug (preserves old app(appId:) behavior)
export const appBySlug = async (_parent, { appId }, ctx) => {
  return ctx.auth.appService.getApp(appId)
}

// Query.apps — @connection directive wraps the return
export const apps = async (_parent, args, ctx) => {
  return ctx.auth.appService.listApps(
    { first: args.first, after: args.after, last: args.last, before: args.before },
    args.orderBy,
  )
}

// Mutation.installApp — @relayMutation directive wraps the return
export const installApp = async (_parent, { input }, ctx) => {
  return ctx.auth.appService.install(input)
}
```

## Backward Compatibility

This is an internal API not yet exposed to external consumers. No deprecation period is required. Existing frontends (apps/paiya) will be updated to use the new schema in the same release cycle.

For future modules adopting Relay, the pattern is: update the schema, update the service, register in node registry. No breaking changes to the kit API.

## File Structure

### New files in kit

```
packages/kit/src/graphql/
└── relay/
    ├── index.ts                 # Re-export public API
    ├── relay-types.graphql      # Node, PageInfo, UserError, node query
    ├── relay-types.ts           # Calls registerTypeDefs() for relay-types.graphql
    ├── global-id.ts             # toGlobalId, fromGlobalId
    ├── cursor.ts                # encodeCursor, decodeCursor
    ├── connection.ts            # buildConnection, ConnectionArgs, PaginateResult
    ├── node-registry.ts         # createNodeRegistry
    ├── errors.ts                # toUserErrors, ErrorCode
    └── directives/
        ├── index.ts             # Registers all 3 directives
        ├── global-id.ts         # @globalId directive
        ├── connection.ts        # @connection directive
        └── relay-mutation.ts    # @relayMutation directive
```

### Modified files in App module

```
packages/modules/auth/src/
├── graphql/schema/app/
│   └── schema.graphql           # Node, Connection, Payload types
├── services/
│   └── app.service.ts           # getAppById + listApps with ConnectionArgs
└── plugins/
    └── index.ts                 # Registers App in nodeRegistry
```

## Exports

All relay utilities exported via `@czo/kit/graphql`:

- `toGlobalId`, `fromGlobalId`
- `encodeCursor`, `decodeCursor`
- `buildConnection`, `ConnectionArgs`, `PaginateResult`
- `createNodeRegistry`
- `toUserErrors`, `ErrorCode`

Directives self-register via `import '@czo/kit/graphql/relay/directives'`.

## Testing

### Kit unit tests

| File | Coverage |
|---|---|
| `global-id.test.ts` | Encode/decode roundtrip, invalid format throws, type mismatch |
| `cursor.test.ts` | Encode/decode with string/date/number values, corrupted cursor throws |
| `connection.test.ts` | `buildConnection` with first/after, last/before, last-only (no before), empty edges, pageInfo correctness, totalCount |
| `node-registry.test.ts` | Register/resolve, unknown type throws, typename attached |
| `errors.test.ts` | DatabaseError → UNIQUE_CONSTRAINT, ZodError → VALIDATION_ERROR, generic → INTERNAL_ERROR |

### Directive tests

| Directive | Coverage |
|---|---|
| `@globalId` | Output encoding, type mismatch error |
| `@connection` | PaginateResult → Connection, first > maxPageSize error, first + last error, last-only pagination |
| `@relayMutation` | Success → `{ app, userErrors: [] }`, DatabaseError → structured userErrors, ZodError → field errors |

### App module integration

- `app.service.test.ts` updated: new `getAppById` method, `listApps` accepts `ConnectionArgs` and returns `PaginateResult`, keyset pagination with ASC/DESC ordering
- Resolver tests verify end-to-end with directives applied

Coverage target: 80%+ on kit relay, aligned with project convention.
