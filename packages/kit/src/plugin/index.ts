import { useContainer } from '@czo/kit'
import { definePlugin } from 'nitro'

export default definePlugin (async (nitroApp) => {
  const container = useContainer()
  await nitroApp.hooks.callHook('czo:register', container)
  await nitroApp.hooks.callHook('czo:boot', container)
  console.log('Nitro plugin', nitroApp)
  nitroApp.container = container
})
