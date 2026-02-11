/**
 * Module-authoring utilities safe for use at Nitro config-loading time.
 *
 * Unlike the main `@czo/kit` barrel, this subpath does NOT import
 * `nitro/runtime-config`, so it can be evaluated before Nitro's
 * virtual modules are available.
 *
 * Use `@czo/kit/author` in your module's `defineNitroModule` entry,
 * and `@czo/kit` / `@czo/kit/config` only in plugins and handlers
 * that run after Nitro boots.
 */
export { defineNitroModule } from './module'
export {
  addDevHandler,
  addHandler,
  addImports,
  addImportsDir,
  addImportsSources,
  addPlugin,
  addScanDir,
} from './nitro'
export type { ResolvePathOptions, Resolver } from './resolve'
export {
  createResolver,
  directoryToURL,
  findPath,
  resolveAlias,
  resolveFiles,
  resolvePath,
} from './resolve'
