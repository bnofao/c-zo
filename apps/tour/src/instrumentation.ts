// Server-only OpenTelemetry init for tour (TanStack Start / Nitro). Preloaded
// before the app via `node --import` (see Dockerfile, Task B3) so module
// patching happens before app imports. Telemetry is OFF when
// OTEL_EXPORTER_OTLP_ENDPOINT is unset (the SDK then has nowhere to export).
//
// - OTLPTraceExporter reads OTEL_EXPORTER_OTLP_ENDPOINT and appends /v1/traces.
// - UndiciInstrumentation patches Node's native fetch → injects W3C `traceparent`
//   on the outgoing call to life (life joins the trace; see kit parseTraceparent).
// - HttpInstrumentation creates a span per incoming request.
import process from 'node:process'

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'tour',
      [ATTR_SERVICE_VERSION]: '0.1.0',
    }),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [new HttpInstrumentation(), new UndiciInstrumentation()],
  })
  sdk.start()
  process.on('SIGTERM', () => {
    void sdk.shutdown()
  })
}
