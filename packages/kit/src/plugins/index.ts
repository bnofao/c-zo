import { definePlugin } from 'nitro'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { useContainer } from '../ioc'
import { useLogger } from '../logger'

const logger = useLogger('kit:plugin')

export default definePlugin((nitroApp) => {
  const container = useContainer()
  container.bindValue('config', useRuntimeConfig())
  // Promise.resolve(nitroApp.hooks.callHook('czo:init')).then(() => {
  //   Promise.resolve(nitroApp.hooks.callHook('czo:register')).then(() => {
  //     nitroApp.hooks.callHook('czo:boot')
  //   })
  // })
  nitroApp.hooks.callHook('czo:init')
  nitroApp.hooks.callHook('czo:register')
  nitroApp.hooks.callHook('czo:boot')
  logger.debug('IoC container initialized')
  nitroApp.container = container
})
