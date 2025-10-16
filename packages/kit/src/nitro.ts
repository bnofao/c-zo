import type { Nitro, NitroDevEventHandler, NitroEventHandler } from 'nitro/types'
import type { Import, InlinePreset } from 'unimport'
import { normalize } from 'pathe'
import { toArray } from './utils'

const HANDLER_METHOD_RE = /\.(get|head|patch|post|put|delete|connect|options|trace)(\.\w+)*$/
/**
 * normalize handler object
 *
 */
function normalizeHandlerMethod(handler: NitroEventHandler) {
  // retrieve method from handler file name
  const [, method = undefined] = handler.handler.match(HANDLER_METHOD_RE) || []
  return {
    method: method as 'GET' | 'HEAD' | 'PATCH' | 'POST' | 'PUT' | 'DELETE' | 'CONNECT' | 'OPTIONS' | 'TRACE',
    ...handler,
    handler: normalize(handler.handler),
  }
}

/**
 * Adds a nitro server handler
 *
 */
export function addHandler(handler: NitroEventHandler, nitro: Nitro) {
  nitro.options.handlers.push(normalizeHandlerMethod(handler))
}

/**
 * Adds a nitro server handler for development-only
 *
 */
export function addDevHandler(handler: NitroDevEventHandler, nitro: Nitro) {
  nitro.options.devHandlers.push(handler)
}

/**
 * Adds a Nitro plugin
 */
export function addPlugin(plugin: string, nitro: Nitro) {
  nitro.options.plugins ||= []
  nitro.options.plugins.push(normalize(plugin))
}

/**
 * Add server imports to be auto-imported by Nitro
 */
export function addImports(imports: Import | Import[], nitro: Nitro) {
  const _imports = toArray(imports)
  if (nitro.options.imports !== false) {
    nitro.options.imports.imports ||= []
    nitro.options.imports.imports.push(..._imports)
  }
}

/**
 * Add directories to be scanned for auto-imports by Nitro
 */
export function addImportsDir(dirs: string | string[], nitro: Nitro, opts: { prepend?: boolean } = {}) {
  const _dirs = toArray(dirs)
  if (nitro.options.imports) {
    nitro.options.imports.dirs ||= []
    nitro.options.imports.dirs[opts.prepend ? 'unshift' : 'push'](..._dirs)
  }
}

/**
 * Add directories to be scanned by Nitro. It will check for subdirectories,
 * which will be registered just like the `~/server` folder is.
 */
export function addScanDir(dirs: string | string[], nitro: Nitro, opts: { prepend?: boolean } = {}) {
  const _dirs = toArray(dirs)
  nitro.options.scanDirs[opts.prepend ? 'unshift' : 'push'](..._dirs)
}

export function addImportsSources(presets: InlinePreset | InlinePreset[], nitro: Nitro) {
  if (nitro.options.imports !== false) {
    nitro.options.imports.presets.push(...toArray(presets))
  }
}
