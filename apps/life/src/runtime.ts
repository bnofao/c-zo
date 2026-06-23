/**
 * Node environment bindings for the `life` process — the single place that
 * imports `@effect/platform-node`. `@czo/kit/module` is platform-agnostic
 * (`runApp`/`runWorker` take a `runMain` + optional `configProvider`); this
 * module supplies the Node implementations so a different target (Bun, edge)
 * would only need its own sibling here.
 */
import { NodeFileSystem, NodeRuntime } from '@effect/platform-node'
import { ConfigProvider, Layer } from 'effect'

/** Node's `runMain`: signal handling + exit-code reporting. */
export const runMain = NodeRuntime.runMain

/**
 * Adds a `.env` file source on top of the default environment-variable
 * `ConfigProvider`. Reads the file via `NodeFileSystem`, so it's Node-bound.
 */
export const dotEnvConfigProvider: Layer.Layer<never, unknown, never> = ConfigProvider
  .layerAdd(ConfigProvider.fromDotEnv())
  .pipe(Layer.provide(NodeFileSystem.layer))
