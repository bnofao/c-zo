import { dirname, join } from 'node:path'
import process from 'node:process'
import { appLoader } from '@czo/loaders'
import { MigrationScriptsMigrator } from '@medusajs/framework/migrations'
import { defineCommand } from 'citty'
import { ensureDbExists } from '../utils'

const TERMINAL_SIZE = process.stdout.columns

// export default main

export default (directory: string) => defineCommand({
  meta: {
    name: 'db:scripts',
    description: 'Run migration scripts',
  },
  args: {
    directory: {
      type: 'string',
      description: 'The directory to run the migration scripts',
      default: directory,
    },
  },
  async run({ args }) {
    const { directory } = args

    let _onApplicationPrepareShutdown: () => Promise<void> = async () => Promise.resolve()
    let _onApplicationShutdown: () => Promise<void> = async () => Promise.resolve()
    const { logger, container, plugins, onApplicationPrepareShutdown, onApplicationShutdown, onApplicationStart } = await appLoader(directory)

    try {
      await ensureDbExists(container)

      await onApplicationStart()

      _onApplicationPrepareShutdown = onApplicationPrepareShutdown
      _onApplicationShutdown = onApplicationShutdown

      const scriptsSourcePaths = [
        join(dirname(require.resolve('@medusajs/medusa')), 'migration-scripts'),
        ...plugins.map(plugin => join(plugin.resolve, 'migration-scripts')),
      ]

      const migrator = new MigrationScriptsMigrator({ container })
      await migrator.ensureMigrationsTable()
      const pendingScripts = await migrator.getPendingMigrations(
        scriptsSourcePaths,
      )

      if (!pendingScripts?.length) {
        logger.info('No pending migration scripts to execute')
        return true
      }

      // eslint-disable-next-line unicorn/no-new-array
      logger.log(new Array(TERMINAL_SIZE).join('-'))
      logger.info('Pending migration scripts to execute')
      logger.info(`${pendingScripts.join('\n')}`)

      // eslint-disable-next-line unicorn/no-new-array
      logger.log(new Array(TERMINAL_SIZE).join('-'))
      logger.info('Running migration scripts...')
      await migrator.run(scriptsSourcePaths)

      // eslint-disable-next-line unicorn/no-new-array
      logger.log(new Array(TERMINAL_SIZE).join('-'))
      logger.info('Migration scripts completed')

      process.exit(0)
    }
    catch (error) {
      logger.error(error)
      process.exit(1)
    }
    finally {
      await _onApplicationPrepareShutdown()
      await _onApplicationShutdown()
    }
  },
})
