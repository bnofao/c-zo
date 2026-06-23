/**
 * Node environment bindings for the `life` process — the single place that
 * imports `@effect/platform-node`. `@czo/kit/module` is platform-agnostic
 * (`runApp`/`runWorker` take a `runMain` + optional `configProvider`); this
 * module supplies the Node implementations so a different target (Bun, edge)
 * would only need its own sibling here.
 */
import { NodeFileSystem, NodeRuntime } from '@effect/platform-node'
import process from 'node:process'
import { ConfigProvider, Effect, Layer } from 'effect'
import { FetchHttpClient } from 'effect/unstable/http'
import { Otlp } from 'effect/unstable/observability'

/** Node's `runMain`: signal handling + exit-code reporting. */
export const runMain = NodeRuntime.runMain

/**
 * Adds a `.env` file source on top of the default environment-variable
 * `ConfigProvider`. Reads the file via `NodeFileSystem`, so it's Node-bound.
 *
 * `.env` is OPTIONAL — containers (and CI) supply config via real env vars and
 * ship no `.env`. `fromDotEnv` fails with `NotFound` when the file is absent,
 * so fall back to the plain env-var provider; otherwise the process crashes at
 * boot in any environment without a `.env`.
 */
export const dotEnvConfigProvider: Layer.Layer<never, unknown, never> = ConfigProvider
  .layerAdd(ConfigProvider.fromDotEnv().pipe(Effect.orElseSucceed(() => ConfigProvider.fromEnv())))
  .pipe(Layer.provide(NodeFileSystem.layer))

/**
 * Effect-native OTLP export layer (logs + metrics + traces) for the given
 * service name, or `undefined` when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset
 * (telemetry off). `serviceName` is the per-process default; `OTEL_SERVICE_NAME`
 * overrides it. Passed to `runApp`/`runWorker` as their `runtimeLayer`.
 */
export function makeTelemetryLayer(serviceName: string): Layer.Layer<never, never, never> | undefined {
  const baseUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (!baseUrl)
    return undefined
  return Otlp.layerProtobuf({
    baseUrl,
    resource: { serviceName: process.env.OTEL_SERVICE_NAME ?? serviceName, serviceVersion: '0.1.0' },
  }).pipe(Layer.provide(FetchHttpClient.layer))
}
