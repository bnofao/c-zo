import { definePlugin } from 'nitro'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { useContainer } from '../ioc'
import { useLogger } from '../logger'

const logger = useLogger('kit:plugin')

export default definePlugin(async (nitroApp) => {
  const container = useContainer()
  container.bindValue('config', useRuntimeConfig())
  await nitroApp.hooks.callHook('czo:init')
  await nitroApp.hooks.callHook('czo:register')
  await nitroApp.hooks.callHook('czo:boot')
  logger.debug('IoC container initialized')
  nitroApp.container = container
})
