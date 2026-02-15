/**
 * Identity function for annotating Nitro route files with OpenAPI metadata.
 *
 * Nitro extracts `defineRouteMeta(...)` calls via AST analysis at build time —
 * only the function name matters, not the import source. We define it locally
 * because `nitro/runtime` is a virtual module that cannot be resolved outside
 * of Nitro's own build context (e.g. in vitest or unbuild).
 */
export function defineRouteMeta<T>(meta: T): T {
  return meta
}
