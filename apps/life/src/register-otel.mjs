/**
 * ESM loader hook registration for OpenTelemetry auto-instrumentation.
 *
 * Loaded via `node --import ./src/register-otel.mjs ...` BEFORE tsx and
 * any application module. The `module.register()` call here installs
 * `import-in-the-middle`'s loader hook, which is what
 * `@opentelemetry/instrumentation-http` (and friends) need to intercept
 * ESM imports of `node:http`, `node:https`, etc.
 *
 * Without this, the require-in-the-middle hooks that OTel
 * instrumentations install at `sdk.start()` time only fire for CJS
 * `require()` calls — never for ESM `import` — and h3/srvx import
 * `node:http` as ESM, so HTTP server spans are silently absent.
 */
import { register } from 'node:module'

register('@opentelemetry/instrumentation/hook.mjs', import.meta.url)
