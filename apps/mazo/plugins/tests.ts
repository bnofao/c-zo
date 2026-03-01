import { definePlugin } from "nitro"
import { useRuntimeConfig } from "nitro/runtime-config"

export default definePlugin((nitroApp) => {
console.log('Nitro tests plugin', useRuntimeConfig())
})