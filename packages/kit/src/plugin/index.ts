import { useContainer, useLogger } from '@czo/kit'
import { definePlugin } from 'nitro'

const logger = useLogger('kit:plugin')

export default definePlugin(async (nitroApp) => {
  const container = useContainer()
  await nitroApp.hooks.callHook('czo:register', container)
  await nitroApp.hooks.callHook('czo:boot', container)
  logger.debug('IoC container initialized')
  nitroApp.container = container
})
