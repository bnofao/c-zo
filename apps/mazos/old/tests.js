import { defineNitroPlugin } from "nitro/runtime"

export default defineNitroPlugin((nitroApp) => {
console.log('NitroOld plugin', nitroApp.hooks)
})