import { useContainer } from '@czo/kit'
import { defineNitroPlugin } from 'nitro/runtime'

export default defineNitroPlugin (async (nitroApp) => {
  const container = useContainer()
  await nitroApp.hooks.callHook('czo:register', container)
  await nitroApp.hooks.callHook('czo:boot', container)
  nitroApp.container = container
})
