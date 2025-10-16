import type {
  ConfigModule,
  LoadedModule,
  MedusaContainer,
  PluginDetails,
} from '@medusajs/framework/types'
import type {
  GraphQLSchema,
} from '@medusajs/framework/utils'
import type { Express, NextFunction, Request, Response } from 'express'
import { join } from 'node:path'
import { container, MedusaAppLoader } from '@medusajs/framework'
import { configLoader } from '@medusajs/framework/config'
import { pgConnectionLoader } from '@medusajs/framework/database'
import { featureFlagsLoader } from '@medusajs/framework/feature-flags'
import { expressLoader } from '@medusajs/framework/http'
import { JobLoader } from '@medusajs/framework/jobs'
import { LinkLoader } from '@medusajs/framework/links'
import { logger as defaultLogger } from '@medusajs/framework/logger'
import { SubscriberLoader } from '@medusajs/framework/subscribers'
import {
  ContainerRegistrationKeys,
  getResolvedPlugins,
  mergePluginModules,
  promiseAll,
  validateModuleName,
} from '@medusajs/framework/utils'
import { WorkflowLoader } from '@medusajs/framework/workflows'

import { asValue } from 'awilix'
import requestIp from 'request-ip'

import { v4 } from 'uuid'
import apiLoader from './api'
import { TaskLoader } from './task'

export { TASKS } from './task'

export type { TaskConfig, TaskHandler, Tasks } from './task'

interface Options {
  directory: string
  expressApp?: Express
  skipLoadingEntryPoints?: boolean
}

function isWorkerMode(configModule: ConfigModule) {
  return configModule.projectConfig.workerMode === 'worker'
}

function shouldLoadBackgroundProcessors(configModule: ConfigModule) {
  return (
    configModule.projectConfig.workerMode === 'worker'
    || configModule.projectConfig.workerMode === 'shared'
  )
}

async function subscribersLoader(
  plugins: PluginDetails[],
  container: MedusaContainer,
) {
  const pluginSubscribersSourcePaths = plugins.map(plugin => join(plugin.resolve, 'subscribers'))

  const subscriberLoader = new SubscriberLoader(
    pluginSubscribersSourcePaths,
    undefined,
    container,
  )
  await subscriberLoader.load()
}

async function jobsLoader(
  plugins: PluginDetails[],
  container: MedusaContainer,
) {
  const pluginJobSourcePaths = plugins.map(plugin => join(plugin.resolve, 'jobs'))

  const jobLoader = new JobLoader(pluginJobSourcePaths, container)
  await jobLoader.load()
}

export async function tasksLoader(
  plugins: PluginDetails[],
  container: MedusaContainer,
) {
  const pluginTaskSourcePaths = plugins.map(plugin => join(plugin.resolve, 'tasks'))
  const taskLoader = new TaskLoader(pluginTaskSourcePaths, container)
  await taskLoader.load()
}

async function loadEntrypoints(
  plugins: PluginDetails[],
  container: MedusaContainer,
  expressApp?: Express,
) {
  const configModule: ConfigModule = container.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE,
  )

  if (shouldLoadBackgroundProcessors(configModule)) {
    await subscribersLoader(plugins, container)
    await jobsLoader(plugins, container)
  }

  if (isWorkerMode(configModule)) {
    return async () => {}
  }

  if (expressApp) {
    /**
     * The scope and the ip address must be fetched before we execute any other
     * middleware
     */
    expressApp.use((req: Request, res: Response, next: NextFunction) => {
      req.scope = container.createScope() as MedusaContainer
      req.requestId = (req.headers['x-request-id'] as string) ?? v4()
      next()
    })

    // Add additional information to context of request
    expressApp.use((req: Request, res: Response, next: NextFunction) => {
      const ipAddress = requestIp.getClientIp(req) as string
      ;(req as any).request_context = {
        ip_address: ipAddress,
      }
      next()
    })

    const { shutdown } = await expressLoader({
      app: expressApp,
      container,
    })

    await apiLoader({
      container,
      plugins,
      app: expressApp,
    })

    return shutdown
  }

  return async () => {}
}

export async function initializeContainer(
  rootDirectory: string,
  options?: {
    skipDbConnection?: boolean
  },
): Promise<MedusaContainer> {
  // custom flags from medusa project
  await featureFlagsLoader(rootDirectory)
  const configDir = await configLoader(rootDirectory, 'czo-config')
  // core flags
  await featureFlagsLoader(join(__dirname, '..'))

  const customLogger = configDir.logger ?? defaultLogger
  container.register({
    [ContainerRegistrationKeys.LOGGER]: asValue(customLogger),
    [ContainerRegistrationKeys.REMOTE_QUERY]: asValue(null),
  })

  if (!options?.skipDbConnection) {
    await pgConnectionLoader()
  }

  return container
}

export async function coreLoader(directory: string) {
  const container = await initializeContainer(directory)
  const configModule = container.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE,
  )
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const plugins = await getResolvedPlugins(directory, configModule, true)
  mergePluginModules(configModule, plugins)

  Object.keys(configModule.modules ?? {}).forEach((key) => {
    validateModuleName(key)
  })

  const linksSourcePaths = plugins.map(plugin =>
    join(plugin.resolve, 'links'),
  )
  await new LinkLoader(linksSourcePaths, logger).load()

  return {
    logger,
    appLoader: new MedusaAppLoader(),
    container,
    plugins,
  }
}

export async function appLoader(directory: string) {
  const loader = await coreLoader(directory)
  const loaded = await loader.appLoader.load()
  return {
    ...loader,
    ...loaded,
  }
}

export default async ({
  directory: rootDirectory,
  expressApp,
  skipLoadingEntryPoints = false,
}: Options): Promise<{
  container: MedusaContainer
  app?: Express
  modules: Record<string, LoadedModule | LoadedModule[]>
  shutdown: () => Promise<void>
  gqlSchema?: GraphQLSchema
}> => {
  const {
    onApplicationStart,
    onApplicationShutdown,
    onApplicationPrepareShutdown,
    modules,
    gqlSchema,
    plugins,
    container,
  } = await appLoader(rootDirectory)

  const workflowsSourcePaths = plugins.map(p => join(p.resolve, 'workflows'))
  const workflowLoader = new WorkflowLoader(workflowsSourcePaths, container)
  await workflowLoader.load()

  await tasksLoader(plugins, container)

  const entrypointsShutdown = skipLoadingEntryPoints
    ? () => {}
    : await loadEntrypoints(plugins, container, expressApp)

  const { createDefaultsWorkflow } = await import('@medusajs/core-flows')
  await createDefaultsWorkflow(container).run()
  await onApplicationStart()

  const shutdown = async () => {
    const pgConnection = container.resolve(
      ContainerRegistrationKeys.PG_CONNECTION,
    )

    await onApplicationPrepareShutdown()
    await onApplicationShutdown()

    await promiseAll([
      container.dispose(),
      // @ts-expect-error "Do we want to call `client.destroy` "
      pgConnection?.context?.destroy(),
      entrypointsShutdown(),
    ])
  }

  return {
    container,
    app: expressApp,
    shutdown,
    modules,
    gqlSchema,
  }
}
