import { useLogger } from '@czo/kit'
import { registerRelations, registerSchema, useDatabase } from '@czo/kit/db'
import { useContainer } from '@czo/kit/ioc'
import { stockLocationRelations } from '@czo/stock-location/relations'
import * as stockLocationSchema from '@czo/stock-location/schema'
import { createStockLocationService } from '@czo/stock-location/services'
import { definePlugin } from 'nitro'

export default definePlugin((nitroApp) => {
  const logger = useLogger('stock-location:plugin')

  nitroApp.hooks.hook('czo:init', async () => {
    registerSchema(stockLocationSchema)
    registerRelations(stockLocationRelations)
    logger.info('Schema and relations registered')
  })

  nitroApp.hooks.hook('czo:register', async () => {
    const container = useContainer()
    const accessService = await container.make('auth:access') as { register: (opt: { name: string, statements: Record<string, readonly string[]>, hierarchy: Array<{ name: string, permissions: Record<string, readonly string[]> }> }) => void }

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

    const service = createStockLocationService(db)
    container.singleton('stockLocation:service', () => service)
    logger.info('Service bound to container')

    await import('@czo/stock-location/graphql')
    logger.info('GraphQL schema and resolvers registered')

    logger.success('Stock location module booted')
  })
})
