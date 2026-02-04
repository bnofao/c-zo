import { defineNitroConfig } from "nitro/config"
import kitModule from "@czo/kit/module"
// import productModule from '@czo/product'

export default defineNitroConfig({
  scanDirs: ['./'],
  preset: "standard",
  plugins: [
    // '@czo/kit/plugins/ioc',
    // 'old/tests.js',
    // '/workspace/c-zo/packages/kit/src/plugins/ioc.ts',
  ],
  modules: [
    // productModule,
    '@czo/product',
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
