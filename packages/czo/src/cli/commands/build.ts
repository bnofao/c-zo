import type { Logger } from '@medusajs/framework/types'
import type { ParsedCommandLine } from 'typescript'
import process from 'node:process'
import { initializeContainer } from '@czo/loaders'
import { Compiler } from '@medusajs/framework/build-tools'
import { logger as defaultLogger } from '@medusajs/framework/logger'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'

import { defineCommand } from 'citty'

export default (dir: string) => defineCommand({
  meta: {
    name: 'build',
    description: 'Build your project.',
  },
  args: {
    dir: {
      type: 'string',
      description: 'The directory to build the project.',
      default: dir ?? '',
    },
    plugin: {
      type: 'boolean',
      description: 'Build the plugin.',
      default: false,
    },
  },
  async run({ args }) {
    const { dir, plugin } = args
    let logger: Logger = defaultLogger

    if (!plugin) {
      const container = await initializeContainer(dir, {
        skipDbConnection: true,
      })
      logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    }

    logger.info('Starting build...')
    const compiler = new Compiler(dir, logger)

    const tsConfig = await compiler.loadTSConfigFile()

    if (!tsConfig) {
      if (plugin) {
        logger.error('Unable to compile plugin')
      }
      else {
        logger.error('Unable to compile application')
      }

      process.exit(1)
    }

    const promises: Promise<boolean>[] = []

    if (plugin) {
      promises.push(compiler.buildPluginBackend(tsConfig as ParsedCommandLine))
    }
    else {
      promises.push(compiler.buildAppBackend(tsConfig as ParsedCommandLine))
    }

    const responses = await Promise.all(promises)

    if (responses.every(response => response === true)) {
      process.exit(0)
    }
    else {
      process.exit(1)
    }
  },
})
