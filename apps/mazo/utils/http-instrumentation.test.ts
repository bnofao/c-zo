import type { HttpMetrics } from './http-instrumentation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getContext, NoopTelemetry } from '@czo/kit/telemetry'
import { createHttpInstrumentation } from './http-instrumentation'

function createMockMetrics(): HttpMetrics {
  return {
    requestCount: { add: vi.fn() },
    requestDuration: { record: vi.fn() },
    activeRequests: { add: vi.fn() },
  }
}

describe('createHttpInstrumentation', () => {
  let metrics: HttpMetrics
  let instrument: ReturnType<typeof createHttpInstrumentation>

  beforeEach(() => {
    metrics = createMockMetrics()
    instrument = createHttpInstrumentation({
      telemetry: new NoopTelemetry(),
      metrics,
    })
  })

  it('runs handler and returns its result', async () => {
    const req = { method: 'GET', url: '/api/products', headers: {} }
    const res = { statusCode: 200 }

    const result = await instrument(req, res, async () => 'ok')
    expect(result).toBe('ok')
  })

  it('provides telemetry context inside handler', async () => {
    const req = {
      method: 'POST',
      url: '/api/orders',
      headers: { 'x-correlation-id': 'corr-from-header' },
    }
    const res = { statusCode: 201 }

    let capturedCtx: ReturnType<typeof getContext>
    await instrument(req, res, async () => {
      capturedCtx = getContext()
    })

    expect(capturedCtx!).toBeDefined()
    expect(capturedCtx!.correlationId).toBe('corr-from-header')
  })

  it('generates a correlationId when header is absent', async () => {
    const req = { method: 'GET', url: '/', headers: {} }
    const res = { statusCode: 200 }

    let capturedCtx: ReturnType<typeof getContext>
    await instrument(req, res, async () => {
      capturedCtx = getContext()
    })

    expect(capturedCtx!).toBeDefined()
    expect(capturedCtx!.correlationId).toBeTruthy()
    // Should be a valid UUID
    expect(capturedCtx!.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('records active request metrics (increment before, decrement after)', async () => {
    const req = { method: 'GET', url: '/health', headers: {} }
    const res = { statusCode: 200 }

    await instrument(req, res, async () => 'ok')

    const calls = (metrics.activeRequests.add as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0]).toEqual([1, { 'http.method': 'GET' }])
    expect(calls[1]).toEqual([-1, { 'http.method': 'GET' }])
  })

  it('records request count and duration on success', async () => {
    const req = { method: 'GET', url: '/api', headers: {} }
    const res = { statusCode: 200 }

    await instrument(req, res, async () => 'ok')

    expect(metrics.requestCount.add).toHaveBeenCalledWith(1, { 'http.method': 'GET', 'http.status_code': 200 })
    expect(metrics.requestDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      { 'http.method': 'GET' },
    )
  })

  it('records error metrics on handler failure', async () => {
    const req = { method: 'POST', url: '/api', headers: {} }
    const res = {}

    await expect(
      instrument(req, res, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    expect(metrics.requestCount.add).toHaveBeenCalledWith(1, { 'http.method': 'POST', 'http.status_code': 500 })
    expect(metrics.requestDuration.record).toHaveBeenCalled()
  })

  it('extracts correlation ID from array header value', async () => {
    const req = {
      method: 'GET',
      url: '/',
      headers: { 'x-correlation-id': ['first-value', 'second-value'] },
    }
    const res = { statusCode: 200 }

    let capturedCtx: ReturnType<typeof getContext>
    await instrument(req, res, async () => {
      capturedCtx = getContext()
    })

    expect(capturedCtx!.correlationId).toBe('first-value')
  })
})
