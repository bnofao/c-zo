import { Access } from '@czo/auth/services'
import { useLogger } from '@czo/kit'
import { registerSchema as registerDbSchema, registerRelations } from '@czo/kit/db'
import { registerEffectLayer, runEffect, useRuntime } from '@czo/kit/effect'
import { registerSchema as registerGraphQLSchema } from '@czo/kit/graphql'
import { registerStockLocationSchema } from '@czo/stock-location/graphql'
import { StockLocationModuleLive } from '@czo/stock-location/services'
import { stockLocationRelations } from '@czo/stock-location/relations'
import * as stockLocationSchema from '@czo/stock-location/schema'
import { Effect } from 'effect'
import { definePlugin } from 'nitro'

const STOCK_LOCATION_STATEMENTS = {
  'stock-location': ['create', 'read', 'update', 'delete'],
} as const

const STOCK_LOCATION_HIERARCHY: Access.HierarchyLevel<typeof STOCK_LOCATION_STATEMENTS>[] = [
  { name: 'member', permissions: { 'stock-location': ['read'] } },
  { name: 'manager', permissions: { 'stock-location': ['create', 'read', 'update'] } },
  { name: 'owner', permissions: { 'stock-location': ['create', 'read', 'update', 'delete'] } },
]

export default definePlugin((nitroApp) => {
  const logger = useLogger('stock-location:plugin')

  nitroApp.hooks.hook('czo:init', async () => {
    registerDbSchema(stockLocationSchema)
    registerRelations(stockLocationRelations)
    registerEffectLayer(StockLocationModuleLive)
    registerGraphQLSchema(registerStockLocationSchema)
    logger.info('Schema, relations, Effect layer and GraphQL schema registered')
  })

  nitroApp.hooks.hook('czo:register', async () => {
    // Runtime is built by @czo/kit between czo:init and czo:register, so we
    // can yield AccessService here. Auth's registry is still mutable
    // (freezeOnInit=false in auth/plugins/index.ts); it will be frozen in
    // auth's czo:boot.
    await runEffect(
      useRuntime(),
      Effect.gen(function* () {
        const access = yield* Access.AccessService
        yield* access.register({
          name: 'stock-location',
          statements: STOCK_LOCATION_STATEMENTS,
          hierarchy: STOCK_LOCATION_HIERARCHY,
        })
      }),
    )
    logger.info('Access domain registered via AccessService')
  })

  nitroApp.hooks.hook('czo:boot', async () => {
    logger.success('Stock location module booted')
  })
})
