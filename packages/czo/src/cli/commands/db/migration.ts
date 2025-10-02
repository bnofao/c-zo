import process from 'node:process'
import { coreLoader } from '@czo/loaders'
import { MedusaError } from '@medusajs/framework/utils'
import { defineCommand } from 'citty'
import { ensureDbExists } from '../utils'

const TERMINAL_SIZE = process.stdout.columns

export default (directory: string) => defineCommand({
  meta: {
    name: 'db:migration',
    description: 'Generate a migration',
  },
  args: {
    directory: {
      type: 'string' as const,
      description: 'The directory to generate the migration',
      default: directory,
    },
    modules: {
      type: 'string' as const,
      description: 'The modules to generate the migration for',
      required: true,
    },
  },
  async run({ args }) {
    const { directory, modules } = args
    const { logger, appLoader, container } = await coreLoader(directory)

    try {
      await ensureDbExists(container)

      /**
       * Generating migrations
       */
      logger.info('Generating migrations...')

      await appLoader.runModulesMigrations({
        moduleNames: modules.replace(/\s+/g, '').split(','),
        action: 'generate',
      })

      // eslint-disable-next-line unicorn/no-new-array
      logger.log(new Array(TERMINAL_SIZE).join('-'))
      logger.info('Migrations generated')

      process.exit()
    }
    catch (error) {
      // eslint-disable-next-line unicorn/no-new-array
      logger.log(new Array(TERMINAL_SIZE).join('-'))
      if (error.code && error.code === MedusaError.Codes.UNKNOWN_MODULES) {
        logger.error(error.message)
        const modulesList = error.allModules.map(
          (name: string) => `          - ${name}`,
        )
        logger.error(`Available modules:\n${modulesList.join('\n')}`)
      }
      else {
        logger.error(error.message, error)
      }
      process.exit(1)
    }
  },
})
