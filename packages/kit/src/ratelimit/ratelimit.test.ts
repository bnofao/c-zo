import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { RateLimiter, RateLimiterLive } from './index'

describe('RateLimiterLive (memory)', () => {
  it.effect('allows up to the limit then fails with RateLimiterError', () =>
    Effect.gen(function* () {
      const rl = yield* RateLimiter.RateLimiter
      const consume = () => rl.consume({
        key: 'test:key',
        limit: 2,
        window: '60 seconds',
        algorithm: 'fixed-window',
        onExceeded: 'fail',
      })

      const first = yield* consume()
      expect(first.remaining).toBe(1)
      yield* consume() // second — still allowed

      const failure = yield* consume().pipe(Effect.flip)
      expect(failure).toBeInstanceOf(RateLimiter.RateLimiterError)
      expect(failure.reason._tag).toBe('RateLimitExceeded')
    }).pipe(Effect.provide(RateLimiterLive)))
})
