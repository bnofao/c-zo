---
sidebar_position: 1
---

# Kit Overview

`@czo/kit` is the foundational toolkit for building c-zo modules. It provides the database layer (Drizzle ORM + Repository pattern), GraphQL registration helpers, IoC container, event bus, cache, queue, and telemetry utilities — all exposed through focused subpath exports so each module only imports what it needs.

## Subpath Exports

| Import path | Description |
|---|---|
| `@czo/kit` | Root export: logger, shared types, Nitro augmentations (`NitroRuntimeHooks`, `NitroRuntimeConfig`) |
| `@czo/kit/db` | Database manager (`useDatabase`), `Repository` base class, schema registry, migrations |
| `@czo/kit/graphql` | Schema-first GraphQL helpers: `registerTypeDefs`, `registerResolvers`, `registerContextFactory`, `GraphQLContextMap` |
| `@czo/kit/ioc` | IoC container: `useContainer`, `ContainerBindings` interface |
| `@czo/kit/event-bus` | Domain event bus: `EventMap`, `createDomainEvent`, `useHookable`, `useMessageBroker` |
| `@czo/kit/cache` | Cache utilities |
| `@czo/kit/queue` | BullMQ / queue utilities |
| `@czo/kit/telemetry` | OpenTelemetry integration and correlation ID helpers |
| `@czo/kit/nitro` | Nitro-specific helpers (module resolver, plugin registration) |

## How Modules Depend on Kit

Every module in `packages/modules/` lists `@czo/kit` as a dependency and imports from its subpaths:

```typescript
import { useLogger } from '@czo/kit'
import { useDatabase, registerSchema, Repository } from '@czo/kit/db'
import { registerTypeDefs, registerResolvers, registerContextFactory } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'
import { createDomainEvent, useHookable } from '@czo/kit/event-bus'
```

The root `@czo/kit` export also augments Nitro's type system with the three lifecycle hooks (`czo:init`, `czo:register`, `czo:boot`) and runtime config extensions (`database.url`, `rabbitmq`, `telemetry`, etc.) that all modules rely on.
