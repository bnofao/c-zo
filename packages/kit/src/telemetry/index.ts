/* ─── Configuration ─────────────────────────── */
export type { TelemetryConfig } from './types'

/* ─── Context propagation (AsyncLocalStorage) ─ */
export type { TelemetryContext } from './context'
export {
  getContext,
  getCorrelationId,
  getTraceId,
  runWithContext,
} from './context'

/* ─── Effect Layer factory ──────────────────── */
export { makeNodeSdkLayer } from './layer'

/* ─── Optional log bridge (consola → OTel) ─── */
export { createLogBridgeReporter } from './log-bridge'
