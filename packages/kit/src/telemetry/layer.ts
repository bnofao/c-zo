/**
 * Telemetry Layer factory.
 *
 * `makeNodeSdkLayer(config)` returns an Effect Layer that bridges Effect's
 * internal Tracer (driven by `Effect.fn(name)` / `Effect.withSpan`) to
 * **OpenTelemetry's global TracerProvider** — set up elsewhere (typically
 * by `apps/<app>/server.ts` calling `NodeSDK.start()` at boot time).
 *
 * No SDK initialization happens here: no exporter, no instrumentation
 * registration, no shutdown lifecycle. The provider is global state owned
 * by the boot entry. This Layer is purely the Effect ↔ OTel bridge.
 *
 * If `config.enabled` is `false`, returns an empty Layer — Effect's default
 * noop Tracer remains in place and `Effect.fn(...)` emits no spans.
 *
 * Composed into the kit's main runtime infra Layer alongside `DrizzleDbLive`.
 */
import type { TelemetryConfig } from './types'
import { Resource, Tracer } from '@effect/opentelemetry'
import { Layer } from 'effect'

export function makeNodeSdkLayer(config: TelemetryConfig): Layer.Layer<never, never, never> {
  if (!config.enabled) {
    return Layer.empty as Layer.Layer<never, never, never>
  }

  // Resource Tag carries the service identity. `Tracer.layerGlobal` reads
  // from the global OTel TracerProvider already initialized by the boot
  // entry, so we don't need to install our own provider here — just match
  // its service name/version so derived spans get the right resource attrs.
  const ResourceLive = Resource.layer({
    serviceName: config.serviceName,
    serviceVersion: config.serviceVersion,
  })

  return Tracer.layerGlobal.pipe(
    Layer.provide(ResourceLive),
  ) as unknown as Layer.Layer<never, never, never>
}
