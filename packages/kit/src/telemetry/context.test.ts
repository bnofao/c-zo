import { describe, expect, it } from 'vitest'
import { getContext, getCorrelationId, getTraceId, runWithContext } from './context'

describe('telemetry context', () => {
  it('returns undefined outside a context', () => {
    expect(getContext()).toBeUndefined()
    expect(getCorrelationId()).toBeUndefined()
    expect(getTraceId()).toBeUndefined()
  })

  it('provides context within runWithContext', () => {
    const ctx = {
      correlationId: 'corr-123',
      traceId: 'aaaa0000bbbb1111cccc2222dddd3333',
      parentSpanId: 'eeee4444ffff5555',
    }

    runWithContext(ctx, () => {
      expect(getContext()).toEqual(ctx)
      expect(getCorrelationId()).toBe('corr-123')
      expect(getTraceId()).toBe('aaaa0000bbbb1111cccc2222dddd3333')
    })
  })

  it('restores undefined after context exits', () => {
    runWithContext({ correlationId: 'temp' }, () => {
      expect(getCorrelationId()).toBe('temp')
    })

    expect(getCorrelationId()).toBeUndefined()
  })

  it('supports nested contexts with inner overriding outer', () => {
    runWithContext({ correlationId: 'outer' }, () => {
      expect(getCorrelationId()).toBe('outer')

      runWithContext({ correlationId: 'inner', traceId: 'trace-inner' }, () => {
        expect(getCorrelationId()).toBe('inner')
        expect(getTraceId()).toBe('trace-inner')
      })

      // Outer context restored
      expect(getCorrelationId()).toBe('outer')
      expect(getTraceId()).toBeUndefined()
    })
  })

  it('isolates concurrent contexts', async () => {
    const results: string[] = []

    await Promise.all([
      new Promise<void>((resolve) => {
        runWithContext({ correlationId: 'ctx-a' }, async () => {
          await delay(10)
          results.push(`a:${getCorrelationId()}`)
          resolve()
        })
      }),
      new Promise<void>((resolve) => {
        runWithContext({ correlationId: 'ctx-b' }, async () => {
          await delay(5)
          results.push(`b:${getCorrelationId()}`)
          resolve()
        })
      }),
    ])

    expect(results).toContain('a:ctx-a')
    expect(results).toContain('b:ctx-b')
  })

  it('handles context with only correlationId (no traceId)', () => {
    runWithContext({ correlationId: 'minimal' }, () => {
      expect(getCorrelationId()).toBe('minimal')
      expect(getTraceId()).toBeUndefined()
      expect(getContext()?.parentSpanId).toBeUndefined()
    })
  })
})

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
