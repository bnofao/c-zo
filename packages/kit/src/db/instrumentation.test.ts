import type { DbMetrics } from './instrumentation'
import { describe, expect, it, vi } from 'vitest'
import { createRepositoryInstrumentation } from './instrumentation'

function createMockMetrics(): DbMetrics {
  return {
    queryCount: { add: vi.fn() },
    queryDuration: { record: vi.fn() },
    queryErrors: { add: vi.fn() },
  } as unknown as DbMetrics
}

// The OTel API's default ProxyTracer is a no-op when no provider is
// registered — so we don't need to inject a fake. `metrics` IS injected
// because the noop Tracer doesn't observe our counters; we want to assert
// on them directly.

describe('createRepositoryInstrumentation', () => {
  it('runs fn and returns its result', async () => {
    const metrics = createMockMetrics()
    const { withSpan } = createRepositoryInstrumentation({
      name: 'ProductRepository',
      metrics,
    })

    const result = await withSpan('findById', async () => {
      return { id: '1', title: 'Test' }
    })

    expect(result).toEqual({ id: '1', title: 'Test' })
  })

  it('records query count and duration on success', async () => {
    const metrics = createMockMetrics()
    const { withSpan } = createRepositoryInstrumentation({
      name: 'ProductRepository',
      metrics,
    })

    await withSpan('findAll', async () => [])

    expect(metrics.queryCount.add).toHaveBeenCalledWith(1, { 'db.operation': 'findAll' })
    expect(metrics.queryDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      { 'db.operation': 'findAll' },
    )
  })

  it('records error metrics on failure and re-throws', async () => {
    const metrics = createMockMetrics()
    const { withSpan } = createRepositoryInstrumentation({
      name: 'OrderRepository',
      metrics,
    })

    await expect(
      withSpan('create', async () => {
        throw new Error('unique constraint violated')
      }),
    ).rejects.toThrow('unique constraint violated')

    expect(metrics.queryErrors.add).toHaveBeenCalledWith(1, { 'db.operation': 'create' })
    expect(metrics.queryDuration.record).toHaveBeenCalled()
  })

  it('provides span to the callback for custom attributes', async () => {
    const metrics = createMockMetrics()
    const { withSpan } = createRepositoryInstrumentation({
      name: 'ProductRepository',
      metrics,
    })

    await withSpan('findById', async (span) => {
      span.setAttribute('db.query.id', 'prod-123')
      return null
    })
    // No assertion needed — just verifies span methods are callable
  })
})
