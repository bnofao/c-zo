export interface ScalarOptions {
  /** URL the UI fetches the OpenAPI document from, e.g. `/openapi.json`. */
  readonly jsonUrl: string
  readonly title?: string
  /** Script URL for the Scalar bundle. Defaults to the jsDelivr `@scalar/api-reference`. */
  readonly cdn?: string
}

/**
 * Full HTML document that loads Scalar from a CDN and points it at
 * `jsonUrl`. Served as `text/html` by the docs route.
 *
 * NB: the default CDN is the unpinned `@latest` tag — no Subresource
 * Integrity. The docs route is gated off in production; pin a version +
 * add `integrity`/`crossorigin` (or self-host) if exposed beyond dev.
 */
export function scalarHtml(opts: ScalarOptions): string {
  const cdn = opts.cdn ?? 'https://cdn.jsdelivr.net/npm/@scalar/api-reference'
  const title = opts.title ?? 'API Reference'
  return `<!doctype html>
<html>
  <head>
    <title>${title}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="app"></div>
    <script src="${cdn}"></script>
    <script>Scalar.createApiReference('#app', { url: ${JSON.stringify(opts.jsonUrl)} })</script>
  </body>
</html>`
}
