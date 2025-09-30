import type { ParsedCommandLine } from 'typescript'
import process from 'node:process'
import { initializeContainer } from '@czo/loaders'
import { Compiler } from '@medusajs/framework/build-tools'
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
  },
  async run({ args }) {
    const { dir } = args
    const container = await initializeContainer(dir, {
      skipDbConnection: true,
    })
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

    logger.info('Starting build...')
    const compiler = new Compiler(dir, logger)

    const tsConfig = await compiler.loadTSConfigFile()
    if (!tsConfig) {
      logger.error('Unable to compile application')
      process.exit(1)
    }

    const promises: Promise<boolean>[] = []
    promises.push(compiler.buildAppBackend(tsConfig as ParsedCommandLine))

    const responses = await Promise.all(promises)

    if (responses.every(response => response === true)) {
      process.exit(0)
    }
    else {
      process.exit(1)
    }
  },
})
