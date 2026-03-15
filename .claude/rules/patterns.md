# Project Patterns

## Module Structure

Each module in `packages/modules/` follows this layout:
- `src/database/schema.ts` — Drizzle ORM schema
- `src/graphql/schema/*/schema.graphql` — GraphQL type definitions
- `src/graphql/schema/*/resolvers/` — Resolver implementations
- `src/graphql/context-factory.ts` — GraphQL context with IoC services
- `src/services/` — Business logic services
- `src/plugins/index.ts` — Module plugin (IoC registration, boot hook)
- `migrations/` — Drizzle migration files

## GraphQL Codegen

After editing `.graphql` schema files, run `pnpm generate` from the module directory to regenerate resolver types.

## IoC Service Registration

Services are registered in module plugins and resolved from the container in GraphQL context:
- `useContainer()` to access the container
- Services available after `czo:boot` hook fires
