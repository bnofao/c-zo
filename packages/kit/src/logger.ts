import type { ConsolaOptions, ConsolaReporter, LogObject } from 'consola'
import process from 'node:process'
import { consola } from 'consola'

export const logger = consola

export function useLogger(tag?: string, options: Partial<ConsolaOptions> = {}) {
  return tag ? logger.create(options).withTag(tag) : logger
}

/**
 * JSON reporter for structured logging. Outputs one JSON line per entry.
 * Correlation/trace IDs (formerly wired via the deleted telemetry context)
 * are dropped — add them back via a custom reporter once telemetry is restored.
 */
export class JsonReporter implements ConsolaReporter {
  log(logObj: LogObject): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level: logObj.level,
      type: logObj.type,
      tag: logObj.tag || undefined,
      message: logObj.args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '),
    }
    process.stdout.write(`${JSON.stringify(entry)}\n`)
  }
}

/**
 * Configure the global logger for production use.
 * Replaces default reporters with a JSON reporter.
 */
export function configureLogger(options?: { json?: boolean }): void {
  if (options?.json) {
    logger.setReporters([new JsonReporter()])
  }
}
