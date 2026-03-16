---
sidebar_position: 3
---

# GraphQL

`@czo/kit/graphql` provides the schema-first GraphQL infrastructure shared by all modules: type definition and resolver registration, context factory composition, and the `GraphQLContextMap` type that modules extend via declaration merging.

## Schema-First Workflow

1. Write `.graphql` files in `src/graphql/schema/<domain>/schema.graphql`.
2. Run `pnpm generate` from the module directory to regenerate resolver types from codegen.
3. Implement resolver functions in `src/graphql/schema/<domain>/resolvers/`.
4. Register types, resolvers, and context from the module plugin during `czo:boot`.

## Registration Functions

### registerTypeDefs

Adds a GraphQL `DocumentNode` or SDL string to the global type definitions list:

```typescript
import { registerTypeDefs } from '@czo/kit/graphql'
import typeDefs from './__generated__/typedefs.generated'

registerTypeDefs(typeDefs)
```

### registerResolvers

Adds a resolver map to the global resolver list. Scalar resolvers from `graphql-scalars` are pre-registered:

```typescript
import { registerResolvers } from '@czo/kit/graphql'
import resolvers from './__generated__/resolvers.generated'

registerResolvers(resolvers)
```

### registerContextFactory

Registers a factory function that contributes fields to the GraphQL context. Each registered factory is called on every request and its return value is shallow-merged into the context object:

```typescript
import { registerContextFactory } from '@czo/kit/graphql'

registerContextFactory('stock-location', async (_serverContext) => {
  const container = useContainer()
  return {
    stockLocation: {
      service: await container.make('stockLocation:service'),
    },
  }
})
```

## GraphQLContextMap Declaration Merging

Modules extend the `GraphQLContextMap` interface to add their context contributions with full type safety. Place the declaration in the module's `src/types.ts` or alongside the context factory:

```typescript
import type { StockLocationService } from './services/stock-location.service'

declare module '@czo/kit/graphql' {
  interface GraphQLContextMap {
    stockLocation: {
      service: StockLocationService
    }
  }
}
```

The resolver `_ctx` parameter is typed as `GraphQLContextMap`, so TypeScript will surface missing fields at compile time.

## Codegen Config Walkthrough

Each module has a `codegen.ts` at its root. Here is an annotated example from the `stock-location` module:

```typescript
import type { CodegenConfig } from '@graphql-codegen/cli'
import { defineConfig } from '@eddeee888/gcg-typescript-resolver-files'

const config: CodegenConfig = {
  schema: [
    // Kit base types (scalars, directives)
    '../../kit/src/graphql/base-types.graphql',
    '../../kit/src/graphql/filter-types.graphql',
    // Module-specific schemas
    'src/graphql/schema/**/*.graphql',
  ],
  generates: {
    'src/graphql/': defineConfig({
      mode: 'modules',
      // Output paths for generated files
      resolverTypesPath: './__generated__/types.generated.ts',
      typeDefsFilePath: './__generated__/typedefs.generated.ts',
      resolverMainFile: './__generated__/resolvers.generated.ts',
      resolverGeneration: 'recommended',
      // Map GraphQL types to TypeScript model types (avoids re-mapping)
      typesPluginsConfig: {
        contextType: '../../types#GraphQLContext',
        mappers: {
          StockLocation: '../../services/stock-location.service#StockLocationRow',
          StockLocationAddress: '../../services/stock-location.service#StockLocationAddressRow',
        },
        scalarsOverrides: {
          DateTime: { type: 'Date | string' },
          JSON: { type: 'Record<string, unknown> | null' },
        },
      },
    }),
  },
}

export default config
```

Run `pnpm generate` (or `pnpm run generate`) from the module directory after any `.graphql` change. Never hand-edit files inside `src/graphql/__generated__/`.
