import { fork } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { coreLoader } from '@czo/loaders'
import { defineCommand } from 'citty'
import { ensureDbExists } from '../utils'
import { syncLinks } from './links'

const TERMINAL_SIZE = process.stdout.columns

const CZO_CLI_PATH = require.resolve('@czo/czo')

export default (directory: string) => defineCommand({
  meta: {
    name: 'db:migrate',
    description: 'Migrate the database',
  },
  args: {
    directory: {
      type: 'string',
      description: 'The directory to migrate the database',
      default: directory,
    },
    links: {
      type: 'boolean',
      description: 'Sync modules links',
      default: false,
    },
    scripts: {
      type: 'boolean',
      description: 'Run pending migration scripts',
      default: false,
    },
    allLinks: {
      type: 'boolean',
      description: 'Execute all links including unsafe ones',
      default: false,
    },
    safeLinks: {
      type: 'boolean',
      description: 'Execute safe links only',
      default: false,
    },
  },
  async run({ args }) {
    const { directory, links, scripts, allLinks, safeLinks } = args
    const { logger, container, appLoader } = await coreLoader(directory)

    try {
      await ensureDbExists(container)
      logger.info('Running migrations...')
      await appLoader.runModulesMigrations({
        action: 'run',
      })
      // eslint-disable-next-line unicorn/no-new-array
      logger.log(new Array(TERMINAL_SIZE).join('-'))
      logger.info('Migrations completed')

      /**
       * Sync links
       */
      if (links) {
        // eslint-disable-next-line unicorn/no-new-array
        logger.log(new Array(TERMINAL_SIZE).join('-'))
        await syncLinks(appLoader, {
          executeAll: allLinks,
          executeSafe: safeLinks,
          logger,
        })
      }

      if (scripts) {
        /**
         * Run migration scripts
         */
        const cliPath = path.resolve(CZO_CLI_PATH, '..', '..', 'dist', 'cli', 'index.cjs')
        // eslint-disable-next-line unicorn/no-new-array
        logger.log(new Array(TERMINAL_SIZE).join('-'))
        const childProcess = fork(cliPath, ['db:scripts'], {
          cwd: directory,
          env: process.env,
        })

        await new Promise<void>((resolve, reject) => {
          childProcess.on('error', (error) => {
            reject(error)
          })
          childProcess.on('close', () => {
            resolve()
          })
        })
      }
      process.exit(0)
    }
    catch (error) {
      logger.error(error)
      process.exit(1)
    }
  },
})
