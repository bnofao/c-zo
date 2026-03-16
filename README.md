# c-zo

Modular e-commerce platform built with TypeScript, Nitro, and GraphQL.

c-zo provides composable modules that can be assembled into different vertical products: marketplaces, delivery platforms, ticketing systems, and more.

## Quick Start

```bash
git clone https://github.com/bnofao/c-zo.git
cd c-zo
pnpm install

# Start PostgreSQL
docker compose -f docker-compose.dev.yml up -d

# Run migrations
cd packages/modules/auth && pnpm migrate:latest
cd ../stock-location && pnpm migrate:latest

# Start development
cd ../../..
pnpm dev:mazo
```

API available at `http://localhost:4000/api/graphql`.

## Architecture

```
apps/
  mazo/               # Nitro backend API server
  paiya/              # Next.js frontend (React 19)
  docs/               # Documentation site (Docusaurus)
packages/
  kit/                # Core toolkit (@czo/kit)
  modules/
    auth/             # Authentication & authorization
    stock-location/   # Physical inventory locations
  ui/                 # Shared React components
```

## Modules

| Module | Package | Description |
|--------|---------|-------------|
| Kit | [`@czo/kit`](packages/kit) | Core toolkit: database, GraphQL, IoC, events |
| Auth | [`@czo/auth`](packages/modules/auth) | Authentication, permissions, apps |
| Stock Location | [`@czo/stock-location`](packages/modules/stock-location) | Physical inventory locations |

## Documentation

Full documentation, API reference, and guides: **[docs.c-zo.dev](https://docs.c-zo.dev)**

## Development

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run all apps |
| `pnpm dev:mazo` | Backend API only |
| `pnpm build` | Build all packages |
| `pnpm test` | Run tests |
| `pnpm lint` | Lint all packages |
| `pnpm check-types` | Type-check all packages |

## License

[MIT](LICENSE.md)
