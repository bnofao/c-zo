import { definePlugin } from "nitro"
import { useRuntimeConfig } from "nitro/runtime-config"
import { useStorage } from 'nitro/storage';

export default definePlugin((nitroApp) => {
    useContainer().bindValue('config', useRuntimeConfig())
    useContainer().bind('useStorage', () => useStorage)
})