# Relay Specification Adoption — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Relay spec compliance (Node interface, cursor-based connections, mutation payloads) to the GraphQL API via reusable kit utilities and schema directives, then validate on the App module.

**Architecture:** Three custom directives (`@globalId`, `@connection`, `@relayMutation`) registered via the existing `registerDirective()` system transform resolver output into Relay-compliant shapes. Helpers for global ID encoding, cursor pagination, connection building, and error conversion live in `packages/kit/src/graphql/relay/`. The App module is the pilot consumer.

**Tech Stack:** TypeScript, graphql-yoga, @graphql-tools/utils (mapSchema, getDirective), @graphql-tools/schema (devDep for tests), Drizzle ORM, vitest

**Pre-requisite:** Add `@graphql-tools/schema` as a devDependency to `packages/kit/package.json`:
```bash
cd packages/kit && pnpm add -D @graphql-tools/schema
```

**Spec:** `docs/superpowers/specs/2026-03-23-relay-spec-adoption-design.md`

---

## Task 1: Global ID helpers

**Files:**
- Create: `packages/kit/src/graphql/relay/global-id.ts`
- Create: `packages/kit/src/graphql/relay/global-id.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/kit/src/graphql/relay/global-id.test.ts
import { describe, expect, it } from 'vitest'
import { fromGlobalId, toGlobalId } from './global-id'

describe('toGlobalId', () => {
  it('should encode type and id as base64', () => {
    const result = toGlobalId('User', 'abc-123')
    expect(result).toBe(btoa('User:abc-123'))
  })

  it('should handle ids with special characters', () => {
    const result = toGlobalId('App', 'my:weird=id')
    const decoded = atob(result)
    expect(decoded).toBe('App:my:weird=id')
  })
})

describe('fromGlobalId', () => {
  it('should decode a valid global id', () => {
    const encoded = btoa('User:abc-123')
    expect(fromGlobalId(encoded)).toEqual({ type: 'User', id: 'abc-123' })
  })

  it('should throw on invalid base64', () => {
    expect(() => fromGlobalId('not-base64!!!')).toThrow()
  })

  it('should throw when no colon separator', () => {
    expect(() => fromGlobalId(btoa('InvalidNoColon'))).toThrow()
  })

  it('should throw on empty string', () => {
    expect(() => fromGlobalId('')).toThrow()
  })

  it('should handle ids containing colons', () => {
    const encoded = btoa('App:my:weird:id')
    // Type is everything before first colon, id is the rest
    expect(fromGlobalId(encoded)).toEqual({ type: 'App', id: 'my:weird:id' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/global-id.test.ts`
Expected: FAIL — module `./global-id` not found

- [ ] **Step 3: Implement global-id.ts**

```typescript
// packages/kit/src/graphql/relay/global-id.ts

export function toGlobalId(type: string, localId: string): string {
  return btoa(`${type}:${localId}`)
}

export function fromGlobalId(globalId: string): { type: string, id: string } {
  if (!globalId) {
    throw new Error('Invalid global ID: empty string')
  }

  let decoded: string
  try {
    decoded = atob(globalId)
  }
  catch {
    throw new Error(`Invalid global ID: not valid base64`)
  }

  const colonIndex = decoded.indexOf(':')
  if (colonIndex === -1) {
    throw new Error(`Invalid global ID: missing type separator`)
  }

  const type = decoded.slice(0, colonIndex)
  const id = decoded.slice(colonIndex + 1)

  if (!type || !id) {
    throw new Error(`Invalid global ID: empty type or id`)
  }

  return { type, id }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/global-id.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/graphql/relay/global-id.ts packages/kit/src/graphql/relay/global-id.test.ts
git commit -m "feat(kit): add Relay global ID encode/decode helpers"
```

---

## Task 2: Cursor helpers

**Files:**
- Create: `packages/kit/src/graphql/relay/cursor.ts`
- Create: `packages/kit/src/graphql/relay/cursor.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/kit/src/graphql/relay/cursor.test.ts
import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from './cursor'

describe('encodeCursor', () => {
  it('should encode values as base64 JSON', () => {
    const cursor = encodeCursor({ createdAt: '2026-01-01', id: 'abc' })
    const decoded = JSON.parse(atob(cursor))
    expect(decoded).toEqual({ createdAt: '2026-01-01', id: 'abc' })
  })
})

describe('decodeCursor', () => {
  it('should decode a valid cursor', () => {
    const cursor = btoa(JSON.stringify({ createdAt: '2026-01-01', id: 'abc' }))
    expect(decodeCursor(cursor)).toEqual({ createdAt: '2026-01-01', id: 'abc' })
  })

  it('should throw on invalid base64', () => {
    expect(() => decodeCursor('not-valid!!!')).toThrow()
  })

  it('should throw on non-JSON content', () => {
    expect(() => decodeCursor(btoa('not json'))).toThrow()
  })

  it('should throw on empty string', () => {
    expect(() => decodeCursor('')).toThrow()
  })

  it('should handle numeric values', () => {
    const cursor = btoa(JSON.stringify({ price: 19.99, id: 'x' }))
    expect(decodeCursor(cursor)).toEqual({ price: 19.99, id: 'x' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/cursor.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement cursor.ts**

```typescript
// packages/kit/src/graphql/relay/cursor.ts

export function encodeCursor(values: Record<string, unknown>): string {
  return btoa(JSON.stringify(values))
}

export function decodeCursor(cursor: string): Record<string, unknown> {
  if (!cursor) {
    throw new Error('Invalid cursor: empty string')
  }

  let json: string
  try {
    json = atob(cursor)
  }
  catch {
    throw new Error('Invalid cursor: not valid base64')
  }

  try {
    return JSON.parse(json) as Record<string, unknown>
  }
  catch {
    throw new Error('Invalid cursor: not valid JSON')
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/cursor.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/graphql/relay/cursor.ts packages/kit/src/graphql/relay/cursor.test.ts
git commit -m "feat(kit): add Relay cursor encode/decode helpers"
```

---

## Task 3: Connection builder

**Files:**
- Create: `packages/kit/src/graphql/relay/connection.ts`
- Create: `packages/kit/src/graphql/relay/connection.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/kit/src/graphql/relay/connection.test.ts
import { describe, expect, it } from 'vitest'
import { buildConnection } from './connection'
import type { ConnectionArgs } from './connection'

const items = [
  { id: '1', name: 'A' },
  { id: '2', name: 'B' },
  { id: '3', name: 'C' },
]

const getCursor = (node: { id: string }) => btoa(`id:${node.id}`)

describe('buildConnection', () => {
  it('should build edges with cursors', () => {
    const conn = buildConnection({ nodes: items, args: { first: 10 }, totalCount: 3, getCursor })

    expect(conn.edges).toHaveLength(3)
    expect(conn.edges[0]!.node).toEqual(items[0])
    expect(conn.edges[0]!.cursor).toBe(getCursor(items[0]!))
  })

  it('should set pageInfo.hasNextPage=false when all items returned', () => {
    const conn = buildConnection({ nodes: items, args: { first: 10 }, totalCount: 3, getCursor })
    expect(conn.pageInfo.hasNextPage).toBe(false)
    expect(conn.pageInfo.hasPreviousPage).toBe(false)
  })

  it('should set hasNextPage=true when nodes.length > first', () => {
    // Service fetches first+1, so 3 nodes with first=2 means there's a next page
    const conn = buildConnection({ nodes: items, args: { first: 2 }, totalCount: 10, getCursor })
    expect(conn.edges).toHaveLength(2) // trimmed to first
    expect(conn.pageInfo.hasNextPage).toBe(true)
  })

  it('should set hasPreviousPage=true when after cursor is provided', () => {
    const conn = buildConnection({ nodes: items, args: { first: 10, after: 'some-cursor' }, totalCount: 3, getCursor })
    expect(conn.pageInfo.hasPreviousPage).toBe(true)
  })

  it('should set startCursor and endCursor from first and last edges', () => {
    const conn = buildConnection({ nodes: items, args: { first: 10 }, totalCount: 3, getCursor })
    expect(conn.pageInfo.startCursor).toBe(getCursor(items[0]!))
    expect(conn.pageInfo.endCursor).toBe(getCursor(items[2]!))
  })

  it('should return null cursors and empty edges when no nodes', () => {
    const conn = buildConnection({ nodes: [], args: { first: 10 }, totalCount: 0, getCursor })
    expect(conn.edges).toEqual([])
    expect(conn.pageInfo.startCursor).toBeNull()
    expect(conn.pageInfo.endCursor).toBeNull()
    expect(conn.pageInfo.hasNextPage).toBe(false)
  })

  it('should handle last/before pagination', () => {
    const conn = buildConnection({ nodes: items, args: { last: 2, before: 'some-cursor' }, totalCount: 10, getCursor })
    expect(conn.edges).toHaveLength(2)
    expect(conn.pageInfo.hasNextPage).toBe(true) // there are items after before-cursor
  })

  it('should handle last-only (no before) — returns last N items', () => {
    const conn = buildConnection({ nodes: items.slice(-2), args: { last: 2 }, totalCount: 3, getCursor })
    expect(conn.edges).toHaveLength(2)
    expect(conn.pageInfo.hasPreviousPage).toBe(true) // totalCount > nodes
  })

  it('should pass totalCount through', () => {
    const conn = buildConnection({ nodes: items, args: { first: 10 }, totalCount: 42, getCursor })
    expect(conn.totalCount).toBe(42)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/connection.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement connection.ts**

```typescript
// packages/kit/src/graphql/relay/connection.ts

export interface ConnectionArgs {
  first?: number
  after?: string
  last?: number
  before?: string
}

export interface PaginateResult<T> {
  nodes: T[]
  totalCount: number
  getCursor?: (node: T) => string
}

export interface Edge<T> {
  node: T
  cursor: string
}

export interface PageInfo {
  hasNextPage: boolean
  hasPreviousPage: boolean
  startCursor: string | null
  endCursor: string | null
}

export interface Connection<T> {
  edges: Edge<T>[]
  pageInfo: PageInfo
  totalCount: number
}

export function buildConnection<T>(opts: {
  nodes: T[]
  args: ConnectionArgs
  totalCount: number
  getCursor: (node: T) => string
}): Connection<T> {
  const { nodes, args, totalCount, getCursor } = opts
  const { first, after, last, before } = args

  let trimmedNodes = nodes
  let hasNextPage = false
  let hasPreviousPage = false

  if (first != null) {
    // Service fetches first+1 to detect next page
    if (trimmedNodes.length > first) {
      trimmedNodes = trimmedNodes.slice(0, first)
      hasNextPage = true
    }
    if (after) {
      hasPreviousPage = true
    }
  }
  else if (last != null) {
    if (trimmedNodes.length > last) {
      trimmedNodes = trimmedNodes.slice(trimmedNodes.length - last)
      hasPreviousPage = true
    }
    if (before) {
      hasNextPage = true
    }
    // last-only (no before): there are previous items if totalCount > returned
    if (!before && totalCount > trimmedNodes.length) {
      hasPreviousPage = true
    }
  }

  const edges = trimmedNodes.map(node => ({
    node,
    cursor: getCursor(node),
  }))

  return {
    edges,
    pageInfo: {
      hasNextPage,
      hasPreviousPage,
      startCursor: edges.length > 0 ? edges[0]!.cursor : null,
      endCursor: edges.length > 0 ? edges[edges.length - 1]!.cursor : null,
    },
    totalCount,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/connection.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/graphql/relay/connection.ts packages/kit/src/graphql/relay/connection.test.ts
git commit -m "feat(kit): add Relay connection builder with ConnectionArgs and PaginateResult types"
```

---

## Task 4: Error conversion helper

**Files:**
- Create: `packages/kit/src/graphql/relay/errors.ts`
- Create: `packages/kit/src/graphql/relay/errors.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/kit/src/graphql/relay/errors.test.ts
import { describe, expect, it } from 'vitest'
import { ErrorCode, toUserErrors } from './errors'
import { DatabaseError } from '../../db/repository'
import { z } from 'zod'

describe('toUserErrors', () => {
  it('should convert DatabaseError with fieldErrors to UNIQUE_CONSTRAINT', () => {
    const err = new DatabaseError('duplicate', { email: ["email 'foo@bar.com' already exists"] })
    const errors = toUserErrors(err)

    expect(errors).toHaveLength(1)
    expect(errors[0]!.code).toBe(ErrorCode.UNIQUE_CONSTRAINT)
    expect(errors[0]!.field).toEqual(['email'])
    expect(errors[0]!.message).toContain('already exists')
  })

  it('should convert ZodError to VALIDATION_ERROR', () => {
    const schema = z.object({ name: z.string().min(1) })
    let zodErr: z.ZodError
    try { schema.parse({ name: '' }) } catch (e) { zodErr = e as z.ZodError }

    const errors = toUserErrors(zodErr!)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]!.code).toBe(ErrorCode.VALIDATION_ERROR)
    expect(errors[0]!.field).toContain('name')
  })

  it('should convert Error with "not found" to NOT_FOUND', () => {
    const errors = toUserErrors(new Error('App not found'))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.code).toBe(ErrorCode.NOT_FOUND)
  })

  it('should convert Error with "forbidden" to FORBIDDEN', () => {
    const errors = toUserErrors(new Error('forbidden: no access'))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.code).toBe(ErrorCode.FORBIDDEN)
  })

  it('should convert Error with "permission" to FORBIDDEN', () => {
    const errors = toUserErrors(new Error('does not have the required permissions'))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.code).toBe(ErrorCode.FORBIDDEN)
  })

  it('should convert unknown errors to INTERNAL_ERROR', () => {
    const errors = toUserErrors(new Error('something weird'))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.code).toBe(ErrorCode.INTERNAL_ERROR)
  })

  it('should handle non-Error objects', () => {
    const errors = toUserErrors('string error')
    expect(errors).toHaveLength(1)
    expect(errors[0]!.code).toBe(ErrorCode.INTERNAL_ERROR)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/errors.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement errors.ts**

```typescript
// packages/kit/src/graphql/relay/errors.ts
import { DatabaseError } from '../../db/repository'
import { z } from 'zod'

export enum ErrorCode {
  UNIQUE_CONSTRAINT = 'UNIQUE_CONSTRAINT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  FORBIDDEN = 'FORBIDDEN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface UserError {
  field: string[] | null
  message: string
  code: string
}

export function toUserErrors(error: unknown): UserError[] {
  if (error instanceof DatabaseError && error.fieldErrors) {
    return Object.entries(error.fieldErrors)
      .filter(([, messages]) => messages && messages.length > 0)
      .map(([field, messages]) => ({
        field: [field],
        message: messages![0]!,
        code: ErrorCode.UNIQUE_CONSTRAINT,
      }))
  }

  if (error instanceof z.ZodError) {
    return error.issues.map(issue => ({
      field: issue.path.map(String),
      message: issue.message,
      code: ErrorCode.VALIDATION_ERROR,
    }))
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase()

    if (msg.includes('not found')) {
      return [{ field: null, message: error.message, code: ErrorCode.NOT_FOUND }]
    }

    if (msg.includes('forbidden') || msg.includes('permission')) {
      return [{ field: null, message: error.message, code: ErrorCode.FORBIDDEN }]
    }
  }

  const message = error instanceof Error ? error.message : 'An unexpected error occurred'
  return [{ field: null, message, code: ErrorCode.INTERNAL_ERROR }]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/errors.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/graphql/relay/errors.ts packages/kit/src/graphql/relay/errors.test.ts
git commit -m "feat(kit): add Relay userErrors conversion helper with typed error codes"
```

---

## Task 5: Node registry

**Files:**
- Create: `packages/kit/src/graphql/relay/node-registry.ts`
- Create: `packages/kit/src/graphql/relay/node-registry.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/kit/src/graphql/relay/node-registry.test.ts
import { describe, expect, it } from 'vitest'
import { createNodeRegistry } from './node-registry'

describe('createNodeRegistry', () => {
  it('should register and resolve a type', async () => {
    const registry = createNodeRegistry()
    registry.register('User', async (id) => ({ id, name: 'Alice' }))

    const globalId = btoa('User:abc-123')
    const result = await registry.resolve(globalId, {} as any)

    expect(result).toEqual({ id: 'abc-123', name: 'Alice', __typename: 'User' })
  })

  it('should throw for unregistered type', async () => {
    const registry = createNodeRegistry()
    const globalId = btoa('Unknown:123')

    await expect(registry.resolve(globalId, {} as any)).rejects.toThrow('Unknown')
  })

  it('should return null when resolver returns null', async () => {
    const registry = createNodeRegistry()
    registry.register('User', async () => null)

    const globalId = btoa('User:abc-123')
    const result = await registry.resolve(globalId, {} as any)

    expect(result).toBeNull()
  })

  it('should pass context to resolver', async () => {
    const registry = createNodeRegistry()
    const ctx = { auth: { session: { userId: 'u1' } } }

    registry.register('User', async (_id, receivedCtx) => {
      expect(receivedCtx).toBe(ctx)
      return { id: _id }
    })

    const globalId = btoa('User:abc')
    await registry.resolve(globalId, ctx as any)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/node-registry.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement node-registry.ts**

```typescript
// packages/kit/src/graphql/relay/node-registry.ts
import type { GraphQLContextMap } from '../context'
import { fromGlobalId } from './global-id'

type NodeResolver = (id: string, ctx: GraphQLContextMap) => Promise<unknown>

export function createNodeRegistry() {
  const resolvers = new Map<string, NodeResolver>()

  return {
    register(type: string, resolver: NodeResolver) {
      resolvers.set(type, resolver)
    },

    async resolve(globalId: string, ctx: GraphQLContextMap): Promise<unknown> {
      const { type, id } = fromGlobalId(globalId)

      const resolver = resolvers.get(type)
      if (!resolver) {
        throw new Error(`No node resolver registered for type "${type}"`)
      }

      const result = await resolver(id, ctx)
      if (result == null) {
        return null
      }

      return { ...(result as Record<string, unknown>), __typename: type }
    },
  }
}

export type NodeRegistry = ReturnType<typeof createNodeRegistry>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/node-registry.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/graphql/relay/node-registry.ts packages/kit/src/graphql/relay/node-registry.test.ts
git commit -m "feat(kit): add Relay node registry for global object identification"
```

---

## Task 6: Relay base types registration

**Files:**
- Create: `packages/kit/src/graphql/relay/relay-types.graphql`
- Create: `packages/kit/src/graphql/relay/relay-types.ts`

- [ ] **Step 1: Create the GraphQL type definitions**

```graphql
# packages/kit/src/graphql/relay/relay-types.graphql
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

- [ ] **Step 2: Create the registration file following the filter-types.ts pattern (inline string)**

The kit's `filter-types.ts` uses inline template strings, NOT file reads. Follow the same pattern:

```typescript
// packages/kit/src/graphql/relay/relay-types.ts
import { registerTypeDefs } from '../types'

registerTypeDefs(`
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
`)
```

The `.graphql` file created in Step 1 is for **codegen only** (referenced in `codegen.ts`). The runtime registration uses this inline `.ts` file.

- [ ] **Step 3: Verify types merge with existing schema**

Run: `cd packages/kit && pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/kit/src/graphql/relay/relay-types.graphql packages/kit/src/graphql/relay/relay-types.ts
git commit -m "feat(kit): add Relay base GraphQL types (Node, PageInfo, UserError)"
```

---

## Task 7: @globalId directive

**Files:**
- Create: `packages/kit/src/graphql/relay/directives/global-id.ts`
- Create: `packages/kit/src/graphql/relay/directives/global-id.test.ts`

- [ ] **Step 1: Write failing tests**

Test that the directive wraps the `id` field resolver to encode the output as a global ID.

```typescript
// packages/kit/src/graphql/relay/directives/global-id.test.ts
import { describe, expect, it } from 'vitest'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { graphql } from 'graphql'
import { globalIdDirective } from './global-id'

function buildSchema() {
  let schema = makeExecutableSchema({
    typeDefs: [
      globalIdDirective.typeDef,
      `type Query { app: App }
       type App { id: ID! @globalId(type: "App"), name: String! }`,
    ],
    resolvers: {
      Query: { app: () => ({ id: 'local-123', name: 'TestApp' }) },
    },
  })
  schema = globalIdDirective.transformer(schema)
  return schema
}

describe('@globalId directive', () => {
  it('should encode the id field as a global ID', async () => {
    const schema = buildSchema()
    const result = await graphql({ schema, source: '{ app { id name } }' })

    expect(result.errors).toBeUndefined()
    const id = result.data!.app.id as string
    expect(atob(id)).toBe('App:local-123')
  })

  it('should not affect non-id fields', async () => {
    const schema = buildSchema()
    const result = await graphql({ schema, source: '{ app { name } }' })

    expect(result.data!.app.name).toBe('TestApp')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/directives/global-id.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the directive**

Reference: the existing `@permission` directive at `packages/modules/auth/src/graphql/directives.ts` uses `mapSchema` + `MapperKind.OBJECT_FIELD` + `getDirective`. Follow the same pattern.

```typescript
// packages/kit/src/graphql/relay/directives/global-id.ts
import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils'
import type { GraphQLSchema } from 'graphql'
import { toGlobalId } from '../global-id'
import type { DirectiveDefinition } from '../../directives'

export const globalIdDirective: DirectiveDefinition = {
  name: 'globalId',
  typeDef: 'directive @globalId(type: String!) on FIELD_DEFINITION',
  transformer: (schema: GraphQLSchema) =>
    mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: (fieldConfig, _fieldName, _typeName, schema) => {
        const directive = getDirective(schema, fieldConfig, 'globalId')
        if (!directive?.length)
          return fieldConfig

        const { type } = directive[0] as { type: string }
        const originalResolve = fieldConfig.resolve

        return {
          ...fieldConfig,
          resolve: async (source, args, ctx, info) => {
            const result = originalResolve
              ? await originalResolve(source, args, ctx, info)
              : (source as Record<string, unknown>)?.[info.fieldName]

            if (result == null) return result
            return toGlobalId(type, String(result))
          },
        }
      },
    }),
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/directives/global-id.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/graphql/relay/directives/global-id.ts packages/kit/src/graphql/relay/directives/global-id.test.ts
git commit -m "feat(kit): add @globalId directive for Relay global ID encoding"
```

---

## Task 8: @connection directive

**Files:**
- Create: `packages/kit/src/graphql/relay/directives/connection.ts`
- Create: `packages/kit/src/graphql/relay/directives/connection.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/kit/src/graphql/relay/directives/connection.test.ts
import { describe, expect, it } from 'vitest'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { graphql } from 'graphql'
import { connectionDirective } from './connection'

const typeDefs = [
  connectionDirective.typeDef,
  `type Query {
    items(first: Int, after: String, last: Int, before: String): ItemConnection! @connection(maxPageSize: 5)
  }
  type ItemConnection { edges: [ItemEdge!]!, pageInfo: PageInfo!, totalCount: Int! }
  type ItemEdge { node: Item!, cursor: String! }
  type Item { id: ID!, name: String! }
  type PageInfo { hasNextPage: Boolean!, hasPreviousPage: Boolean!, startCursor: String, endCursor: String }`,
]

describe('@connection directive', () => {
  it('should transform PaginateResult into a Connection', async () => {
    const nodes = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]
    let schema = makeExecutableSchema({
      typeDefs,
      resolvers: { Query: { items: () => ({ nodes, totalCount: 2 }) } },
    })
    schema = connectionDirective.transformer(schema)

    const result = await graphql({ schema, source: '{ items(first: 2) { edges { node { id name } cursor } pageInfo { hasNextPage } totalCount } }' })

    expect(result.errors).toBeUndefined()
    expect(result.data!.items.edges).toHaveLength(2)
    expect(result.data!.items.totalCount).toBe(2)
    expect(result.data!.items.pageInfo.hasNextPage).toBe(false)
  })

  it('should reject first > maxPageSize', async () => {
    let schema = makeExecutableSchema({
      typeDefs,
      resolvers: { Query: { items: () => ({ nodes: [], totalCount: 0 }) } },
    })
    schema = connectionDirective.transformer(schema)

    const result = await graphql({ schema, source: '{ items(first: 10) { edges { node { id } } } }' })

    expect(result.errors).toBeDefined()
    expect(result.errors![0]!.message).toContain('5')
  })

  it('should reject first + last together', async () => {
    let schema = makeExecutableSchema({
      typeDefs,
      resolvers: { Query: { items: () => ({ nodes: [], totalCount: 0 }) } },
    })
    schema = connectionDirective.transformer(schema)

    const result = await graphql({ schema, source: '{ items(first: 2, last: 2) { edges { node { id } } } }' })

    expect(result.errors).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/directives/connection.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the directive**

```typescript
// packages/kit/src/graphql/relay/directives/connection.ts
import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils'
import { GraphQLError } from 'graphql'
import type { GraphQLSchema } from 'graphql'
import { buildConnection } from '../connection'
import { encodeCursor } from '../cursor'
import type { DirectiveDefinition } from '../../directives'

const DEFAULT_MAX_PAGE_SIZE = 100

export const connectionDirective: DirectiveDefinition = {
  name: 'connection',
  typeDef: 'directive @connection(maxPageSize: Int = 100) on FIELD_DEFINITION',
  transformer: (schema: GraphQLSchema) =>
    mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: (fieldConfig, _fieldName, _typeName, schema) => {
        const directive = getDirective(schema, fieldConfig, 'connection')
        if (!directive?.length)
          return fieldConfig

        const maxPageSize = (directive[0] as { maxPageSize?: number }).maxPageSize ?? DEFAULT_MAX_PAGE_SIZE
        const originalResolve = fieldConfig.resolve

        return {
          ...fieldConfig,
          resolve: async (source, args, ctx, info) => {
            const { first, last } = args as { first?: number, last?: number }

            if (first == null && last == null) {
              throw new GraphQLError('You must provide either "first" or "last" argument')
            }

            if (first != null && last != null) {
              throw new GraphQLError('Cannot use both "first" and "last" simultaneously')
            }

            if (first != null && first > maxPageSize) {
              throw new GraphQLError(`"first" must not exceed ${maxPageSize}`)
            }

            if (last != null && last > maxPageSize) {
              throw new GraphQLError(`"last" must not exceed ${maxPageSize}`)
            }

            const result = originalResolve
              ? await originalResolve(source, args, ctx, info)
              : (source as Record<string, unknown>)?.[info.fieldName]

            const { nodes, totalCount } = result as { nodes: Record<string, unknown>[], totalCount: number }

            // The service is responsible for providing cursors via a `cursors` array
            // or the directive uses a default `id`-only cursor as fallback.
            // For sort-aware cursors, services should return nodes with cursor values
            // pre-computed, or PaginateResult should include a getCursor callback.
            const getCursor = (result as { getCursor?: (node: Record<string, unknown>) => string }).getCursor
              ?? ((node: Record<string, unknown>) => encodeCursor({ id: node.id }))

            return buildConnection({
              nodes,
              args: args as { first?: number, after?: string, last?: number, before?: string },
              totalCount,
              getCursor,
            })
          },
        }
      },
    }),
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/directives/connection.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/graphql/relay/directives/connection.ts packages/kit/src/graphql/relay/directives/connection.test.ts
git commit -m "feat(kit): add @connection directive for Relay cursor-based pagination"
```

---

## Task 9: @relayMutation directive

**Files:**
- Create: `packages/kit/src/graphql/relay/directives/relay-mutation.ts`
- Create: `packages/kit/src/graphql/relay/directives/relay-mutation.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/kit/src/graphql/relay/directives/relay-mutation.test.ts
import { describe, expect, it } from 'vitest'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { graphql } from 'graphql'
import { relayMutationDirective } from './relay-mutation'

const typeDefs = [
  relayMutationDirective.typeDef,
  `type Query { _empty: String }
   type Mutation {
     createItem(name: String!): CreateItemPayload! @relayMutation(payloadField: "item")
   }
   type CreateItemPayload { item: Item, userErrors: [UserError!]! }
   type Item { id: ID!, name: String! }
   type UserError { field: [String!], message: String!, code: String! }`,
]

describe('@relayMutation directive', () => {
  it('should wrap successful result in payload with empty userErrors', async () => {
    let schema = makeExecutableSchema({
      typeDefs,
      resolvers: {
        Query: { _empty: () => null },
        Mutation: { createItem: (_p, args) => ({ id: '1', name: args.name }) },
      },
    })
    schema = relayMutationDirective.transformer(schema)

    const result = await graphql({ schema, source: 'mutation { createItem(name: "Test") { item { id name } userErrors { message code } } }' })

    expect(result.errors).toBeUndefined()
    expect(result.data!.createItem.item).toEqual({ id: '1', name: 'Test' })
    expect(result.data!.createItem.userErrors).toEqual([])
  })

  it('should convert thrown errors to userErrors', async () => {
    let schema = makeExecutableSchema({
      typeDefs,
      resolvers: {
        Query: { _empty: () => null },
        Mutation: { createItem: () => { throw new Error('Item not found') } },
      },
    })
    schema = relayMutationDirective.transformer(schema)

    const result = await graphql({ schema, source: 'mutation { createItem(name: "Test") { item { id } userErrors { message code } } }' })

    expect(result.errors).toBeUndefined() // No GraphQL errors — captured in userErrors
    expect(result.data!.createItem.item).toBeNull()
    expect(result.data!.createItem.userErrors).toHaveLength(1)
    expect(result.data!.createItem.userErrors[0].code).toBe('NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/directives/relay-mutation.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the directive**

```typescript
// packages/kit/src/graphql/relay/directives/relay-mutation.ts
import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils'
import type { GraphQLSchema } from 'graphql'
import { toUserErrors } from '../errors'
import type { DirectiveDefinition } from '../../directives'

export const relayMutationDirective: DirectiveDefinition = {
  name: 'relayMutation',
  typeDef: 'directive @relayMutation(payloadField: String!) on FIELD_DEFINITION',
  transformer: (schema: GraphQLSchema) =>
    mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: (fieldConfig, _fieldName, _typeName, schema) => {
        const directive = getDirective(schema, fieldConfig, 'relayMutation')
        if (!directive?.length)
          return fieldConfig

        const { payloadField } = directive[0] as { payloadField: string }
        const originalResolve = fieldConfig.resolve

        return {
          ...fieldConfig,
          resolve: async (source, args, ctx, info) => {
            try {
              const result = originalResolve
                ? await originalResolve(source, args, ctx, info)
                : (source as Record<string, unknown>)?.[info.fieldName]

              return {
                [payloadField]: result,
                userErrors: [],
              }
            }
            catch (error) {
              return {
                [payloadField]: null,
                userErrors: toUserErrors(error),
              }
            }
          },
        }
      },
    }),
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/directives/relay-mutation.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/graphql/relay/directives/relay-mutation.ts packages/kit/src/graphql/relay/directives/relay-mutation.test.ts
git commit -m "feat(kit): add @relayMutation directive for structured mutation payloads"
```

---

## Task 10: Directives index and kit relay exports

**Files:**
- Create: `packages/kit/src/graphql/relay/directives/index.ts`
- Create: `packages/kit/src/graphql/relay/index.ts`
- Modify: `packages/kit/src/graphql/index.ts`

- [ ] **Step 1: Create directives registration index**

This file registers all three directives when imported. It must be imported **after** auth directives are registered.

```typescript
// packages/kit/src/graphql/relay/directives/index.ts
import { registerDirective } from '../../directives'
import { globalIdDirective } from './global-id'
import { connectionDirective } from './connection'
import { relayMutationDirective } from './relay-mutation'

registerDirective(globalIdDirective)
registerDirective(connectionDirective)
registerDirective(relayMutationDirective)
```

- [ ] **Step 2: Create relay public API index**

```typescript
// packages/kit/src/graphql/relay/index.ts
export { toGlobalId, fromGlobalId } from './global-id'
export { encodeCursor, decodeCursor } from './cursor'
export { buildConnection } from './connection'
export type { ConnectionArgs, PaginateResult, Connection, Edge, PageInfo } from './connection'
export { createNodeRegistry } from './node-registry'
export type { NodeRegistry } from './node-registry'
export { toUserErrors, ErrorCode } from './errors'
export type { UserError } from './errors'
```

- [ ] **Step 3: Add relay exports to kit graphql index**

Modify `packages/kit/src/graphql/index.ts` — add the relay re-export and type registration:

```typescript
// Add these lines after existing imports:
import './relay/relay-types'

// Add after existing exports:
export * from './relay'
```

- [ ] **Step 3b: Add sub-path export to kit package.json**

The auth module needs to import `@czo/kit/graphql/relay/directives` as a side-effect import for directive registration. Add to `packages/kit/package.json` exports:

```json
"./graphql/relay/directives": {
  "types": "./src/graphql/relay/directives/index.ts",
  "default": "./dist/graphql/relay/directives/index.mjs"
}
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 5: Verify all relay tests pass**

Run: `cd packages/kit && pnpm test -- src/graphql/relay/`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/kit/src/graphql/relay/directives/index.ts packages/kit/src/graphql/relay/index.ts packages/kit/src/graphql/index.ts
git commit -m "feat(kit): wire up Relay directives registration and public exports"
```

---

## Task 11: App module schema migration

**Files:**
- Modify: `packages/modules/auth/src/graphql/schema/app/schema.graphql`
- Modify: `packages/modules/auth/codegen.ts`

- [ ] **Step 1: Update the App GraphQL schema**

Replace the contents of `packages/modules/auth/src/graphql/schema/app/schema.graphql` with the Relay-compliant schema from the spec (Section "Module Pilot: App > Schema Changes"). Key changes:
- `type App implements Node` with `@globalId(type: "App")`
- Add `AppConnection`, `AppEdge`, `AppOrderField`, `AppOrderByInput`
- Replace `app(appId: String!)` with `app(id: ID!)` and add `appBySlug(appId: String!)`
- Replace mutation return types with `XxxPayload` types + `@relayMutation(payloadField: "app")`
- Replace list query with `apps(...): AppConnection! @connection(maxPageSize: 100)`
- Preserve all `@permission` directives — keep existing permission actions (`write`, `delete`) since `APPS_STATEMENTS` and `APPS_HIERARCHY` in `config/index.ts` define those. Do NOT use `install`/`uninstall` actions unless you also update the RBAC config.
- Keep existing input types (`InstallAppInput`, `InstallAppManifestInput`). For `updateAppManifest` and `setAppStatus`, define new input types:
  ```graphql
  input UpdateAppManifestInput { appId: String!, manifest: JSON! }
  input SetAppStatusInput { appId: String!, status: String! }
  ```
- Remove the old `AppInstallResult` type (replaced by `InstallAppPayload`)

- [ ] **Step 2: Update codegen config to include relay types**

Modify `packages/modules/auth/codegen.ts` — add the relay types graphql file to the schema array:

```typescript
schema: [
  '../../kit/src/graphql/base-types.graphql',
  '../../kit/src/graphql/filter-types.graphql',
  '../../kit/src/graphql/relay/relay-types.graphql',  // Add this
  'src/graphql/schema/**/*.graphql',
],
```

- [ ] **Step 3: Run codegen**

Run: `cd packages/modules/auth && pnpm generate`
Expected: Types regenerated without errors

- [ ] **Step 4: Commit**

```bash
git add packages/modules/auth/src/graphql/schema/app/schema.graphql packages/modules/auth/codegen.ts packages/modules/auth/src/graphql/__generated__/
git commit -m "feat(auth): migrate App GraphQL schema to Relay spec"
```

---

## Task 12: App service — cursor pagination and getAppById

**Files:**
- Modify: `packages/modules/auth/src/services/app.service.ts`
- Modify: `packages/modules/auth/src/services/app.service.test.ts`

- [ ] **Step 1: Write failing tests for getAppById**

Add to `app.service.test.ts`:

```typescript
describe('getAppById', () => {
  it('should return the app when found by primary key', async () => {
    queryFirstResult = { id: 'uuid-123', appId: 'my-app' }
    const result = await service.getAppById('uuid-123')
    expect(result).toEqual(queryFirstResult)
  })

  it('should return null when not found', async () => {
    queryFirstResult = null
    const result = await service.getAppById('nonexistent')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Write failing tests for paginated listApps**

Add to `app.service.test.ts`:

```typescript
describe('listApps (paginated)', () => {
  it('should return PaginateResult with nodes and totalCount', async () => {
    queryManyResult = [{ id: '1', status: 'active' }, { id: '2', status: 'active' }]
    // Mock count query - need to set up db.select for totalCount
    const result = await service.listApps({ first: 10 })
    expect(result.nodes).toHaveLength(2)
    expect(result.totalCount).toBeDefined()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/modules/auth && pnpm test -- src/services/app.service.test.ts`
Expected: FAIL — `getAppById` and new `listApps` signature not found

- [ ] **Step 4: Implement getAppById and update listApps**

In `app.service.ts`:
- Add `getAppById(id: string)` — queries by primary key `id` column using `repo.findFirst({ where: { id } } as any)` (or a direct `db.select().from(apps).where(eq(apps.id, id)).limit(1)`)
- Update `listApps` signature to accept `ConnectionArgs` + optional `AppOrderByInput`
- Implement cursor decoding, keyset WHERE clause, LIMIT first+1 pattern
- Apply existing `status = 'active'` filter alongside keyset WHERE
- If organization context is needed, accept it as a separate parameter or derive from context
- Add totalCount via separate `db.select({ count: sql\`count(*)\` }).from(apps).where(...)` query
- Return `PaginateResult<AppRow>` with a `getCursor` function that encodes the sort column value + id
- Update `uninstall` to return the deleted `AppRow` instead of void (needed for `@relayMutation` payload)
- Export `getAppById` from the service factory return object

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/modules/auth && pnpm test -- src/services/app.service.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add packages/modules/auth/src/services/app.service.ts packages/modules/auth/src/services/app.service.test.ts
git commit -m "feat(auth): add getAppById and cursor-based listApps to app service"
```

---

## Task 13: App resolvers and plugin wiring

**Files:**
- Modify: `packages/modules/auth/src/graphql/schema/app/resolvers/Query/app.ts`
- Modify: `packages/modules/auth/src/graphql/schema/app/resolvers/Query/apps.ts`
- Create: `packages/modules/auth/src/graphql/schema/app/resolvers/Query/appBySlug.ts`
- Modify: `packages/modules/auth/src/graphql/schema/app/resolvers/Mutation/installApp.ts`
- Modify: `packages/modules/auth/src/plugins/index.ts`

- [ ] **Step 1: Update Query.app resolver to use global ID**

```typescript
// packages/modules/auth/src/graphql/schema/app/resolvers/Query/app.ts
import type { QueryResolvers } from './../../../../__generated__/types.generated'
import { fromGlobalId } from '@czo/kit/graphql'

export const app: NonNullable<QueryResolvers['app']> = async (_parent, _arg, _ctx) => {
  const { id } = fromGlobalId(_arg.id)
  return _ctx.auth.appService.getAppById(id)
}
```

- [ ] **Step 2: Create Query.appBySlug resolver**

```typescript
// packages/modules/auth/src/graphql/schema/app/resolvers/Query/appBySlug.ts
import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const appBySlug: NonNullable<QueryResolvers['appBySlug']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.appService.getApp(_arg.appId)
```

- [ ] **Step 3: Update Query.apps resolver for ConnectionArgs**

```typescript
// packages/modules/auth/src/graphql/schema/app/resolvers/Query/apps.ts
import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const apps: NonNullable<QueryResolvers['apps']> = async (_parent, _arg, _ctx) => {
  return _ctx.auth.appService.listApps(
    { first: _arg.first ?? undefined, after: _arg.after ?? undefined, last: _arg.last ?? undefined, before: _arg.before ?? undefined },
    _arg.orderBy ?? undefined,
  )
}
```

- [ ] **Step 4: Update mutation resolvers**

The `@relayMutation` directive wraps the return — resolvers keep returning the raw object. Ensure the mutation resolvers return the business object directly (not a payload).

- [ ] **Step 5: Register App in node registry**

Modify `packages/modules/auth/src/plugins/index.ts` — in the `czo:boot` hook, after auth is created:

```typescript
const nodeRegistry = await container.make('graphql:nodeRegistry')
nodeRegistry.register('App', async (localId, ctx) => {
  return ctx.auth.appService.getAppById(localId)
})
```

Also import and register the relay directives here (after auth directives):

```typescript
import '@czo/kit/graphql/relay/directives'
import '@czo/kit/graphql/relay/relay-types'
```

- [ ] **Step 6: Register nodeRegistry as IoC singleton in auth plugin**

In `packages/modules/auth/src/plugins/index.ts`, during the `czo:init` hook (where other singletons like `auth:actor` are registered):

```typescript
container.singleton('graphql:nodeRegistry', () => {
  const { createNodeRegistry } = await import('@czo/kit/graphql')
  return createNodeRegistry()
})
```

This goes in the auth plugin because the kit itself has no Nitro plugin. Future modules that need node resolution will access the same singleton.

- [ ] **Step 6b: Create Query.node resolver**

Create `packages/kit/src/graphql/relay/node-resolver.ts`:

```typescript
import { registerResolvers } from '../resolvers'
import type { NodeRegistry } from './node-registry'

export function registerNodeResolver(nodeRegistry: NodeRegistry) {
  registerResolvers({
    Query: {
      node: async (_parent: unknown, args: { id: string }, ctx: unknown) => {
        return nodeRegistry.resolve(args.id, ctx as any)
      },
    },
  })
}
```

Call `registerNodeResolver(nodeRegistry)` in the auth plugin's `czo:boot` hook, after the node registry has all types registered.

- [ ] **Step 6c: Import relay directives AFTER auth directives**

In `packages/modules/auth/src/plugins/index.ts`, ensure the relay directive import comes after the auth directives file is imported:

```typescript
// Auth directives are imported via the graphql module (context-factory.ts imports directives.ts)
// Relay directives must come after:
import '@czo/kit/graphql/relay/directives'
```

- [ ] **Step 7: Run full test suite**

Run: `pnpm build && pnpm test`
Expected: All tests PASS, build succeeds

- [ ] **Step 8: Run type check**

Run: `pnpm check-types`
Expected: No type errors

- [ ] **Step 9: Commit**

```bash
git add packages/modules/auth/src/graphql/ packages/modules/auth/src/plugins/index.ts
git commit -m "feat(auth): wire App resolvers and plugin to Relay directives and node registry"
```

---

## Task 14: End-to-end validation and cleanup

**Files:**
- Modify: `packages/modules/auth/src/routes/auth/catch-all.test.ts` (if affected)
- Verify: all existing tests still pass

- [ ] **Step 1: Run full lint**

Run: `pnpm lint`
Expected: 0 errors, 0 warnings

- [ ] **Step 2: Run full type check**

Run: `pnpm check-types`
Expected: 0 errors

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 5: Final commit if any fixes were needed**

Stage only the specific files that needed fixes, then commit:
```bash
git commit -m "chore: fix lint, types, and tests after Relay adoption"
```
