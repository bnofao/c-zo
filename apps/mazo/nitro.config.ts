import { defineNitroConfig } from "nitro/config"
import kitModule from "@czo/kit/module"

export default defineNitroConfig({
  scanDirs: ['./', /* '/workspace/c-zo/packages/kit/dist', '/workspace/c-zo/packages/modules/auth/dist' */],
  preset: "standard",

  experimental: {
    openAPI: true,
    tasks: true,
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
    },
    telemetry: {
      // SDK init lives in `./server.ts` (it owns the global TracerProvider).
      // This `enabled` flag drives the kit's *Effect ↔ OTel bridge layer*:
      // when `true`, `Effect.fn(name)` / `Effect.withSpan(...)` produce spans
      // against the global provider set up by server.ts. When `false`, the
      // bridge isn't installed and Effect spans no-op.
      enabled: process.env.OTEL_ENABLED !== 'false',
      serviceName: process.env.OTEL_SERVICE_NAME ?? 'czo-mazo',
      serviceVersion: process.env.OTEL_SERVICE_VERSION ?? '0.1.0',
      exporter: (process.env.OTEL_EXPORTER ?? 'console') as 'console' | 'otlp',
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
      protocol: 'http' as const,
      samplingRatio: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      logBridge: false,
      instrumentations: {
        http: true,
        pg: true,
      },
    },
  },

  plugins: [],
  modules: [
    '@czo/auth',
    // '@czo/stock-location',
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
