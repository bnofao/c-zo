# Quickstart Guide: Product Management Module

**Date**: 2025-11-02  
**Feature**: Product Management Module  
**Plan**: [plan.md](./plan.md)

## Overview

This guide will help you set up, understand, and start working on the product management module. The module provides a comprehensive GraphQL API for managing products, variants, categories, collections, tags, types, and images.

## Prerequisites

Before starting, ensure you have:

- **Node.js**: Version 20.0.0 or higher
- **pnpm**: Latest version (workspace package manager)
- **PostgreSQL**: Version 14 or higher
- **Git**: For version control
- **Editor**: VS Code or similar with TypeScript support

## Project Structure

```text
packages/modules/product/
├── package.json              # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── build.config.ts          # Unbuild configuration
├── codegen.ts               # GraphQL Code Generator config
├── eslint.config.js         # ESLint rules
│
├── src/
│   ├── index.ts             # Module entry point
│   ├── schema/              # GraphQL schema and resolvers
│   ├── database/            # Kysely database layer (to be created)
│   ├── services/            # Business logic layer (to be created)
│   ├── validators/          # Input validation (to be created)
│   ├── utils/               # Utility functions (to be created)
│   └── plugins/             # Nitro plugins
│
├── migrations/              # Kysely database migrations (to be created)
└── tests/                   # Test files (to be created)
```

## Initial Setup

### 1. Install Dependencies

From the repository root:

```bash
# Install all dependencies for the entire monorepo
pnpm install
```

The product module uses these key dependencies:
- **kysely**: Type-safe SQL query builder
- **kysely-ctl**: CLI tool for managing Kysely migrations
- **kysely-codegen**: Generate TypeScript types from database schema
- **graphql-codegen**: Generate TypeScript types from GraphQL schema

### 2. Configure Kysely CLI

Create a `kysely.config.ts` file in the product module (if not already present):

```typescript
// packages/modules/product/kysely.config.ts
import { defineConfig } from 'kysely-ctl'
import { PostgresDialect } from 'kysely'
import { Pool } from 'pg'

export default defineConfig({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'czo_dev',
      user: process.env.DB_USER || 'czo_user',
      password: process.env.DB_PASSWORD,
    })
  }),
  migrations: {
    migrationFolder: './migrations'
  }
})
```

### 3. Database Setup

Create a PostgreSQL database for development:

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE czo_dev;

# Create user (if needed)
CREATE USER czo_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE czo_dev TO czo_user;

# Exit psql
\q
```

### 4. Environment Configuration

Create or update `.env` file in the repository root:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=czo_dev
DB_USER=czo_user
DB_PASSWORD=your_password

# Application
NODE_ENV=development
```

### 5. Run Database Migrations

Once migrations are created, run them using kysely-ctl:

```bash
# Navigate to the product module
cd packages/modules/product

# Run all pending migrations
pnpm kysely-ctl migrate:latest

# Check migration status
pnpm kysely-ctl migrate:status

# Or use npm scripts if configured in package.json
pnpm run migrate:latest
```

## Kysely CLI Commands

Here are the most useful kysely-ctl commands:

```bash
# Create a new migration
pnpm kysely-ctl migration:create migration_name

# Run all pending migrations
pnpm kysely-ctl migrate:latest

# Run next migration
pnpm kysely-ctl migrate:up

# Rollback last migration
pnpm kysely-ctl migrate:down

# Check migration status
pnpm kysely-ctl migrate:status

# Rollback all migrations
pnpm kysely-ctl migrate:down --all

# Run specific migration to a target
pnpm kysely-ctl migrate:to 001_migration_name
```

**Recommended package.json scripts**:
```json
{
  "scripts": {
    "migrate:create": "kysely-ctl migration:create",
    "migrate:latest": "kysely-ctl migrate:latest",
    "migrate:up": "kysely-ctl migrate:up",
    "migrate:down": "kysely-ctl migrate:down",
    "migrate:status": "kysely-ctl migrate:status",
    "generate:types": "kysely-codegen --dialect postgres --out-file src/database/types.ts"
  }
}
```

## Development Workflow

### Running the Module

```bash
# Development mode with watch
cd packages/modules/product
pnpm run dev

# Build for production
pnpm run build
```

### GraphQL Code Generation

After making changes to `.gql` schema files:

```bash
cd packages/modules/product
pnpm run generate
```

This will regenerate:
- `src/schema/types.generated.ts` - TypeScript types
- `src/schema/resolvers.generated.ts` - Resolver map
- `src/schema/typeDefs.generated.ts` - Type definitions

### Running Tests

```bash
cd packages/modules/product

# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage
pnpm run test:coverage
```

### Linting and Formatting

```bash
cd packages/modules/product

# Lint code
pnpm run lint

# Fix linting issues
pnpm run lint:fix
```

## Architecture Overview

### Layered Architecture

```text
GraphQL Layer (Resolvers)
         ↓
  Service Layer (Business Logic)
         ↓
 Database Layer (Kysely Queries)
         ↓
    PostgreSQL Database
```

### Key Components

#### 1. GraphQL Schema (`src/schema/`)

Organized by domain entity:

```text
src/schema/
├── product/
│   ├── schema.gql          # Product types and operations
│   └── resolvers/
│       ├── Query/
│       │   ├── product.ts
│       │   └── products.ts
│       ├── Mutation/
│       │   ├── createProduct.ts
│       │   ├── updateProduct.ts
│       │   └── deleteProduct.ts
│       └── Product.ts       # Field resolvers
├── variant/
│   ├── schema.gql
│   └── resolvers/
└── ... (other entities)
```

#### 2. Database Layer (`src/database/`)

Type-safe queries with Kysely:

```typescript
// database/connection.ts
import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import type { Database } from './types'

export function getDatabase(): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      })
    })
  })
}
```

#### 3. Service Layer (`src/services/`)

Business logic and validation:

```typescript
// services/product.service.ts
export class ProductService {
  constructor(private db: Kysely<Database>) {}
  
  async createProduct(input: CreateProductInput): Promise<Product> {
    // Validation
    validateProductInput(input)
    
    // Handle generation
    const handle = await generateUniqueHandle('products', input.title)
    
    // Database operations
    return this.db.transaction().execute(async (trx) => {
      const product = await trx
        .insertInto('products')
        .values({ ...input, handle })
        .returningAll()
        .executeTakeFirstOrThrow()
      
      // Handle relations (categories, tags)
      if (input.categoryIds) {
        await this.assignCategories(trx, product.id, input.categoryIds)
      }
      
      return product
    })
  }
}
```

#### 4. GraphQL Resolvers (`src/schema/*/resolvers/`)

Thin layer connecting GraphQL to services:

```typescript
// schema/product/resolvers/Mutation/createProduct.ts
import type { MutationResolvers } from '../../../types.generated'

export const createProduct: MutationResolvers['createProduct'] = async (
  _parent,
  { input },
  context
) => {
  try {
    // Auth check
    if (!context.user || context.user.role !== 'admin') {
      return {
        errors: [{
          code: 'FORBIDDEN',
          message: 'Admin access required'
        }]
      }
    }
    
    // Call service
    const product = await context.services.product.createProduct(input)
    
    return { product }
  } catch (error) {
    return {
      errors: [{
        code: 'INTERNAL_ERROR',
        message: error.message
      }]
    }
  }
}
```

## Test-Driven Development (TDD)

### TDD Workflow

1. **Write Test First (Red Phase)**
   ```typescript
   // tests/unit/services/product.service.test.ts
   describe('ProductService', () => {
     it('should create product with auto-generated handle', async () => {
       const service = new ProductService(testDb)
       
       const product = await service.createProduct({
         title: 'Test Product',
         status: 'draft'
       })
       
       expect(product.handle).toBe('test-product')
       expect(product.status).toBe('draft')
     })
   })
   ```

2. **Run Test (Should Fail)**
   ```bash
   pnpm run test
   # Test should fail since implementation doesn't exist yet
   ```

3. **Implement Feature (Green Phase)**
   ```typescript
   // services/product.service.ts
   async createProduct(input) {
     const handle = slugify(input.title, { lower: true, strict: true })
     return this.db
       .insertInto('products')
       .values({ ...input, handle })
       .returningAll()
       .executeTakeFirstOrThrow()
   }
   ```

4. **Run Test Again (Should Pass)**
   ```bash
   pnpm run test
   # Test should now pass
   ```

5. **Refactor (Refactor Phase)**
   - Improve code quality
   - Extract reusable functions
   - Optimize performance
   - Tests should still pass

### Test Organization

```text
tests/
├── unit/                    # Isolated unit tests
│   ├── services/
│   │   ├── product.service.test.ts
│   │   └── category.service.test.ts
│   ├── utils/
│   │   ├── handle-generator.test.ts
│   │   └── category-tree.test.ts
│   └── validators/
│       └── product.validator.test.ts
│
├── integration/             # Database + service integration
│   └── resolvers/
│       ├── product.resolver.test.ts
│       └── category.resolver.test.ts
│
├── contract/                # Public API contract tests
│   └── api/
│       └── graphql.contract.test.ts
│
└── setup.ts                 # Test configuration
```

### Test Setup with Test Containers

```typescript
// tests/setup.ts
import { beforeAll, afterAll } from 'vitest'
import { GenericContainer } from 'testcontainers'
import { Kysely } from 'kysely'

let postgresContainer: StartedTestContainer
let testDb: Kysely<Database>

beforeAll(async () => {
  // Start PostgreSQL container
  postgresContainer = await new GenericContainer('postgres:14')
    .withExposedPorts(5432)
    .withEnvironment({
      POSTGRES_DB: 'test',
      POSTGRES_PASSWORD: 'test'
    })
    .start()
  
  // Create database connection
  testDb = createTestDatabase(postgresContainer)
  
  // Run migrations
  await migrateToLatest(testDb)
}, 60000) // 60s timeout for container startup

afterAll(async () => {
  await testDb.destroy()
  await postgresContainer.stop()
})

export { testDb }
```

## Common Tasks

### Adding a New Entity

1. **Create migration**
   ```bash
   cd packages/modules/product
   # Create new migration using kysely-ctl
   pnpm kysely-ctl migration:create create_new_entity_table
   # This will generate: migrations/YYYYMMDDHHMMSS_create_new_entity_table.ts
   ```

2. **Define schema**
   
   Edit the generated migration file:
   ```typescript
   // migrations/YYYYMMDDHHMMSS_create_new_entity_table.ts
   import { Kysely, sql } from 'kysely'
   
   export async function up(db: Kysely<any>): Promise<void> {
     await db.schema
       .createTable('new_entity')
       .addColumn('id', 'text', col => col.primaryKey())
       .addColumn('name', 'text', col => col.notNull())
       .addColumn('created_at', 'timestamp', col => 
         col.notNull().defaultTo(sql`now()`)
       )
       .execute()
   }
   
   export async function down(db: Kysely<any>): Promise<void> {
     await db.schema.dropTable('new_entity').execute()
   }
   ```

3. **Run migration**
   ```bash
   # Apply the migration
   pnpm kysely-ctl migrate:latest
   
   # Or use the npm script if configured
   pnpm run migrate:latest
   ```

4. **Generate types**
   ```bash
   # Generate Kysely types from database
   pnpm kysely-codegen --dialect postgres --out-file src/database/types.ts
   
   # Or use the npm script if configured
   pnpm run generate:types
   ```

5. **Verify migration was applied**
   ```bash
   # Check migration status
   pnpm kysely-ctl migrate:status
   
   # Verify table exists in database
   psql -U czo_user -d czo_dev -c "\d new_entity"
   ```

6. **Create GraphQL schema**
   ```graphql
   # src/schema/new-entity/schema.gql
   type NewEntity {
     id: ID!
     name: String!
     createdAt: DateTime!
   }
   
   extend type Query {
     newEntity(id: ID!): NewEntity
   }
   
   extend type Mutation {
     createNewEntity(name: String!): NewEntity!
   }
   ```

7. **Generate GraphQL types**
   ```bash
   pnpm run generate
   ```

8. **Implement service**
   ```typescript
   // src/services/new-entity.service.ts
   export class NewEntityService {
     async createNewEntity(name: string) {
       return this.db
         .insertInto('new_entity')
         .values({ id: generateId(), name })
         .returningAll()
         .executeTakeFirstOrThrow()
     }
   }
   ```

9. **Implement resolvers**
   ```typescript
   // src/schema/new-entity/resolvers/Mutation/createNewEntity.ts
   export const createNewEntity: MutationResolvers['createNewEntity'] = 
     async (_parent, { name }, context) => {
       return context.services.newEntity.createNewEntity(name)
     }
   ```

10. **Write tests**
   ```typescript
   // tests/unit/services/new-entity.service.test.ts
   describe('NewEntityService', () => {
     it('should create new entity', async () => {
       const service = new NewEntityService(testDb)
       const entity = await service.createNewEntity('Test')
       expect(entity.name).toBe('Test')
     })
   })
   ```

### Debugging Tips

#### Enable Query Logging

```typescript
// database/connection.ts
const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
  log: (event) => {
    if (event.level === 'query') {
      console.log('SQL:', event.query.sql)
      console.log('Parameters:', event.query.parameters)
    }
  }
})
```

#### GraphQL Playground

Access GraphQL playground (if configured):
```
http://localhost:3000/graphql
```

#### Database Inspection

```bash
# Connect to database
psql -U czo_user -d czo_dev

# List tables
\dt

# Describe table structure
\d products

# Run query
SELECT * FROM products WHERE deleted_at IS NULL;
```

## Performance Optimization

### Query Optimization

1. **Use Joins Instead of Multiple Queries**
   ```typescript
   // Bad: N+1 query problem
   const products = await db.selectFrom('products').selectAll().execute()
   for (const product of products) {
     product.variants = await db
       .selectFrom('p_variants')
       .where('product_id', '=', product.id)
       .execute()
   }
   
   // Good: Single query with join
   const products = await db
     .selectFrom('products')
     .leftJoin('p_variants', 'p_variants.product_id', 'products.id')
     .select([
       'products.id',
       'products.title',
       db.fn.count('p_variants.id').as('variant_count')
     ])
     .groupBy('products.id')
     .execute()
   ```

2. **Select Only Needed Columns**
   ```typescript
   // Bad: Select all columns
   const products = await db
     .selectFrom('products')
     .selectAll()
     .execute()
   
   // Good: Select specific columns
   const products = await db
     .selectFrom('products')
     .select(['id', 'title', 'handle', 'status'])
     .execute()
   ```

3. **Use Indexes**
   ```typescript
   // Ensure WHERE clauses use indexed columns
   await db
     .selectFrom('products')
     .selectAll()
     .where('handle', '=', 'laptop-x1')  // handle is indexed
     .where('deleted_at', 'is', null)    // deleted_at is indexed
     .execute()
   ```

### Caching Strategy

```typescript
// Simple in-memory cache for category tree
const cache = new Map()

async function getCategoryTreeCached(rootId: string) {
  const cacheKey = `category_tree:${rootId}`
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)
  }
  
  const tree = await getCategoryTree(rootId)
  cache.set(cacheKey, tree)
  
  // Expire after 5 minutes
  setTimeout(() => cache.delete(cacheKey), 5 * 60 * 1000)
  
  return tree
}
```

## Troubleshooting

### Common Issues

**Issue**: Migration fails with "relation already exists"
```bash
# Solution: Check migration status
pnpm kysely-ctl migrate:status

# Rollback last migration if needed
pnpm kysely-ctl migrate:down

# Or use npm scripts if configured
pnpm run migrate:status
pnpm run migrate:down
```

**Issue**: GraphQL types not updating
```bash
# Solution: Regenerate types
pnpm run generate

# If still issues, delete generated files and regenerate
rm src/schema/*.generated.ts
pnpm run generate
```

**Issue**: Database connection fails
```bash
# Solution: Verify PostgreSQL is running
pg_isready -h localhost -p 5432

# Check environment variables
echo $DB_HOST $DB_PORT $DB_NAME
```

**Issue**: Tests failing with "database locked"
```bash
# Solution: Ensure tests run in isolation
# Each test should use a separate database or transaction
```

## Resources

### Documentation

- **Kysely**: https://kysely.dev
- **GraphQL Code Generator**: https://the-guild.dev/graphql/codegen
- **Vitest**: https://vitest.dev
- **PostgreSQL**: https://www.postgresql.org/docs/

### Internal Resources

- [Feature Specification](./spec.md)
- [Implementation Plan](./plan.md)
- [Research & Decisions](./research.md)
- [Data Model](./data-model.md)
- [GraphQL Contracts](./contracts/)

### Getting Help

- **Team Slack**: #product-module channel
- **Code Reviews**: Create PR and request review
- **Documentation**: Update docs as you learn

## Next Steps

1. **Read the specification**: Understand requirements in [spec.md](./spec.md)
2. **Review the plan**: Check implementation approach in [plan.md](./plan.md)
3. **Set up environment**: Follow this quickstart guide
4. **Generate tasks**: Run `/speckit.tasks` to get implementation tasks
5. **Start with TDD**: Write tests first, then implement features
6. **Iterate**: Build incrementally, test continuously

## Development Best Practices

### Code Style

- Follow TypeScript strict mode
- Use ESLint rules from monorepo
- Write TSDoc comments for public APIs
- Keep functions small and focused

### Git Workflow

```bash
# Feature branch naming
git checkout -b feat/product-variants

# Commit message format (conventional commits)
git commit -m "feat(product): add variant creation service"
git commit -m "test(product): add tests for variant service"
git commit -m "docs(product): update API documentation"

# Push and create PR
git push origin feat/product-variants
```

### Pull Request Checklist

- [ ] All tests pass
- [ ] Code follows ESLint rules
- [ ] TSDoc comments for public APIs
- [ ] Integration tests for new features
- [ ] Updated documentation
- [ ] No console.log statements
- [ ] Performance considerations addressed

---

**Welcome to the Product Management Module!** 🚀

Start building and don't hesitate to ask questions or suggest improvements.

