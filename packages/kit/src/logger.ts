import type { ConsolaOptions, ConsolaReporter, LogObject } from 'consola'
import process from 'node:process'
import { consola } from 'consola'
import { getContext } from './telemetry/context'

export const logger = consola

export function useLogger(tag?: string, options: Partial<ConsolaOptions> = {}) {
  return tag ? logger.create(options).withTag(tag) : logger
}

/**
 * JSON reporter for structured logging.
 * Outputs one JSON line per log entry with correlationId/traceId from context.
 */
export class JsonReporter implements ConsolaReporter {
  log(logObj: LogObject): void {
    const ctx = getContext()
    const entry = {
      timestamp: new Date().toISOString(),
      level: logObj.level,
      type: logObj.type,
      tag: logObj.tag || undefined,
      message: logObj.args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '),
      correlationId: ctx?.correlationId,
      traceId: ctx?.traceId,
    }
    process.stdout.write(`${JSON.stringify(entry)}\n`)
  }
}

/**
 * Configure the global logger for production use.
 * Replaces default reporters with a JSON reporter that includes telemetry context.
 */
export function configureLogger(options?: { json?: boolean }): void {
  if (options?.json) {
    logger.setReporters([new JsonReporter()])
  }
}
