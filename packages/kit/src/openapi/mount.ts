import type { H3 } from 'h3'
import type { OpenApiInfo } from './document'
import type { ApiRoute } from './route'
import type { ScalarOptions } from './scalar'
import { html } from 'h3'
import { buildOpenApiDocument } from './document'
import { scalarHtml } from './scalar'

export interface OpenApiDocsConfig {
  readonly info: OpenApiInfo
  readonly jsonPath: string
  readonly uiPath: string
  readonly cdn?: ScalarOptions['cdn']
}

/**
 * Register every `ApiRoute` on the h3 app. When `docs` is provided, also
 * mount `GET {jsonPath}` (the OpenAPI document) and `GET {uiPath}` (the
 * Scalar UI). REST routes are always registered; only the doc endpoints
 * are gated by the caller via whether `docs` is passed.
 */
export function mountOpenApi(
  app: H3,
  routes: readonly ApiRoute[],
  docs?: OpenApiDocsConfig,
): void {
  for (const route of routes)
    app.on(route.method, route.path, route.handler)

  if (!docs)
    return

  const document = buildOpenApiDocument(routes, docs.info)
  app.get(docs.jsonPath, () => document)
  app.get(docs.uiPath, () => html(scalarHtml({ jsonUrl: docs.jsonPath, title: docs.info.title, cdn: docs.cdn })))
}
