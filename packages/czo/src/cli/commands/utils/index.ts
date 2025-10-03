import type { MedusaContainer } from '@medusajs/framework/types'
import process from 'node:process'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'

export async function ensureDbExists(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const pgConnection = container.resolve(
    ContainerRegistrationKeys.PG_CONNECTION,
  )

  try {
    await pgConnection.raw('SELECT 1 + 1;')
  }
  catch (error) {
    if (error.code === '3D000') {
      logger.error(`Cannot sync links. ${error.message.replace('error: ', '')}`)
      logger.info(`Run command "db:create" to create the database`)
    }
    else {
      logger.error(error)
    }
    process.exit(1)
  }
}
