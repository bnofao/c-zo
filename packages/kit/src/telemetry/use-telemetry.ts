/**
 * Singleton accessor for the Telemetry instance.
 *
 * Follows the same singleton pattern as `useContainer()` and `useDatabase()`.
 * On first call, attempts to load the real OTel SDK; falls back to NoopTelemetry
 * if the SDK packages are not installed or if telemetry is disabled.
 */
import type { Telemetry, TelemetryConfig } from './types'
import { NoopTelemetry } from './noop'

let _instance: Telemetry | undefined
let _initPromise: Promise<Telemetry> | undefined

const defaultConfig: TelemetryConfig = {
  enabled: true,
  serviceName: 'czo',
  serviceVersion: '0.0.0',
  endpoint: 'http://localhost:4318',
  protocol: 'http',
  samplingRatio: 1.0,
  logBridge: false,
}

/**
 * Initialize and return the telemetry singleton (async).
 * On first call, tries to load the OTel SDK. Subsequent calls return the cached instance.
 */
export async function useTelemetry(config?: Partial<TelemetryConfig>): Promise<Telemetry> {
  if (_instance) {
    return _instance
  }

  if (_initPromise) {
    return _initPromise
  }

  _initPromise = initTelemetry(config)
  _instance = await _initPromise
  _initPromise = undefined
  return _instance
}

/**
 * Return the telemetry singleton synchronously.
 * Returns NoopTelemetry if init hasn't completed yet.
 */
export function useTelemetrySync(): Telemetry {
  return _instance ?? new NoopTelemetry()
}

/**
 * Shut down the telemetry instance (flush pending exports).
 */
export async function shutdownTelemetry(): Promise<void> {
  if (_instance) {
    await _instance.shutdown()
  }
}

/**
 * Reset the singleton (for testing only).
 */
export function resetTelemetry(): void {
  _instance = undefined
  _initPromise = undefined
}

/* ─── Internal init ─────────────────────────── */

async function initTelemetry(partial?: Partial<TelemetryConfig>): Promise<Telemetry> {
  const config: TelemetryConfig = { ...defaultConfig, ...partial }

  if (!config.enabled) {
    return new NoopTelemetry()
  }

  try {
    const { createSdkTelemetry } = await import('./sdk')
    const sdk = await createSdkTelemetry(config)
    if (sdk) {
      return sdk
    }
  }
  catch {
    // SDK module itself failed to load
  }

  return new NoopTelemetry()
}
