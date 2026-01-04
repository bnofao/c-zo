# Implementation Plan: Product Management Module

**Branch**: `001-product-management` | **Date**: 2025-11-02 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/001-product-management/spec.md`

## Summary

Implement a comprehensive product management module that handles products and their associated entities (categories, variants, collections, product types, tags, and options). The module will provide a GraphQL API layer built with GraphQL Code Generator, use Kysely for type-safe database queries against PostgreSQL, and follow the monorepo's modular architecture pattern. The existing module skeleton at `packages/modules/product` will be expanded to include full CRUD operations, hierarchical categories with adjacency list pattern, product variants with options, and comprehensive image management.

## Technical Context

**Language/Version**: TypeScript 5.x with strict mode enabled  
**Primary Dependencies**: 
- Kysely (PostgreSQL query builder with TypeScript support)
- GraphQL with @eddeee888/gcg-typescript-resolver-files (type-safe resolver generation)
- PostgreSQL 14+ (database with JSONB support)
- Nitro (module framework from @czo/kit)
- @adonisjs/fold (dependency injection container)

**Storage**: PostgreSQL with Kysely migrations for schema management  
**Testing**: Vitest for unit/integration tests, following TDD principles  
**Target Platform**: Node.js 20+ server environment (Nitro runtime)  
**Project Type**: Monorepo package (packages/modules/product)  
**Performance Goals**: 
- API P95 < 300ms for complex queries
- P95 < 150ms for simple CRUD operations
- Support 500 concurrent read operations
- Support 100 concurrent write operations

**Constraints**: 
- All API response times P95 < 300ms
- Category hierarchy queries < 500ms for 10 levels deep using recursive CTEs
- Must maintain ACID properties for all operations
- Soft deletion pattern required for all entities

**Scale/Scope**: 
- Support 100,000+ products
- Handle 1000+ categories in hierarchy
- 1000 req/min API throughput
- Multi-tenant capable (extensible metadata pattern)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

This feature must align with all constitution principles:

### ✓ I. Code Quality & Maintainability
- [x] TypeScript strict mode enabled (already configured in monorepo)
- [x] ESLint configuration applied (eslint.config.js present)
- [x] TSDoc comments for all public APIs (will be enforced in implementation)
- [x] No code duplication (shared logic in packages/, reusable query builders)

### ✓ II. Testing Standards (NON-NEGOTIABLE)
- [x] TDD approach documented in tasks (tests written before implementation)
- [x] Unit tests for business logic (services, validators, query builders)
- [x] Integration tests for API endpoints (GraphQL resolvers with test DB)
- [x] Contract tests for public package APIs (exported services and types)
- [x] E2E tests for critical user journeys (product creation with variants, category hierarchy)

### ✓ III. API-First Architecture
- [x] All APIs documented in spec (19 GraphQL operations defined)
- [x] GraphQL contracts defined (queries, mutations, types in schema.gql files)
- [x] Versioning strategy specified (v1 in API documentation)
- [x] Error handling defined (standard GraphQL error responses)

### ✓ IV. Modular Design
- [x] Feature belongs in appropriate package (packages/modules/product)
- [x] No circular dependencies introduced (module only depends on @czo/kit)
- [x] Inter-package dependencies explicit (peerDependencies in package.json)
- [x] Single, clear purpose (product management domain)

### ✓ V. UX Consistency
- [x] Uses shared UI component library (N/A - backend module only)
- [x] Follows design token standards (N/A - backend module only)
- [x] Loading, error, empty states defined (GraphQL error responses standardized)
- [x] Accessibility requirements met (N/A - backend module only)
- [x] Mobile-responsive design (N/A - backend module only)

### ✓ VI. Performance Requirements
- [x] API response time targets defined (P50, P95, P99 in spec)
- [x] Frontend performance metrics specified (N/A - backend module only)
- [x] Bundle size constraints documented (N/A - backend module only)
- [x] Scalability approach defined (horizontal scaling, connection pooling, caching strategy)

### ✓ VII. Security & Data Protection
- [x] Authentication/authorization requirements defined (JWT with admin role)
- [x] Input validation strategy documented (GraphQL schema validation + service layer)
- [x] Sensitive data protection specified (parameterized queries, metadata sanitization)
- [x] Audit logging requirements identified (created_at, updated_at, deleted_at tracking)

### ✓ VIII. Observability & Monitoring
- [x] Structured logging approach defined (JSON logs with context)
- [x] Key metrics identified (RED metrics: Rate, Errors, Duration for all operations)
- [x] Health check endpoints planned (database connectivity, migration status)
- [x] Alerting requirements specified (SLA violations, error rate thresholds)

## Project Structure

### Documentation (this feature)

```text
specs/001-product-management/
├── spec.md                     # Feature specification
├── plan.md                     # This file
├── research.md                 # Phase 0: Technology decisions and patterns
├── data-model.md              # Phase 1: Database schema and Kysely types
├── quickstart.md              # Phase 1: Developer setup guide
├── contracts/                  # Phase 1: GraphQL schema files
│   ├── schema.graphql         # Complete GraphQL schema
│   ├── products.graphql       # Product queries and mutations
│   ├── variants.graphql       # Variant operations
│   ├── categories.graphql     # Category operations
│   ├── options.graphql        # Product options operations
│   ├── collections.graphql    # Collection operations
│   ├── tags.graphql           # Tag operations
│   └── types.graphql          # Product types operations
├── checklists/
│   └── requirements.md        # Specification quality checklist
└── tasks.md                   # Phase 2: Implementation tasks (created by /speckit.tasks)
```

### Source Code (repository root)

```text
packages/modules/product/
├── package.json               # Module dependencies (Kysely, GraphQL)
├── tsconfig.json             # TypeScript configuration
├── build.config.ts           # Unbuild configuration
├── codegen.ts                # GraphQL Code Generator config
├── eslint.config.js          # ESLint rules
│
├── src/
│   ├── index.ts              # Module entry point (Nitro module definition)
│   │
│   ├── schema/               # GraphQL schema and resolvers
│   │   ├── product/
│   │   │   ├── schema.gql    # Product type definitions
│   │   │   └── resolvers/
│   │   │       ├── Query/    # Query resolvers
│   │   │       ├── Mutation/ # Mutation resolvers
│   │   │       └── Product.ts # Product field resolvers
│   │   │
│   │   ├── variant/
│   │   │   ├── schema.gql
│   │   │   └── resolvers/
│   │   │
│   │   ├── category/
│   │   │   ├── schema.gql
│   │   │   └── resolvers/
│   │   │
│   │   ├── option/
│   │   │   ├── schema.gql
│   │   │   └── resolvers/
│   │   │
│   │   ├── collection/
│   │   │   ├── schema.gql
│   │   │   └── resolvers/
│   │   │
│   │   ├── tag/
│   │   │   ├── schema.gql
│   │   │   └── resolvers/
│   │   │
│   │   ├── types.generated.ts      # Generated TypeScript types
│   │   ├── resolvers.generated.ts  # Generated resolver map
│   │   └── typeDefs.generated.ts   # Generated type definitions
│   │
│   ├── database/             # Kysely database layer
│   │   ├── connection.ts     # Database connection configuration
│   │   ├── types.ts          # Generated Kysely database types
│   │   ├── tables/           # Table-specific query builders
│   │   │   ├── products.ts
│   │   │   ├── variants.ts
│   │   │   ├── categories.ts
│   │   │   └── ...
│   │   └── queries/          # Reusable query compositions
│   │       ├── product-with-relations.ts
│   │       ├── category-tree.ts
│   │       └── variant-with-options.ts
│   │
│   ├── services/             # Business logic layer
│   │   ├── product.service.ts
│   │   ├── variant.service.ts
│   │   ├── category.service.ts
│   │   ├── option.service.ts
│   │   ├── collection.service.ts
│   │   ├── tag.service.ts
│   │   └── image.service.ts
│   │
│   ├── validators/           # Input validation
│   │   ├── product.validator.ts
│   │   ├── variant.validator.ts
│   │   └── category.validator.ts
│   │
│   ├── utils/                # Utility functions
│   │   ├── handle-generator.ts    # Generate URL-safe handles
│   │   ├── category-tree.ts       # Category tree building utilities
│   │   └── soft-delete.ts         # Soft deletion helpers
│   │
│   └── plugins/              # Nitro plugins
│       └── index.ts          # Plugin registration
│
├── migrations/               # Kysely migrations (managed with kysely-ctl)
│   ├── YYYYMMDDHHMMSS_create_products_table.ts
│   ├── YYYYMMDDHHMMSS_create_p_variants_table.ts
│   ├── YYYYMMDDHHMMSS_create_p_categories_table.ts
│   ├── YYYYMMDDHHMMSS_create_p_categories_products_table.ts
│   ├── YYYYMMDDHHMMSS_create_p_collections_table.ts
│   ├── YYYYMMDDHHMMSS_create_p_options_table.ts
│   ├── YYYYMMDDHHMMSS_create_p_option_values_table.ts
│   ├── YYYYMMDDHHMMSS_create_p_variants_options_table.ts
│   ├── YYYYMMDDHHMMSS_create_p_tags_table.ts
│   ├── YYYYMMDDHHMMSS_create_products_tags_table.ts
│   ├── YYYYMMDDHHMMSS_create_p_types_table.ts
│   ├── YYYYMMDDHHMMSS_create_images_table.ts
│   └── YYYYMMDDHHMMSS_create_products_images_table.ts
│
├── kysely.config.ts         # Kysely CLI configuration
│
└── tests/                    # Test files (co-located with TDD)
    ├── unit/
    │   ├── services/
    │   ├── validators/
    │   └── utils/
    ├── integration/
    │   └── resolvers/
    └── contract/
        └── api/
```

**Structure Decision**: This is a monorepo package module following the established pattern. The module uses:
1. **GraphQL Code Generator** (@eddeee888/gcg-typescript-resolver-files) for type-safe schema-first development
2. **Kysely** for type-safe database queries with migration support
3. **Nitro module pattern** for integration with the larger application framework
4. **Domain-driven organization** with separate folders for each entity (product, variant, category, etc.)
5. **Layered architecture**: GraphQL resolvers → Services → Database queries

## Complexity Tracking

> **No violations - all Constitution Check items pass**

This implementation follows all constitution principles without requiring exceptions:
- Modular design within existing packages/modules structure
- API-first with complete GraphQL schema documentation
- TDD approach with comprehensive test coverage
- Performance requirements clearly defined and achievable
- Security and observability built into the design

## Phase 0: Research & Decisions

**Status**: See [research.md](./research.md) for detailed technology decisions and patterns.

Key decisions documented:
1. Kysely configuration and best practices for PostgreSQL
2. GraphQL Code Generator setup with resolver files pattern
3. Adjacency list pattern for category hierarchies with recursive CTEs
4. Soft deletion implementation strategy
5. Handle generation and uniqueness constraints
6. Optimistic locking for concurrent updates
7. Query optimization patterns for complex relations
8. Testing strategy with Vitest and test containers

## Phase 1: Design Artifacts

**Status**: Design artifacts generated in this directory.

Generated files:
- [data-model.md](./data-model.md) - Complete database schema with Kysely types
- [contracts/](./contracts/) - GraphQL schema files for all operations
- [quickstart.md](./quickstart.md) - Developer setup and getting started guide

## Phase 2: Implementation Tasks

**Status**: Not yet created. Run `/speckit.tasks` to generate implementation task breakdown.

The task generation will create a prioritized, step-by-step implementation plan following TDD principles, breaking down the implementation into:
1. Database migrations for all tables
2. Kysely query builders and type generation
3. Service layer with business logic
4. GraphQL resolvers for each entity
5. Integration tests for all API operations
6. E2E tests for critical user journeys

## Dependencies & Integration Points

### Internal Dependencies
- **@czo/kit**: Core framework utilities (defineNitroModule, addPlugin, createResolver)
- **@czo/kit/graphql**: GraphQL registration utilities (registerResolvers, registerTypeDefs)

### External Dependencies
- **kysely**: ^0.27.0 - Type-safe SQL query builder
- **pg**: PostgreSQL client for Node.js
- **graphql**: ^16.8.0 - GraphQL.js reference implementation
- **@eddeee888/gcg-typescript-resolver-files**: GraphQL Code Generator preset

### Integration Requirements
1. **Database Connection**: Shared PostgreSQL connection pool from application layer
2. **Authentication Context**: JWT token validation and role extraction from @czo/kit
3. **File Storage**: Image upload service for handling product images (URL storage only in DB)
4. **Logging**: Structured logging integration with application logger
5. **Monitoring**: Metrics export for API performance tracking

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Complex category hierarchy queries | Medium | Use recursive CTEs with PostgreSQL, add proper indexes on parent_id, implement query caching |
| Variant-option relationships complexity | Medium | Clear service layer abstraction, comprehensive tests for combinations |
| Concurrent product updates | Medium | Implement optimistic locking with updated_at timestamps |
| Migration ordering for foreign keys | Low | Carefully ordered migrations with proper dependency management |
| GraphQL N+1 query problem | High | Use Kysely joins for relation loading, implement DataLoader pattern if needed |
| Handle uniqueness across soft deletes | Medium | Partial unique indexes with WHERE deleted_at IS NULL |

## Performance Strategy

### Database Optimization
1. **Indexes**: All foreign keys, handles, parent_id, deleted_at, status fields indexed
2. **Partial Indexes**: Unique constraints use `WHERE deleted_at IS NULL`
3. **JSONB Indexes**: GIN indexes on metadata fields for filtering
4. **Query Planning**: Use EXPLAIN ANALYZE for complex queries, especially recursive CTEs

### API Optimization
1. **Batch Loading**: Group related queries to avoid N+1 problems
2. **Selective Loading**: GraphQL field resolvers only fetch requested data
3. **Connection Pooling**: Kysely with pg pool configuration
4. **Query Caching**: Cache category hierarchy for read-heavy operations

### Scalability
1. **Horizontal Scaling**: Stateless services, connection pooling
2. **Read Replicas**: Separate read/write connections for high read volumes
3. **Caching Layer**: Redis for frequently accessed data (category trees, product listings)
4. **Pagination**: Cursor-based pagination for large result sets

## Security Considerations

### Input Validation
- GraphQL schema validation for type safety
- Service layer validation for business rules
- Metadata field sanitization to prevent injection

### Authorization
- All mutations require admin role verification
- Row-level security for multi-tenant scenarios
- Audit logging for all mutations

### Data Protection
- Parameterized queries via Kysely (SQL injection prevention)
- Soft deletion for audit trail and compliance
- JSONB metadata field input sanitization

## Migration Strategy

### Database Migrations
1. **Kysely CLI**: Migrations managed with kysely-ctl (timestamped for proper ordering)
2. **Rollback Support**: All migrations include down() functions
3. **Idempotency**: Migrations check for existence before creating
4. **Data Migration**: Separate migrations for schema vs. data changes
5. **Migration Commands**:
   - Create: `pnpm kysely-ctl migration:create migration_name`
   - Apply: `pnpm kysely-ctl migrate:latest`
   - Rollback: `pnpm kysely-ctl migrate:down`
   - Status: `pnpm kysely-ctl migrate:status`

### Deployment Strategy
1. **Zero-Downtime**: Migrations run before application deployment
2. **Backwards Compatibility**: New columns are nullable initially
3. **Validation**: Health check verifies migration completion
4. **Rollback Plan**: Down migrations tested in staging environment

## Next Steps

1. **Review this plan** with the team for technical approach validation
2. **Run `/speckit.tasks`** to generate detailed implementation tasks
3. **Set up development environment** following quickstart.md
4. **Begin TDD implementation** starting with migrations and data layer
5. **Iterate through priority layers**: Database → Services → GraphQL → Tests
