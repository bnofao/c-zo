import { defineNitroConfig } from "nitro/config"
import kitModule from "@czo/kit/module"
import authModule from "@czo/auth"
// import productModule from '@czo/product'

export default defineNitroConfig({
  scanDirs: ['./'],
  preset: "standard",

  experimental: {
    openAPI: true,
  },
  openAPI: {
    meta: {
      title: 'c-zo API',
      description: 'c-zo e-commerce platform API',
      version: '0.1.0',
    },
    route: '/_nitro/openapi.json',
    ui: {
      scalar: {
        route: "/_docs/scalar"
      },
      swagger: false,
    },
  },

  runtimeConfig: {      // ← mapped from NITRO_CZO_REDIS_URL
    auth: {
      secret: 'dsdfsdfsdsdfsdfsdfsdfsdfsdfsdfsdfsdfsdfdsf',        // ← mapped from NITRO_CZO_AUTH_SECRET
      baseUrl: '',       // ← mapped from NITRO_CZO_AUTH_BASE_URL
    },
    czo: {
      databaseUrl: '',     // ← mapped from NITRO_CZO_DATABASE_URL
      redisUrl: '',  
      queue: {
        prefix: 'czo',
        defaultAttempts: 3,
      },
      eventBus: {
        provider: 'hookable',
        source: 'monolith',
        dualWrite: false,
        rabbitmq: {
          url: '',         // ← mapped from NITRO_CZO_EVENT_BUS_RABBITMQ_URL
          exchange: 'czo.events',
          deadLetterExchange: 'czo.dlx',
          systemExchange: 'czo.system',
          prefetch: 10,
        },
      },
    },
  },

  plugins: [
    // '@czo/kit/plugins/ioc',
    // 'old/tests.js',
    // '/workspace/c-zo/packages/kit/src/plugins/ioc.ts',
  ],
  modules: [
    // productModule,
    // '@czo/product',
    kitModule,
    authModule,
  ],
  imports: {
    imports: [],
    dts: true
  },

  // Storage configuration for cache
  // Uses memory driver in development, Redis in production
  storage: {
    cache: {
      driver: process.env.REDIS_URL ? 'redis' : 'memory',
      ...(process.env.REDIS_URL && {
        url: process.env.REDIS_URL,
        ttl: 300, // Default TTL 5 minutes
      }),
    },
  },

  // Route-level caching (optional)
  routeRules: {
    // Cache product API responses with SWR
    '/api/products/**': {
      cache: {
        maxAge: 60,
        swr: true,
        staleMaxAge: 3600,
      },
    },
  },

  // apiDir: 'api',
  // alias: {
  //   '@czo/product': '@czo/product',
  // }
});
