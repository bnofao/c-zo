---
sidebar_position: 4
---

# IoC Container

`@czo/kit/ioc` exposes a lightweight inversion-of-control container built on [`@adonisjs/fold`](https://github.com/adonisjs/fold). It is the primary mechanism for sharing services between modules without creating hard import dependencies.

## Container Access

`useContainer()` returns the singleton container instance. It is safe to call at module load time; the container itself is available immediately, but services are only resolvable after they have been bound.

```typescript
import { useContainer } from '@czo/kit/ioc'

const container = useContainer()
```

## Binding Services

Bind services as singletons inside the `czo:boot` hook so they are available when other modules start resolving dependencies:

```typescript
nitroApp.hooks.hook('czo:boot', async () => {
  const container = useContainer()
  const db = await useDatabase()

  const service = createStockLocationService(db)
  container.singleton('stockLocation:service', () => service)
})
```

`container.singleton(key, factory)` calls the factory once on first resolve and caches the result. The factory may be synchronous or return a `Promise`.

## Resolving Services

Use `container.make(key)` to resolve a bound service. It always returns a `Promise`:

```typescript
const service = await container.make('stockLocation:service')
```

Resolving a key that has not been bound yet throws an error, which is why all resolution happens inside or after `czo:boot`.

## Type Safety via ContainerBindings

Extend the `ContainerBindings` interface to get typed `container.make()` calls:

```typescript
import type { StockLocationService } from '@czo/stock-location/services'

declare module '@czo/kit/ioc' {
  interface ContainerBindings {
    'stockLocation:service': StockLocationService
  }
}
```

With this declaration in place, TypeScript infers the return type of `container.make('stockLocation:service')` as `Promise<StockLocationService>` without a manual cast.

The built-in bindings pre-declared in `@czo/kit/ioc` are:

| Key | Type | Description |
|---|---|---|
| `config` | `NitroRuntimeConfig` | Resolved Nitro runtime config |
| `useStorage` | `typeof useStorage` | Nitro storage accessor |

## Lifecycle

Services registered in `czo:boot` are only available after that hook fires. The three hooks run in order:

1. `czo:init` — schema and relation registration, lightweight setup.
2. `czo:register` — domain registration (access rules, actor types).
3. `czo:boot` — database connection, service instantiation, container binding.

Never call `container.make()` for application services before `czo:boot` completes.
