# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

c-zo is a modular e-commerce platform built with:
- **Nitro** as the backend server framework (apps/mazo)
- **Next.js** for the frontend (apps/paiya)
- **GraphQL** for API layer (graphql-yoga)
- **Drizzle ORM** for type-safe PostgreSQL queries
- **pnpm workspaces** with Turborepo for monorepo management

## Commands

```bash
# Development
pnpm dev                    # Run all apps in watch mode
pnpm dev:mazo               # Run backend API only
pnpm build                  # Build all packages
pnpm lint                   # Lint all packages
pnpm lint:fix               # Fix lint issues
pnpm test                   # Run tests with vitest

# Package-specific (from package directory)
pnpm build                  # Build package (unbuild)
pnpm lint                   # Lint with eslint
pnpm lint:fix               # Fix lint issues

# Product module (packages/modules/product)
pnpm migrate:latest         # Run all pending migrations
pnpm migrate:create <name>  # Create new migration
pnpm migrate:status         # Check migration status
pnpm generate:types         # Generate Drizzle types from database
pnpm generate               # Generate GraphQL resolver types
pnpm test                   # Run tests
pnpm test:watch             # Run tests in watch mode
```

## Architecture

### Monorepo Structure

```
apps/
  mazo/               # Nitro backend API server
  paiya/              # Next.js frontend (React 19)
packages/
  kit/                # Core toolkit (@czo/kit)
    - Module system (defineNitroModule)
    - IoC container
    - Database utilities (Drizzle ORM)
    - GraphQL helpers
    - CLI commands
  modules/
    product/          # Product management module (@czo/product)
    attribute/        # Attribute module
    auth/             # Authentication module
  ui/                 # Shared React components (@workspace/ui)
  eslint-config/      # Shared ESLint configurations
  typescript-config/  # Shared TypeScript configurations
```

### Module System

Modules extend Nitro using `defineNitroModule` from `@czo/kit`:

```typescript
import { defineNitroModule, createResolver, addPlugin } from '@czo/kit'

export default defineNitroModule({
  name: 'module-name',
  setup: (nitro) => {
    const resolver = createResolver(import.meta.url)
    addPlugin(resolver.resolve('./plugins/index'), nitro)
  }
})
```

Modules are registered in `apps/mazo/nitro.config.ts`.

### Database Layer

- Uses **Drizzle ORM** for type-safe SQL queries
- Migrations in `packages/modules/*/migrations/`
- Connection via `DATABASE_URL` environment variable
- Schema definitions in `src/database/schema.ts` per module

### GraphQL

- Schema-first development with `.gql` files in `src/schema/*/`
- Uses `@eddeee888/gcg-typescript-resolver-files` for codegen
- Resolvers auto-generated from schema
- Context includes services from IoC container

### Dependency Injection

IoC container from `@adonisjs/fold` is available:
- `useContainer()` - Get container instance
- Services registered via module plugins
- Boot hook: `czo:boot` for runtime initialization

## Key Conventions

- **TypeScript strict mode** enabled throughout
- **Soft deletion** pattern - entities have `deletedAt` field
- **Optimistic locking** - entities have `version` field
- **Handle generation** - URL-safe slugs auto-generated from titles
- **pnpm catalogs** - dependency versions defined in `pnpm-workspace.yaml`

## Environment Variables

Create `.env` in repository root or `packages/.env`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/czo_dev
NODE_ENV=development
```

## Docker Development

```bash
docker compose -f docker-compose.dev.yml up
```

Provides PostgreSQL 17 on port 5432.

## Rule: always use qmd before reading files

Before reading files or exploring directories, always use qmd to search for information in local projects.

Available tools:
- `qmd search “query”` — fast keyword search (BM25)
- `qmd query “query”` — hybrid search with reranking (best quality)
- `qmd vsearch “query”` — semantic vector search
- `qmd get <file>` — retrieve a specific document

Use qmd search for quick lookups and qmd query for complex questions.

Use Read/Glob only if qmd doesn’t return enough results.

Once this is in place, Claude will always search the index first. It will only fall back to reading full files when it genuinely can’t find what it needs through the

index.
