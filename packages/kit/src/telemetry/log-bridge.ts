/**
 * Consola → OpenTelemetry Log Bridge.
 *
 * Installs a consola reporter that forwards log records to the
 * OTel LoggerProvider via @opentelemetry/api-logs. This enables
 * log correlation in backends like Grafana Loki.
 *
 * Only active when `logBridge: true` in TelemetryConfig AND
 * the @opentelemetry/api-logs package is installed.
 */
import type { ConsolaReporter, LogObject } from 'consola'
import { getContext } from './context'

const SEVERITY_MAP: Record<number, number> = {
  0: 1, // fatal → FATAL
  1: 5, // error → ERROR
  2: 9, // warn  → WARN
  3: 13, // info  → INFO
  4: 17, // debug → DEBUG
  5: 21, // trace → TRACE
}

/**
 * Creates a consola reporter that bridges logs to the OTel LoggerProvider.
 * Returns null if @opentelemetry/api-logs is not installed.
 */
export async function createLogBridgeReporter(): Promise<ConsolaReporter | null> {
  try {
    // @ts-expect-error optional peer dependency
    const { logs } = await import('@opentelemetry/api-logs')
    const otelLogger = logs.getLogger('czo')

    const reporter: ConsolaReporter = {
      log(logObj: LogObject): void {
        const ctx = getContext()
        otelLogger.emit({
          severityNumber: SEVERITY_MAP[logObj.level] ?? 13,
          body: logObj.args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '),
          attributes: {
            'log.type': logObj.type,
            ...(logObj.tag ? { 'log.tag': logObj.tag } : {}),
            ...(ctx?.correlationId ? { 'correlation.id': ctx.correlationId } : {}),
            ...(ctx?.traceId ? { 'trace.id': ctx.traceId } : {}),
          },
        })
      },
    }

    return reporter
  }
  catch {
    return null
  }
}
