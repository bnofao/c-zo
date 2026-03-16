---
sidebar_position: 1
---

# Introduction

**c-zo** is a modular e-commerce platform designed to be composed into different vertical products — marketplaces, delivery services, ticketing systems, and beyond. Rather than shipping a monolithic suite, c-zo provides a collection of focused, self-contained modules that teams can adopt incrementally and combine freely.

## What makes c-zo different

Most e-commerce platforms lock you into their data model and deployment topology. c-zo takes the opposite approach: every capability is a module with its own schema, service, and GraphQL API. You own the composition.

## Core Principles

| Principle | Description |
|-----------|-------------|
| **Modular architecture** | Each feature lives in its own package under `packages/modules/`. Modules communicate through typed events and a shared IoC container, never by importing each other's internals. |
| **Schema-first GraphQL** | `.graphql` files are the source of truth. TypeScript resolver types are generated from them — you never write a type by hand. |
| **Type-safe database** | Drizzle ORM provides a fully-typed query builder. No raw SQL strings; no magic string column names. |
| **Event-driven** | Modules publish domain events (`stockLocation.location.created`, etc.) that other modules can subscribe to without creating hard dependencies. |
| **IoC container** | Services are registered into and resolved from an AdonisJS Fold container. Modules extend the container's type declarations so call-sites are fully typed. |

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Backend server | [Nitro](https://nitro.unjs.io) | HTTP server, plugins, hooks lifecycle |
| Frontend | [Next.js 19](https://nextjs.org) | React app (`apps/paiya`) |
| API | [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) | Schema stitching, query execution |
| Database | PostgreSQL 17 + [Drizzle ORM](https://orm.drizzle.team) | Type-safe queries and migrations |
| Monorepo | [pnpm workspaces](https://pnpm.io/workspaces) + [Turborepo](https://turbo.build) | Workspace management, caching |

## Project Structure

```
apps/
  mazo/          # Nitro backend API server — registers all modules
  paiya/         # Next.js frontend (React 19)
  docs/          # This Docusaurus documentation site

packages/
  kit/           # @czo/kit — core toolkit: module system, IoC, DB, GraphQL, CLI
  modules/
    auth/        # @czo/auth — authentication and authorization
    stock-location/  # @czo/stock-location — physical inventory locations
  ui/            # @workspace/ui — shared React components
  eslint-config/ # Shared ESLint configuration
  typescript-config/  # Shared TypeScript configuration
```

## Next Steps

- [Getting Started](./getting-started) — clone the repo, start the server, and run your first query
- [Architecture](./architecture) — understand how modules, the database layer, and GraphQL fit together
- [Creating a Module](./creating-a-module) — step-by-step tutorial using `@czo/stock-location` as the example
