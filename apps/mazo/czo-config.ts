import { loadEnv, defineConfig } from '@czo/czo/config'
import { MODULE_PACKAGE_NAMES, Modules } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  // plugins: [
  //   {
  //     resolve: "@czo/marketplace",
  //     options: {},
  //   },
  // ],
  // modules: [
  //   { resolve: MODULE_PACKAGE_NAMES[Modules.CACHE] },
  //   { resolve: MODULE_PACKAGE_NAMES[Modules.EVENT_BUS] },
  //   { resolve: MODULE_PACKAGE_NAMES[Modules.WORKFLOW_ENGINE] },
  //   { resolve: MODULE_PACKAGE_NAMES[Modules.LOCKING] },

  //   {
  //     resolve: MODULE_PACKAGE_NAMES[Modules.FILE],
  //     options: {
  //       providers: [
  //         {
  //           resolve: "@medusajs/medusa/file-local",
  //           id: "local",
  //         },
  //       ],
  //     },
  //   },
  // ],
})
