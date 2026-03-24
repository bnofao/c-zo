import { defineNitroConfig } from "nitro/config"
import kitModule from "@czo/kit/module"

export default defineNitroConfig({
  scanDirs: ['./', /* '/workspace/c-zo/packages/kit/dist', '/workspace/c-zo/packages/modules/auth/dist' */],
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

  runtimeConfig: {
    app: 'mazo',
    baseUrl: 'http://localhost:4000',
    auth: {
      secret: process.env.AUTH_SECRET,        // ← mapped from NITRO_CZO_AUTH_SECRET
    },
    database: {
      url: process.env.DATABASE_URL
    },
    queue: {
      storage: 'redis'
    }
  },

  plugins: [],
  modules: [
    '@czo/auth',
    '@czo/stock-location',
    // @ts-ignore 
    kitModule,
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
    auth: {
      driver: process.env.REDIS_URL ? 'redis' : 'memory',
      ...(process.env.REDIS_URL && { url: process.env.REDIS_URL }),
    },
    redis: {
      driver: 'redis',
      url: process.env.REDIS_URL,
      maxRetriesPerRequest: null
      // ttl: 300, // Default TTL 5 minutes
    }
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
});
