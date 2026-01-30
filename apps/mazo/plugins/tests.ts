import { definePlugin } from "nitro"

export default definePlugin((nitroApp) => {
console.log('Nitro tests plugin', nitroApp.container)
})