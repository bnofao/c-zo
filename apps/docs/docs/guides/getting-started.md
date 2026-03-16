---
sidebar_position: 2
---

# Getting Started

This guide walks you through cloning the repository, starting the database, running migrations, and launching the development server.

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 20+ |
| pnpm | 10+ |
| Docker | Any recent version |

## 1. Clone and install

```bash
git clone https://github.com/bnofao/czo.git
cd czo
pnpm install
```

pnpm will install all workspace dependencies and link local packages automatically.

## 2. Start PostgreSQL

The repository ships a Docker Compose file for local development:

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts **PostgreSQL 17** on port **5432**.

## 3. Configure environment variables

Create a `.env` file in the repository root:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/czo_dev
NODE_ENV=development
```

You can also place this file at `packages/.env` — both locations are picked up automatically.

## 4. Run database migrations

Each module manages its own migrations. Run them from the module directory:

```bash
# Auth module
cd packages/modules/auth
pnpm migrate:latest

# Stock location module
cd packages/modules/stock-location
pnpm migrate:latest
```

To check migration status without applying anything:

```bash
pnpm migrate:status
```

## 5. Start the development server

From the repository root:

```bash
pnpm dev:mazo
```

This starts the Nitro backend with hot-reload enabled. You should see output similar to:

```
Nitro server started on http://localhost:4000
```

## 6. Verify the setup

Open your browser or any GraphQL client and navigate to:

```
http://localhost:4000/api/graphql
```

The GraphQL playground lets you explore the schema and execute queries interactively.

## Common Commands

| Command | From | Description |
|---------|------|-------------|
| `pnpm dev` | root | Run all apps in watch mode |
| `pnpm dev:mazo` | root | Run backend API only |
| `pnpm build` | root | Build all packages |
| `pnpm test` | root | Run all tests with vitest |
| `pnpm lint` | root | Lint all packages |
| `pnpm lint:fix` | root | Auto-fix lint issues |
| `pnpm check-types` | root | Type-check all packages |
| `pnpm generate` | module dir | Regenerate GraphQL resolver types |
| `pnpm migrate:create <name>` | module dir | Create a new migration |
| `pnpm migrate:latest` | module dir | Apply all pending migrations |
