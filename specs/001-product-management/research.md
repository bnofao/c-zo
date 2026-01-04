# Research & Technology Decisions: Product Management Module

**Date**: 2025-11-02  
**Feature**: Product Management Module  
**Plan**: [plan.md](./plan.md)

## Overview

This document captures research findings and technology decisions for implementing the product management module. All decisions are made to support the requirements in [spec.md](./spec.md) while adhering to the constitution principles and existing monorepo architecture.

## Technology Stack Decisions

### 1. Kysely for Database Layer

**Decision**: Use Kysely as the primary database query builder

**Rationale**:
- **Type Safety**: Kysely provides end-to-end type safety from database schema to application code
- **Performance**: Generates efficient SQL without ORM overhead
- **Flexibility**: Allows complex queries (materialized path, joins) without fighting abstraction
- **Migration Support**: Built-in migration system with TypeScript
- **PostgreSQL Features**: Full support for JSONB, CTEs, window functions needed for category hierarchies
- **Monorepo Alignment**: Already listed as peer dependency in package.json

**Alternatives Considered**:
- **Prisma**: Rejected due to code generation overhead and less flexibility for complex queries
- **TypeORM**: Rejected due to Active Record pattern conflicts with service layer architecture
- **Drizzle**: Rejected due to less mature ecosystem and migration tooling

**Implementation Approach**:
```typescript
// Type-safe database interface
import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'

interface Database {
  products: ProductsTable
  p_variants: VariantsTable
  p_categories: CategoriesTable
  // ... other tables
}

const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
    })
  })
})

// Type-safe query example
const product = await db
  .selectFrom('products')
  .selectAll()
  .where('id', '=', productId)
  .where('deleted_at', 'is', null)
  .executeTakeFirst()
```

**Best Practices**:
1. **Database Types Generation**: Use kysely-codegen to generate types from database schema
2. **Query Builders**: Create reusable query builder functions for common patterns
3. **Transaction Support**: Use db.transaction() for operations spanning multiple tables
4. **Connection Pooling**: Configure pg pool with appropriate limits (max: 20 for production)
5. **Query Logging**: Enable query logging in development, structured logs in production

---

### 2. GraphQL Code Generator with Resolver Files Pattern

**Decision**: Use @eddeee888/gcg-typescript-resolver-files for GraphQL schema and resolver generation

**Rationale**:
- **Schema-First Development**: Define GraphQL schema in .gql files, generate TypeScript types
- **Type Safety**: Complete type safety from schema → resolvers → services
- **Resolver Organization**: Automatically organizes resolvers by type and operation
- **Already Configured**: codegen.ts already exists in the module
- **Best Practices**: Follows GraphQL best practices with separation of concerns

**Alternatives Considered**:
- **Code-First (TypeGraphQL)**: Rejected to maintain schema-first approach for API documentation
- **Apollo Server Codegen**: Rejected due to less comprehensive resolver typing
- **Manual Schema**: Rejected due to lack of type safety and maintenance burden

**Implementation Approach**:
```typescript
// codegen.ts configuration
import type { CodegenConfig } from '@graphql-codegen/cli'
import { defineConfig } from '@eddeee888/gcg-typescript-resolver-files'

const config: CodegenConfig = {
  schema: '**/schema.gql',
  generates: {
    'src/schema': defineConfig({
      resolverTypesPath: './types.generated.ts',
      typeDefsFilePath: './typeDefs.generated.ts',
      resolverMainFilePath: './resolvers.generated.ts',
    })
  }
}
```

**Schema Organization**:
```text
src/schema/
├── product/
│   ├── schema.gql          # Product types, queries, mutations
│   └── resolvers/
│       ├── Query/
│       │   ├── product.ts
│       │   └── products.ts
│       ├── Mutation/
│       │   ├── createProduct.ts
│       │   ├── updateProduct.ts
│       │   └── deleteProduct.ts
│       └── Product.ts       # Field resolvers (variants, categories, etc.)
```

**Best Practices**:
1. **Separate Schema Files**: One .gql file per domain entity
2. **Resolver Context**: Type-safe context with auth, db, services
3. **Field Resolvers**: Lazy-load relations only when requested
4. **Error Handling**: Use GraphQLError for consistent error responses
5. **Input Validation**: Validate at GraphQL schema level + service layer

---

### 3. Adjacency List Pattern for Category Hierarchies

**Decision**: Use adjacency list pattern with PostgreSQL recursive CTEs for category hierarchy queries

**Rationale**:
- **Simplicity**: Single parent_id foreign key, easy to understand and maintain
- **Flexibility**: Easy to move categories (just update parent_id)
- **PostgreSQL Support**: Native recursive CTE support for efficient tree traversal
- **Standard Pattern**: Well-documented and widely used approach
- **Foreign Key Integrity**: Simpler constraint management with just parent_id

**Alternatives Considered**:
- **Materialized Path**: Rejected due to update complexity and path recalculation overhead
- **Nested Sets**: Rejected due to complexity of updates and moves
- **Closure Table**: Rejected due to additional table and storage overhead

**Implementation Approach**:
```typescript
interface Category {
  id: string
  name: string
  parent_id: string | null  // NULL for root categories
}

// Get all descendants using recursive CTE
async function getCategoryTree(rootCategoryId: string) {
  return db
    .withRecursive('category_tree', (qb) =>
      qb
        .selectFrom('p_categories')
        .selectAll()
        .where('id', '=', rootCategoryId)
        .where('deleted_at', 'is', null)
        .unionAll(
          qb
            .selectFrom('p_categories as c')
            .innerJoin('category_tree as ct', 'c.parent_id', 'ct.id')
            .selectAll('c')
            .where('c.deleted_at', 'is', null)
        )
    )
    .selectFrom('category_tree')
    .selectAll()
    .execute()
}

// Get direct children
async function getChildren(categoryId: string) {
  return db
    .selectFrom('p_categories')
    .selectAll()
    .where('parent_id', '=', categoryId)
    .where('deleted_at', 'is', null)
    .orderBy('rank', 'asc')
    .execute()
}

// Get path to root
async function getCategoryPath(categoryId: string) {
  const result = await db
    .withRecursive('category_path', (qb) =>
      qb
        .selectFrom('p_categories')
        .select(['id', 'name', 'parent_id'])
        .where('id', '=', categoryId)
        .unionAll(
          qb
            .selectFrom('p_categories as c')
            .innerJoin('category_path as cp', 'c.id', 'cp.parent_id')
            .select(['c.id', 'c.name', 'c.parent_id'])
        )
    )
    .selectFrom('category_path')
    .selectAll()
    .execute()
  
  return result.reverse() // Root to current
}
```

**Best Practices**:
1. **Index parent_id**: Critical for query performance
2. **Validate Cycles**: Prevent circular references (category becoming its own ancestor)
3. **Depth Limits**: Enforce maximum depth (e.g., 10 levels) via application logic
4. **Cache Results**: Cache category trees for frequently accessed hierarchies
5. **Rank Ordering**: Use rank field for consistent sibling ordering

---

### 4. Soft Deletion Strategy

**Decision**: Use deleted_at timestamp with partial unique indexes for all entities

**Rationale**:
- **Audit Trail**: Maintain history of deleted records for compliance
- **Recovery**: Allow undelete operations without data loss
- **Referential Integrity**: Preserve relationships even after deletion
- **Specification Requirement**: All tables in schema include deleted_at
- **Handle Reuse**: Partial indexes enable handle reuse after deletion

**Implementation Approach**:
```typescript
// Soft delete helper
async function softDelete(table: string, id: string) {
  return db
    .updateTable(table as any)
    .set({ deleted_at: new Date() })
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .execute()
}

// Query with soft delete filter
function activeRecordsQuery<T>(table: string) {
  return db
    .selectFrom(table as any)
    .where('deleted_at', 'is', null)
}

// Migration example with partial unique index
await db.schema
  .createIndex('products_handle_unique')
  .on('products')
  .column('handle')
  .unique()
  .where('deleted_at', 'is', null)
  .execute()
```

**Best Practices**:
1. **All Queries Filter**: Always include WHERE deleted_at IS NULL in queries
2. **Unique Constraints**: Use partial indexes for uniqueness on active records only
3. **Foreign Keys**: Reference both active and deleted records to maintain integrity
4. **Cascading**: Decide per-relationship if soft delete should cascade
5. **Purge Strategy**: Define data retention policy for permanent deletion

---

### 5. Handle Generation and Uniqueness

**Decision**: Auto-generate URL-safe handles from titles with uniqueness enforcement

**Rationale**:
- **SEO-Friendly**: Human-readable URLs for products and categories
- **Uniqueness**: Ensure no collisions with partial unique indexes
- **User Experience**: Allow custom handles while providing defaults
- **Specification Requirement**: Schema includes unique handle constraints

**Implementation Approach**:
```typescript
// Handle generation utility
import slugify from 'slugify'

async function generateUniqueHandle(
  table: string,
  title: string,
  customHandle?: string
): Promise<string> {
  const baseHandle = customHandle || slugify(title, {
    lower: true,
    strict: true,
    locale: 'en'
  })
  
  // Check uniqueness
  const existing = await db
    .selectFrom(table as any)
    .select('handle')
    .where('handle', '=', baseHandle)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()
  
  if (!existing) {
    return baseHandle
  }
  
  // Add suffix for uniqueness
  let suffix = 1
  while (true) {
    const handle = `${baseHandle}-${suffix}`
    const exists = await db
      .selectFrom(table as any)
      .select('handle')
      .where('handle', '=', handle)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    
    if (!exists) return handle
    suffix++
  }
}
```

**Best Practices**:
1. **Slugification**: Use library like slugify for consistent formatting
2. **Validation**: Enforce max length (e.g., 255 characters)
3. **Collision Handling**: Append numeric suffix for duplicates
4. **Custom Handles**: Allow user-provided handles with validation
5. **Immutability**: Consider making handles immutable after creation

---

### 6. Optimistic Locking for Concurrent Updates

**Decision**: Use updated_at timestamp for optimistic locking on concurrent updates

**Rationale**:
- **Conflict Detection**: Detect when record was modified by another request
- **User Experience**: Prefer optimistic locking over pessimistic (row locks)
- **Performance**: No lock contention, better for high-concurrency scenarios
- **Simplicity**: Leverages existing updated_at timestamp field

**Implementation Approach**:
```typescript
interface UpdateInput {
  id: string
  expectedUpdatedAt: Date  // Timestamp from initial read
  data: Partial<ProductUpdate>
}

async function updateProduct(input: UpdateInput) {
  const result = await db
    .updateTable('products')
    .set({
      ...input.data,
      updated_at: new Date()
    })
    .where('id', '=', input.id)
    .where('updated_at', '=', input.expectedUpdatedAt)
    .where('deleted_at', 'is', null)
    .returning(['id', 'updated_at'])
    .executeTakeFirst()
  
  if (!result) {
    throw new Error('Product was modified by another request. Please refresh and try again.')
  }
  
  return result
}
```

**Best Practices**:
1. **Return New Timestamp**: Always return updated_at after successful update
2. **Client Responsibility**: Client must send last known updated_at
3. **Error Handling**: Clear error messages for conflicts
4. **Retry Logic**: Client can retry with refreshed data
5. **Granular Locking**: Apply per-entity, not for read-only operations

---

### 7. Query Optimization Patterns

**Decision**: Use strategic joins and query compositions to avoid N+1 problems

**Rationale**:
- **Performance**: Single query fetches related data instead of multiple round trips
- **GraphQL Efficiency**: Field resolvers can use pre-loaded data
- **Specification Compliance**: Meet P95 < 300ms performance requirements
- **Kysely Strengths**: Leverages type-safe join capabilities

**Implementation Approach**:
```typescript
// Reusable query composition
async function getProductWithRelations(productId: string) {
  return db
    .selectFrom('products')
    .leftJoin('p_collections', 'products.collection_id', 'p_collections.id')
    .leftJoin('p_types', 'products.type_id', 'p_types.id')
    .leftJoin('p_variants', 'p_variants.product_id', 'products.id')
    .select([
      'products.id',
      'products.title',
      'products.handle',
      // ... other product fields
      'p_collections.title as collection_title',
      'p_types.value as type_value',
      // Aggregate variants
      db.fn.count('p_variants.id').as('variant_count')
    ])
    .where('products.id', '=', productId)
    .where('products.deleted_at', 'is', null)
    .groupBy('products.id')
    .executeTakeFirst()
}

// Many-to-many with junction table
async function getProductCategories(productId: string) {
  return db
    .selectFrom('p_categories')
    .innerJoin('p_categories_products', 'p_categories.id', 'p_categories_products.p_categories_id')
    .selectAll('p_categories')
    .where('p_categories_products.product_id', '=', productId)
    .where('p_categories.deleted_at', 'is', null)
    .execute()
}
```

**Best Practices**:
1. **Query Functions**: Create reusable query functions in database/queries/
2. **Selective Joins**: Only join tables when data is needed
3. **Aggregations**: Use SQL aggregations instead of application-level counting
4. **Batch Loading**: For GraphQL, consider DataLoader pattern if needed
5. **Index Usage**: Ensure all join columns and where clauses use indexes

---

### 8. Testing Strategy with Vitest

**Decision**: Use Vitest for unit and integration tests with test containers for database

**Rationale**:
- **Monorepo Standard**: Vitest is already configured in the monorepo
- **Fast Execution**: Vitest is faster than Jest with better ESM support
- **Test Containers**: Provides isolated PostgreSQL instances for integration tests
- **TDD Support**: Excellent watch mode for test-driven development
- **TypeScript Native**: First-class TypeScript support without configuration

**Implementation Approach**:
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/*.generated.ts', '**/migrations/**']
    }
  }
})

// tests/setup.ts - Integration test setup
import { GenericContainer } from 'testcontainers'
import { Kysely } from 'kysely'

let postgresContainer: StartedTestContainer
let testDb: Kysely<Database>

beforeAll(async () => {
  postgresContainer = await new GenericContainer('postgres:14')
    .withExposedPorts(5432)
    .withEnvironment({
      POSTGRES_DB: 'test',
      POSTGRES_PASSWORD: 'test'
    })
    .start()
  
  // Run migrations
  testDb = createTestDatabase(postgresContainer)
  await migrateToLatest(testDb)
})

afterAll(async () => {
  await testDb.destroy()
  await postgresContainer.stop()
})

// Unit test example
describe('ProductService', () => {
  it('should create product with auto-generated handle', async () => {
    const service = new ProductService(testDb)
    
    const product = await service.createProduct({
      title: 'Test Product',
      description: 'A test product',
      status: 'draft'
    })
    
    expect(product.handle).toBe('test-product')
    expect(product.status).toBe('draft')
  })
})
```

**Test Organization**:
```text
tests/
├── unit/                    # Isolated unit tests (services, utilities)
│   ├── services/
│   │   ├── product.service.test.ts
│   │   └── category.service.test.ts
│   ├── utils/
│   │   ├── handle-generator.test.ts
│   │   └── mpath-calculator.test.ts
│   └── validators/
│       └── product.validator.test.ts
│
├── integration/             # Database + service integration tests
│   └── resolvers/
│       ├── product.resolver.test.ts
│       └── category.resolver.test.ts
│
├── contract/                # Public API contract tests
│   └── api/
│       └── graphql.contract.test.ts
│
└── setup.ts                 # Test configuration and helpers
```

**Best Practices**:
1. **TDD Workflow**: Write test first (Red), implement (Green), refactor
2. **Test Isolation**: Each test gets fresh database state
3. **Factory Pattern**: Use factories for test data creation
4. **Coverage Targets**: Aim for 80%+ coverage, 100% for services
5. **Fast Tests**: Unit tests < 1s total, integration tests < 30s

**Migration Management**:
```bash
# Use kysely-ctl for migration management
pnpm add -D kysely-ctl

# Create migrations
pnpm kysely-ctl migration:create create_table_name

# Run migrations
pnpm kysely-ctl migrate:latest

# Check status
pnpm kysely-ctl migrate:status
```

---

## Integration Patterns

### Database Connection Management

**Pattern**: Singleton database connection with pool configuration

```typescript
// database/connection.ts
import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import type { Database } from './types'

let db: Kysely<Database> | null = null

export function getDatabase(): Kysely<Database> {
  if (!db) {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          max: 20, // Maximum pool size
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        })
      }),
      log: process.env.NODE_ENV === 'development' 
        ? (event) => {
            if (event.level === 'query') {
              console.log(event.query.sql)
              console.log(event.query.parameters)
            }
          }
        : undefined
    })
  }
  return db
}
```

### GraphQL Context Setup

**Pattern**: Provide database and services through context

```typescript
// schema/context.ts
import type { Kysely } from 'kysely'
import type { Database } from '../database/types'

export interface GraphQLContext {
  db: Kysely<Database>
  user?: {
    id: string
    role: string
  }
  services: {
    product: ProductService
    variant: VariantService
    category: CategoryService
    // ... other services
  }
}

// In resolver
type Resolver<TResult, TParent, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: GraphQLContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult
```

### Service Layer Pattern

**Pattern**: Services encapsulate business logic and database operations

```typescript
// services/product.service.ts
export class ProductService {
  constructor(private db: Kysely<Database>) {}
  
  async createProduct(input: CreateProductInput): Promise<Product> {
    // 1. Validate input
    validateProductInput(input)
    
    // 2. Generate handle if not provided
    const handle = await generateUniqueHandle(
      'products',
      input.title,
      input.handle
    )
    
    // 3. Insert with transaction
    return this.db.transaction().execute(async (trx) => {
      const product = await trx
        .insertInto('products')
        .values({
          id: generateId(),
          ...input,
          handle,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      
      // 4. Handle relations (categories, tags)
      if (input.categoryIds) {
        await this.assignCategories(trx, product.id, input.categoryIds)
      }
      
      return product
    })
  }
}
```

## Performance Benchmarks

Expected performance based on research and similar implementations:

| Operation | Target | Notes |
|-----------|--------|-------|
| Simple product query | P95 < 100ms | Single product by ID |
| Product list (paginated) | P95 < 250ms | 50 products with relations |
| Category tree query | P95 < 150ms | 5 levels deep, 1000 categories |
| Product creation | P95 < 200ms | With variants and categories |
| Variant creation | P95 < 150ms | Single variant with options |
| Complex product search | P95 < 300ms | Full-text + filters |

## Security Research

### Input Validation

**Layers**:
1. **GraphQL Schema**: Type validation (String!, Int, enums)
2. **Service Layer**: Business rule validation
3. **Database Layer**: Parameterized queries (Kysely handles this)

**Metadata Sanitization**:
```typescript
function sanitizeMetadata(metadata: unknown): Record<string, any> {
  if (typeof metadata !== 'object' || metadata === null) {
    throw new Error('Metadata must be an object')
  }
  
  // Remove any potential script injections
  const sanitized = JSON.parse(JSON.stringify(metadata))
  
  // Validate size (prevent DoS)
  if (JSON.stringify(sanitized).length > 10000) {
    throw new Error('Metadata exceeds maximum size')
  }
  
  return sanitized
}
```

### Authorization Patterns

```typescript
// Resolver with auth check
async function createProduct(
  _parent: unknown,
  args: { input: CreateProductInput },
  context: GraphQLContext
) {
  // Check authentication
  if (!context.user) {
    throw new GraphQLError('Unauthorized', {
      extensions: { code: 'UNAUTHENTICATED' }
    })
  }
  
  // Check authorization
  if (context.user.role !== 'admin') {
    throw new GraphQLError('Forbidden', {
      extensions: { code: 'FORBIDDEN' }
    })
  }
  
  return context.services.product.createProduct(args.input)
}
```

## Monitoring & Observability

### Structured Logging

```typescript
import { logger } from '@czo/kit/logger'

function logQuery(operation: string, duration: number, success: boolean) {
  logger.info({
    type: 'database_query',
    operation,
    duration_ms: duration,
    success,
    timestamp: new Date().toISOString()
  })
}

// Usage in service
const startTime = Date.now()
try {
  const result = await this.db.selectFrom('products').execute()
  logQuery('list_products', Date.now() - startTime, true)
  return result
} catch (error) {
  logQuery('list_products', Date.now() - startTime, false)
  throw error
}
```

### Metrics Collection

**Key Metrics** (RED + Business):
- **Rate**: Requests per minute per operation
- **Errors**: Error rate and types
- **Duration**: P50, P95, P99 response times
- **Business**: Products created, variants added, categories updated

## Open Questions Resolved

All technical clarifications have been resolved through this research:

1. ✅ **Kysely Configuration**: Best practices documented
2. ✅ **GraphQL Code Generator**: Resolver files pattern selected
3. ✅ **Materialized Path**: Implementation strategy defined
4. ✅ **Soft Deletion**: Partial index approach confirmed
5. ✅ **Handle Generation**: Uniqueness algorithm specified
6. ✅ **Optimistic Locking**: updated_at timestamp approach
7. ✅ **Query Optimization**: Join patterns and compositions
8. ✅ **Testing Strategy**: Vitest with test containers

## References

- [Kysely Documentation](https://kysely.dev)
- [GraphQL Code Generator](https://the-guild.dev/graphql/codegen)
- [@eddeee888/gcg-typescript-resolver-files](https://www.graphql-code-generator.com/plugins/typescript/typescript-resolver-files)
- [Materialized Path Pattern](https://www.postgresql.org/docs/current/ltree.html)
- [Vitest Documentation](https://vitest.dev)
- [PostgreSQL Performance Tips](https://wiki.postgresql.org/wiki/Performance_Optimization)

## Next Phase

Proceed to **Phase 1: Design Artifacts**
- Generate data-model.md with complete database schema
- Create GraphQL contracts in contracts/ directory
- Write quickstart.md for developer onboarding

