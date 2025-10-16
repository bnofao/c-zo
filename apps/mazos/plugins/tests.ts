import { defineNitroPlugin } from "nitro/runtime"

export default defineNitroPlugin((nitroApp) => {
console.log('Nitro plugin', nitroApp.container)
})