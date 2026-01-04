# Product Management Module

Comprehensive product management module for the c-zo marketplace platform, providing GraphQL APIs for managing products, variants, categories, collections, tags, types, and images.

## Features

✅ **Products** (US1 - MVP)
- Full CRUD operations
- Soft deletion with audit trail
- Handle generation with uniqueness
- Optimistic locking for concurrent updates
- Metadata extensibility

✅ **Product Variants** (US2)
- Multiple variants per product
- Unique SKU, barcode, EAN, UPC enforcement
- Inventory management settings
- Physical dimensions and shipping info

✅ **Categories** (US3)
- Hierarchical category structure
- Adjacency list with recursive CTE queries
- Parent-child relationships
- Cycle prevention
- Many-to-many product associations

🔜 **Product Options** (US4)
- Variant dimensions (Color, Size, etc.)
- Option values management
- Variant-option associations

🔜 **Collections & Tags** (US5)
- Curated product collections
- Flexible tag-based filtering
- Many-to-many relationships

🔜 **Product Types** (US6)
- Type-based classification
- Type-specific business rules

🔜 **Images** (US7)
- Product and variant images
- Ranking and ordering
- Image-product-variant associations

## Tech Stack

- **Database**: PostgreSQL 14+ with Kysely query builder
- **API**: GraphQL with Code Generator
- **Testing**: Vitest with test containers
- **Language**: TypeScript 5.x (strict mode)
- **Runtime**: Nitro module

## Project Structure

```text
packages/modules/product/
├── src/
│   ├── database/           # Kysely database layer
│   │   ├── connection.ts   # DB connection
│   │   ├── types.ts        # Generated types
│   │   ├── tables/         # Query builders
│   │   └── queries/        # Query compositions
│   ├── services/           # Business logic
│   │   ├── product.service.ts
│   │   ├── variant.service.ts
│   │   ├── category.service.ts
│   │   ├── option.service.ts
│   │   ├── collection.service.ts
│   │   ├── tag.service.ts
│   │   ├── type.service.ts
│   │   └── image.service.ts
│   ├── validators/         # Input validation
│   ├── utils/              # Utilities
│   └── schema/             # GraphQL schema
│       ├── common/         # Scalars, common types
│       ├── product/        # Product schema + resolvers
│       ├── variant/        # Variant schema + resolvers
│       ├── category/       # Category schema + resolvers
│       ├── option/         # Option schema + resolvers
│       ├── collection/     # Collection schema + resolvers
│       ├── tag/            # Tag schema + resolvers
│       ├── type/           # Type schema + resolvers
│       └── image/          # Image schema + resolvers
├── migrations/             # Kysely migrations (13)
├── tests/                  # Test files
│   ├── unit/
│   ├── integration/
│   └── setup.ts
├── kysely.config.ts        # Kysely CLI config
└── vitest.config.ts        # Test configuration
```

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- pnpm

### Setup

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Configure environment** (`.env`):
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=czo_dev
   DB_USER=czo_user
   DB_PASSWORD=your_password
   ```

3. **Run migrations**:
   ```bash
   cd packages/modules/product
   pnpm migrate:latest
   ```

4. **Generate types**:
   ```bash
   pnpm generate:types  # Kysely types
   pnpm generate        # GraphQL types
   ```

5. **Run tests**:
   ```bash
   pnpm test
   ```

6. **Development mode**:
   ```bash
   pnpm dev
   ```

## Database Schema

13 tables with comprehensive relationships:
- `products` - Core product entity
- `p_variants` - Product variations
- `p_categories` - Hierarchical categories
- `p_options` / `p_option_values` - Variant options
- `p_collections` - Product collections
- `p_tags` - Product tags
- `p_types` - Product types
- `images` - Product images
- 5 junction tables for many-to-many relationships

All tables support:
- Soft deletion (`deleted_at`)
- Audit timestamps (`created_at`, `updated_at`)
- JSONB metadata for extensibility

## GraphQL API

### Queries

- `product(id)` - Get single product
- `products(filter, sort, pagination)` - List products
- `variant(id)` - Get single variant
- `category(id)` - Get single category
- `categoryTree(rootId)` - Get category hierarchy
- And more...

### Mutations

- `createProduct(input)` - Create product
- `updateProduct(id, input)` - Update product
- `deleteProduct(id)` - Soft-delete product
- `createProductVariant(productId, input)` - Add variant
- `createCategory(input)` - Create category
- `assignProductToCategories(productId, categoryIds)` - Assign categories
- And more...

All mutations require admin authentication.

## Testing

### Run Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage
pnpm test:coverage
```

### Test Structure

- **Unit Tests**: Services, validators, utilities
- **Integration Tests**: GraphQL resolvers with test DB
- **TDD Approach**: Tests written first, must fail before implementation

## Development

### Create a Migration

```bash
pnpm migrate:create migration_name
```

### Apply Migrations

```bash
pnpm migrate:latest
```

### Check Migration Status

```bash
pnpm migrate:status
```

### Rollback Migration

```bash
pnpm migrate:down
```

### Generate Types

```bash
pnpm generate:types  # From database
pnpm generate        # From GraphQL schema
```

## Architecture

**Layered Design**:
```
GraphQL Resolvers
      ↓
Services (Business Logic)
      ↓
Database Layer (Kysely)
      ↓
PostgreSQL
```

**Key Patterns**:
- Repository pattern with Kysely
- Service layer for business logic
- GraphQL resolver separation
- Dependency injection via context
- Test-driven development

## Performance

Target metrics (from specification):
- Simple product query: P95 < 100ms
- Product list (paginated): P95 < 250ms
- Category tree query: P95 < 500ms (10 levels deep)
- Product creation: P95 < 200ms

Optimizations:
- Indexed foreign keys
- Partial unique indexes for soft deletion
- Recursive CTEs for hierarchy queries
- Connection pooling
- Query result caching (planned)

## Security

- JWT authentication required for all mutations
- Admin role authorization
- Input validation at multiple layers
- Parameterized queries (SQL injection prevention)
- Metadata sanitization
- Audit logging via timestamps

## Contributing

1. Read the [specification](/specs/001-product-management/spec.md)
2. Check the [implementation plan](/specs/001-product-management/plan.md)
3. Follow the [task list](/specs/001-product-management/tasks.md)
4. Write tests first (TDD)
5. Implement features
6. Run tests and lint
7. Submit PR

## Documentation

- [Feature Specification](../../specs/001-product-management/spec.md)
- [Implementation Plan](../../specs/001-product-management/plan.md)
- [Research & Decisions](../../specs/001-product-management/research.md)
- [Data Model](../../specs/001-product-management/data-model.md)
- [GraphQL Contracts](../../specs/001-product-management/contracts/)
- [Quickstart Guide](../../specs/001-product-management/quickstart.md)
- [Task List](../../specs/001-product-management/tasks.md)

## Status

**Implemented**: User Stories 1-3 (Products, Variants, Categories)
**Pending**: User Stories 4-7 (Options, Collections/Tags, Types, Images)
**Requires Manual Steps**: Database setup, type generation

See [IMPLEMENTATION_NEXT_STEPS.md](./IMPLEMENTATION_NEXT_STEPS.md) for required manual steps.
See [IMPLEMENTATION_PROGRESS.md](./IMPLEMENTATION_PROGRESS.md) for detailed progress.

## License

MIT

