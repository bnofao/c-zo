import { definePlugin } from 'nitro'
// import { useRuntimeConfig } from 'nitro/runtime-config'
import { DrizzleDbLive } from '../db/effect'
import { buildEffectRuntime, clearEffectLayers } from '../effect'
import { useContainer } from '../ioc'
import { useLogger } from '../logger'

const logger = useLogger('kit:plugin')

export default definePlugin((nitroApp) => {
  const container = useContainer()
  // Reset the module-level layer registry at the start of every plugin
  // invocation so Nitro hot-reload (which re-runs the plugin without restarting
  // the process) doesn't trip the "runtime already built" guard.
  clearEffectLayers()
  // container.bindValue('config', useRuntimeConfig())
  Promise.resolve(nitroApp.hooks.callHook('czo:init'))
    .then(() => nitroApp.hooks.callHook('czo:register'))
    .then(() => nitroApp.hooks.callHook('czo:boot'))
    .then(() => {
      // Every module has registered its Effect layer by now (during czo:boot).
      // Build the single app-wide ManagedRuntime, providing shared infra once.
      const runtime = buildEffectRuntime(DrizzleDbLive)
      if (runtime) {
        nitroApp.hooks.hook('close', () => runtime.dispose())
        logger.debug('Effect runtime built from registered module layers')
      }
    })
    .catch((err: unknown) => logger.error('czo lifecycle failed', err))
  logger.debug('IoC container initialized')
  nitroApp.container = container
})
