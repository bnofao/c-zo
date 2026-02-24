import { useLogger } from '@czo/kit'
import { useContainer } from '@czo/kit/ioc'
import { definePlugin } from 'nitro'

const logger = useLogger('kit:plugin')

export default definePlugin(async (nitroApp) => {
  const container = useContainer()
  await nitroApp.hooks.callHook('czo:init')
  await nitroApp.hooks.callHook('czo:register')
  await nitroApp.hooks.callHook('czo:boot')
  logger.debug('IoC container initialized')
  nitroApp.container = container
})
