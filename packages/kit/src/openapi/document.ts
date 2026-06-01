import type { OpenAPIV3_1 } from 'openapi-types'
import type { ApiRoute } from './route'

export interface OpenApiInfo {
  readonly title: string
  readonly version: string
  readonly description?: string
}

/** Convert h3 `:param` segments to OpenAPI `{param}`. */
export function toOpenApiPath(path: string): string {
  return path.replace(/:(\w+)/g, '{$1}')
}

/**
 * Build an OpenAPI 3.1 document from the aggregated route list. Pure — no
 * failure path. On a duplicate (method, path) the last operation wins;
 * callers detect duplicates separately via `findDuplicateRoutes`.
 */
export function buildOpenApiDocument(
  routes: readonly ApiRoute[],
  info: OpenApiInfo,
): OpenAPIV3_1.Document {
  const paths: OpenAPIV3_1.PathsObject = {}
  for (const route of routes) {
    const key = toOpenApiPath(route.path)
    const item: OpenAPIV3_1.PathItemObject = paths[key] ?? {}
    ;(item as Record<string, OpenAPIV3_1.OperationObject>)[route.method] = route.operation
    paths[key] = item
  }
  return { openapi: '3.1.0', info, paths }
}

/** Return each duplicated `METHOD /path` label exactly once, in first-seen order. */
export function findDuplicateRoutes(routes: readonly ApiRoute[]): string[] {
  const seen = new Set<string>()
  const reported = new Set<string>()
  const dupes: string[] = []
  for (const route of routes) {
    const label = `${route.method.toUpperCase()} ${route.path}`
    if (seen.has(label)) {
      if (!reported.has(label)) {
        reported.add(label)
        dupes.push(label)
      }
    }
    else {
      seen.add(label)
    }
  }
  return dupes
}
