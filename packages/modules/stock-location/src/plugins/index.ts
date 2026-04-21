import { useLogger } from '@czo/kit'
import { registerRelations, registerSchema as registerDbSchema, useDatabase } from '@czo/kit/db'
import { registerSchema as registerGraphQLSchema } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'
import { registerStockLocationSchema } from '@czo/stock-location/graphql'
import { stockLocationRelations } from '@czo/stock-location/relations'
import * as stockLocationSchema from '@czo/stock-location/schema'
import { createStockLocationService } from '@czo/stock-location/services'
import { definePlugin } from 'nitro'

export default definePlugin((nitroApp) => {
  const logger = useLogger('stock-location:plugin')

  nitroApp.hooks.hook('czo:init', async () => {
    registerDbSchema(stockLocationSchema)
    registerRelations(stockLocationRelations)
    logger.info('Schema and relations registered')
  })

  nitroApp.hooks.hook('czo:register', async () => {
    const container = useContainer()
    const accessService = await container.make('auth:access') as {
      register: (opt: {
        name: string
        statements: Record<string, readonly string[]>
        hierarchy: Array<{ name: string, permissions: Record<string, readonly string[]> }>
      }) => void
    }

    accessService.register({
      name: 'stock-location',
      statements: {
        'stock-location': ['create', 'read', 'update', 'delete'] as const,
      },
      hierarchy: [
        {
          name: 'member',
          permissions: { 'stock-location': ['read'] },
        },
        {
          name: 'manager',
          permissions: { 'stock-location': ['create', 'read', 'update'] },
        },
        {
          name: 'owner',
          permissions: { 'stock-location': ['create', 'read', 'update', 'delete'] },
        },
      ],
    })

    logger.info('Access domain registered')
  })

  nitroApp.hooks.hook('czo:boot', async () => {
    const container = useContainer()
    const db = await useDatabase()

    const stockLocationService = createStockLocationService(db)
    container.singleton('stockLocation:service', () => stockLocationService)
    logger.info('Service bound to container')

    registerGraphQLSchema(registerStockLocationSchema)
    logger.info('GraphQL schema registered')

    logger.success('Stock location module booted')
  })
})
