import cluster from 'node:cluster'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

// eslint-disable-next-line node/no-deprecated-api
import { parse } from 'node:url'

import loaders, { initializeContainer } from '@czo/loaders'
import { MedusaModule } from '@medusajs/framework/modules-sdk'
import {
  ContainerRegistrationKeys,
  dynamicImport,
  FileSystem,
  generateContainerTypes,
  gqlSchemaToTypes,
  GracefulShutdownServer,
  isFileSkipped,
  isPresent,
} from '@medusajs/framework/utils'

import { track } from '@medusajs/telemetry'
import { defineCommand } from 'citty'
import express from 'express'
import { scheduleJob } from 'node-schedule'

const EVERY_SIXTH_HOUR = '0 */6 * * *'
const CRON_SCHEDULE = EVERY_SIXTH_HOUR
const INSTRUMENTATION_FILE = 'instrumentation'

function parseValueOrPercentage(value: string, base: number): number {
  if (typeof value !== 'string') {
    throw new TypeError(`Invalid value: ${value}. Must be a string.`)
  }

  const trimmed = value.trim()
  if (trimmed.endsWith('%')) {
    const percent = Number.parseFloat(trimmed.slice(0, -1))
    if (Number.isNaN(percent)) {
      throw new TypeError(`Invalid percentage: ${value}`)
    }
    if (percent < 0 || percent > 100) {
      throw new Error(`Percentage must be between 0 and 100: ${value}`)
    }
    return Math.round((percent / 100) * base)
  }
  else {
    const num = Number.parseInt(trimmed, 10)
    if (Number.isNaN(num) || num < 0) {
      throw new Error(
        `Invalid number: ${value}. Must be a non-negative integer.`,
      )
    }
    return num
  }
}

/**
 * Imports the "instrumentation.js" file from the root of the
 * directory and invokes the register function. The existence
 * of this file is optional, hence we ignore "ENOENT"
 * errors.
 */
export async function registerInstrumentation(directory: string) {
  const container = await initializeContainer(directory, {
    skipDbConnection: true,
  })
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const fileSystem = new FileSystem(directory)
  const exists
    = (await fileSystem.exists(`${INSTRUMENTATION_FILE}.ts`))
      || (await fileSystem.exists(`${INSTRUMENTATION_FILE}.js`))
  if (!exists) {
    return
  }

  const instrumentation = await dynamicImport(
    path.join(directory, INSTRUMENTATION_FILE),
  )

  if (
    typeof instrumentation.register === 'function'
    && !isFileSkipped(instrumentation)
  ) {
    logger.info('OTEL registered')
    instrumentation.register()
  }
  else {
    logger.info(
      'Skipping instrumentation registration. No register function found.',
    )
  }
}

/**
 * Wrap request handler inside custom implementation to enabled
 * instrumentation.
 */
// eslint-disable-next-line no-var, vars-on-top, import/no-mutable-exports
export var traceRequestHandler: (...args: any[]) => Promise<any> = void 0 as any

interface ExpressStack {
  name: string
  match: (url: string) => boolean
  route: { path: string }
  handle: { stack: ExpressStack[] }
}

/**
 * Retrieve the route path from the express stack based on the input url
 * @param route - The route object
 * @param route.stack - The express stack
 * @param route.url - The input url
 * @returns The route path
 */
function findExpressRoutePath({
  stack,
  url,
}: {
  stack: ExpressStack[]
  url: string
}): string | void {
  const stackToProcess = [...stack]

  while (stackToProcess.length > 0) {
    const layer = stackToProcess.pop()!

    if (layer.name === 'bound dispatch' && layer.match(url)) {
      return layer.route.path
    }

    // Add nested stack items to be processed if they exist
    if (layer.handle?.stack?.length) {
      stackToProcess.push(...layer.handle.stack)
    }
  }

  return undefined
}

export default (dir: string, port: string) => defineCommand({
  meta: {
    name: 'start',
    description: 'Start production server',
  },
  args: {
    dir: {
      type: 'string',
      description: 'The server directory to start',
      default: dir,
    },
    host: {
      type: 'string',
      alias: 'H',
      description: process.env.HOST
        ? `Set host. Defaults to ${process.env.HOST} (set by env.HOST)`
        : ``,
      default: process.env.HOST,
    },
    port: {
      type: 'string',
      alias: 'p',
      description: process.env.PORT
        ? `Set port. Defaults to ${process.env.PORT} (set by env.PORT) (otherwise defaults ${port})`
        : `Set port. Defaults to ${port}`,
      default: process.env.PORT || port,
    },
    types: {
      type: 'boolean',
      description: 'Generate automated types for modules inside the .medusa directory',
      default: false,
    },
    cluster: {
      type: 'string',
      description: 'Start the Node.js server in cluster mode. Specify the number of CPUs to use or a percentage (e.g., 50%). Defaults to the number of available CPUs.',
    },
    workers: {
      type: 'string',
      description: 'Number of worker processes in cluster mode or a percentage of cluster size (e.g., 25%).',
      default: '0',
    },
    servers: {
      type: 'string',
      description: 'Number of server processes in cluster mode or a percentage of cluster size (e.g., 25%).',
      default: '0',
    },
  },
  async run({ args }) {
    process.env.NODE_ENV = process.env.NODE_ENV || `production`

    const {
      port,
      host,
      dir,
      types,
      cluster: clusterSize,
      workers,
      servers,
    } = args

    const maxCpus = os.cpus().length
    const clusterSizeNum = clusterSize
      ? parseValueOrPercentage(clusterSize, maxCpus)
      : maxCpus
    const serversCount = servers
      ? parseValueOrPercentage(servers, clusterSizeNum)
      : 0
    const workersCount = workers
      ? parseValueOrPercentage(workers, clusterSizeNum)
      : 0

    async function internalStart(generateTypes: boolean) {
      track('CLI_START')

      const container = await initializeContainer(dir, {
        skipDbConnection: true,
      })
      const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
      await registerInstrumentation(dir)

      const app = express()

      const http_ = http.createServer(async (req, res) => {
        const stack = app._router.stack
        await new Promise((resolve) => {
          res.on('finish', resolve)
          if (traceRequestHandler) {
            const expressHandlerPath = findExpressRoutePath({
              stack,
              url: parse(req.url!, false).pathname!,
            })
            void traceRequestHandler(
              async () => {
                app(req, res)
              },
              req,
              res,
              expressHandlerPath,
            )
          }
          else {
            app(req, res)
          }
        })
      })

      try {
        const { shutdown, gqlSchema, modules } = await loaders({
          directory: dir,
          expressApp: app,
        })

        if (generateTypes) {
          const typesDirectory = path.join(dir, '.medusa/types')

          /**
           * Cleanup existing types directory before creating new artifacts
           */
          await new FileSystem(typesDirectory).cleanup({ recursive: true })

          await generateContainerTypes(modules, {
            outputDir: typesDirectory,
            interfaceName: 'ModuleImplementations',
          })
          logger.debug('Generated container types')

          if (gqlSchema) {
            await gqlSchemaToTypes({
              outputDir: typesDirectory,
              filename: 'query-entry-points',
              interfaceName: 'RemoteQueryEntryPoints',
              schema: gqlSchema,
              joinerConfigs: MedusaModule.getAllJoinerConfigs(),
            })
            logger.debug('Generated modules types')
          }
        }

        const serverActivity = logger.activity(`Creating server`)

        // Register a health check endpoint. Ideally this also checks the readiness of the service, rather than just returning a static response.
        app.get('/health', (_, res) => {
          res.status(200).send('OK')
        })

        const server = GracefulShutdownServer.create(
          http_.listen(port, host).on('listening', () => {
            logger.success(serverActivity, `Server is ready on port: ${port}`)
            track('CLI_START_COMPLETED')
          }),
        )

        // Handle graceful shutdown
        const gracefulShutDown = () => {
          logger.info('Gracefully shutting down server')
          server
            .shutdown()
            .then(async () => {
              await shutdown()
              process.exit(0)
            })
            .catch((e) => {
              logger.error('Error received when shutting down the server.', e)
              process.exit(1)
            })
        }

        process.on('SIGTERM', gracefulShutDown)
        process.on('SIGINT', gracefulShutDown)

        scheduleJob(CRON_SCHEDULE, () => {
          track('PING')
        })

        return { server }
      }
      catch (err) {
        logger.error('Error starting server', err)
        process.exit(1)
      }
    }

    /**
     * When the cluster flag is used we will start the process in
     * cluster mode
     */
    if ('cluster' in args) {
      const cpus = clusterSizeNum
      const numCPUs = Math.min(maxCpus, cpus)

      if (serversCount + workersCount > numCPUs) {
        throw new Error(
          `Sum of servers (${serversCount}) and workers (${workersCount}) cannot exceed cluster size (${numCPUs})`,
        )
      }

      if (cluster.isPrimary) {
        let isShuttingDown = false
        const killMainProccess = () => process.exit(0)
        const gracefulShutDown = () => {
          isShuttingDown = true
        }

        for (let index = 0; index < numCPUs; index++) {
          const worker = cluster.fork()
          let workerMode: 'server' | 'worker' | 'shared' = 'shared'
          if (index < serversCount) {
            workerMode = 'server'
          }
          else if (index < serversCount + workersCount) {
            workerMode = 'worker'
          }
          worker.on('online', () => {
            worker.send({ index, workerMode })
          })
        }

        cluster.on('exit', () => {
          if (!isShuttingDown) {
            cluster.fork()
          }
          else if (!isPresent(cluster.workers)) {
            setTimeout(killMainProccess, 100).unref()
          }
        })

        process.on('SIGTERM', gracefulShutDown)
        process.on('SIGINT', gracefulShutDown)
      }
      else {
        process.on('message', async (msg: any) => {
          if (msg.workerMode) {
            process.env.MEDUSA_WORKER_MODE = msg.workerMode
          }

          if (msg.index > 0) {
            process.env.PLUGIN_ADMIN_UI_SKIP_CACHE = 'true'
          }

          await internalStart(!!types && msg.index === 0)
        })
      }
    }
    else {
      /**
       * Not in cluster mode
       */
      await internalStart(!!types)
    }
  },
})
