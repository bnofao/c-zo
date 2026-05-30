import type { EventHandler } from 'h3'
import type { OpenAPIV3_1 } from 'openapi-types'

/** HTTP methods we expose as REST routes. */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

/**
 * A single declarative REST route. Registered on the host `H3` app AND
 * aggregated into the OpenAPI document, so path/method/operation are a
 * single source of truth.
 */
export interface ApiRoute {
  readonly method: HttpMethod
  /** h3-style path, e.g. `/widgets/:id`. Converted to `{id}` in the document. */
  readonly path: string
  /** Hand-written OpenAPI Operation Object (summary, tags, parameters, responses…). */
  readonly operation: OpenAPIV3_1.OperationObject
  /** Plain h3 handler — the same shape `defineHandler` produces. */
  readonly handler: EventHandler
}

/** Identity helper that gives inference + a stable definition site. */
export function defineApiRoute(route: ApiRoute): ApiRoute {
  return route
}
