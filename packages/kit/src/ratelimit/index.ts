import { Layer } from 'effect'
import { RateLimiter } from 'effect/unstable/persistence'

/**
 * Kit rate-limiting concern. Re-exports Effect's `RateLimiter` service
 * (`effect/unstable/persistence`) and provides a process-local, memory-backed
 * layer. Swap `layerStoreMemory` -> `RateLimiter.layerStoreRedisConfig(...)`
 * when the deployment goes multi-instance; no enforcement code changes.
 */
export { RateLimiter }

export const RateLimiterLive: Layer.Layer<RateLimiter.RateLimiter> = RateLimiter.layer.pipe(
  Layer.provide(RateLimiter.layerStoreMemory),
)
