import type { Nitro } from 'nitro/types'
import type { GlobOptions } from 'tinyglobby'
import type { RequirePicked } from './utils'
import { promises as fsp } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveModulePath } from 'exsolve'
import { parseNodeModulePath } from 'mlly'
import { basename, dirname, isAbsolute, join, normalize, resolve } from 'pathe'
import { resolveAlias as _resolveAlias } from 'pathe/utils'
import { glob } from 'tinyglobby'
import { directoryToURL } from './internal/esm'
// import { tryUseNuxt } from './context'
// import { isIgnored } from './ignore'
import { toArray } from './utils'

export interface ResolvePathOptions {
  /** Base for resolving paths from. Default is Nuxt rootDir. */
  cwd?: string

  /** An object of aliases. Default is Nuxt configured aliases. */
  alias?: Record<string, string>

  /**
   * The file extensions to try.
   * Default is Nuxt configured extensions.
   *
   * Isn't considered when `type` is set to `'dir'`.
   */
  extensions?: string[]

  /**
   * Whether to resolve files that exist in the Nuxt VFS (for example, as a Nuxt template).
   * @default false
   */
  virtual?: boolean

  /**
   * Whether to fallback to the original path if the resolved path does not exist instead of returning the normalized input path.
   * @default false
   */
  fallbackToOriginal?: boolean
  /**
   * The type of the path to be resolved.
   * @default 'file'
   */
  type?: PathType
}

/**
 * Resolve the full path to a file or a directory (based on the provided type), respecting Nuxt alias and extensions options.
 *
 * If a path cannot be resolved, normalized input will be returned unless the `fallbackToOriginal` option is set to `true`,
 * in which case the original input path will be returned.
 */
export async function resolvePath(path: string, nitro?: Nitro, opts: ResolvePathOptions = {}): Promise<string> {
  const { type = 'file' } = opts

  const res = await _resolvePathGranularly(path, nitro, { ...opts, type })

  if (res.type === type) {
    return res.path
  }

  // Return normalized input
  return opts.fallbackToOriginal ? path : res.path
}

/**
 * Try to resolve first existing file in paths
 */
export async function findPath(paths: string | string[], nitro?: Nitro, opts?: ResolvePathOptions, pathType: PathType = 'file'): Promise<string | null> {
  for (const path of toArray(paths)) {
    const res = await _resolvePathGranularly(path, nitro, {
      ...opts,
      // TODO: this is for backwards compatibility, remove the `pathType` argument in Nuxt 5
      type: opts?.type || pathType,
    })

    if (!res.type || (pathType && res.type !== pathType)) {
      continue
    }

    // Check file system
    if (res.virtual || await existsSensitive(res.path)) {
      return res.path
    }
  }
  return null
}

/**
 * Resolve path aliases respecting Nuxt alias options
 */
export function resolveAlias(path: string, nitro?: Nitro, alias?: Record<string, string>): string {
  alias ||= nitro?.options.alias || {}
  return _resolveAlias(path, alias)
}

export interface Resolver {
  resolve: (...path: string[]) => string
  resolvePath: (path: string, opts?: ResolvePathOptions) => Promise<string>
}

/**
 * Create a relative resolver
 */
export function createResolver(base: string | URL, nitro?: Nitro): Resolver {
  if (!base) {
    throw new Error('`base` argument is missing for createResolver(base)!')
  }

  base = base.toString()
  if (base.startsWith('file://')) {
    base = dirname(fileURLToPath(base))
  }

  return {
    resolve: (...path) => resolve(base as string, ...path),
    resolvePath: (path, opts) => resolvePath(path, nitro, { cwd: base as string, ...opts }),
  }
}

export async function resolveNuxtModule(base: string, paths: string[]): Promise<string[]> {
  const resolved: string[] = []
  const resolver = createResolver(base)

  for (const path of paths) {
    if (path.startsWith(base)) {
      resolved.push(path.split('/index.ts')[0]!)
      continue
    }
    const resolvedPath = await resolver.resolvePath(path)
    const dir = parseNodeModulePath(resolvedPath).dir
    if (dir) {
      resolved.push(dir)
      continue
    }
    const index = resolvedPath.lastIndexOf(path)
    resolved.push(index === -1 ? dirname(resolvedPath) : resolvedPath.slice(0, index + path.length))
  }

  return resolved
}

// --- Internal ---

type PathType = 'file' | 'dir'

interface PathResolution {
  path: string
  type?: PathType
  virtual?: boolean
}

async function _resolvePathType(path: string, skipFs = false): Promise<PathResolution | undefined> {
  if (skipFs) {
    return
  }

  const fd = await fsp.open(path, 'r').catch(() => null)
  try {
    const stats = await fd?.stat()
    if (stats) {
      return {
        path,
        type: stats.isFile() ? 'file' : 'dir',
        virtual: false,
      }
    }
  }
  finally {
    fd?.close()
  }
}

function normalizeExtension(ext: string) {
  return ext.startsWith('.') ? ext : `.${ext}`
}

async function _resolvePathGranularly(path: string, nitro?: Nitro, opts: RequirePicked<ResolvePathOptions, 'type'> = { type: 'file' }, extensions: string[] = ['.ts', '.mjs', '.cjs', '.json']): Promise<PathResolution> {
  // Always normalize input
  const _path = path
  path = normalize(path)

  // Fast return if the path exists
  if (isAbsolute(path)) {
    const res = await _resolvePathType(path)
    if (res && res.type === opts.type) {
      return res
    }
  }

  // eslint-disable-next-line node/prefer-global/process
  const cwd = opts.cwd || (nitro ? nitro.options.rootDir : process.cwd())

  // Resolve aliases
  path = _resolveAlias(path, opts.alias ?? nitro?.options.alias ?? {})

  // Resolve relative to cwd
  if (!isAbsolute(path)) {
    path = resolve(cwd, path)
  }

  const res = await _resolvePathType(path)
  if (res && res.type === opts.type) {
    return res
  }

  // Check possible extensions
  if (opts.type === 'file') {
    for (const ext of extensions) {
      const normalizedExt = normalizeExtension(ext)

      // path.[ext]
      const extPath = await _resolvePathType(path + normalizedExt)
      if (extPath && extPath.type === 'file') {
        return extPath
      }

      // path/index.[ext]
      const indexPath = await _resolvePathType(join(path, `index${normalizedExt}`), res?.type !== 'dir' /* skip checking if parent is not a directory */)
      if (indexPath && indexPath.type === 'file') {
        return indexPath
      }
    }

    // Try to resolve as module id
    const resolvedModulePath = resolveModulePath(_path, {
      try: true,
      suffixes: ['', 'index'],
      from: [cwd].map(d => directoryToURL(d)),
    })
    if (resolvedModulePath) {
      return {
        path: resolvedModulePath,
        type: 'file',
        virtual: false,
      }
    }
  }

  // Return normalized input
  return {
    path,
  }
}

async function existsSensitive(path: string) {
  const dirFiles = new Set(await fsp.readdir(dirname(path)).catch(() => []))
  return dirFiles.has(basename(path))
}

/**
 * Resolve absolute file paths in the provided directory with respect to `.nuxtignore` and return them sorted.
 * @param path path to the directory to resolve files in
 * @param pattern glob pattern or an array of glob patterns to match files
 * @param opts options for globbing
 * @param opts.followSymbolicLinks whether to follow symbolic links, default is `true`
 * @param opts.ignore additional glob patterns to ignore
 * @returns sorted array of absolute file paths
 */
export async function resolveFiles(path: string, pattern: string | string[], opts: { followSymbolicLinks?: boolean, ignore?: GlobOptions['ignore'] } = {}) {
  const files: string[] = []
  for (const p of await glob(pattern, { cwd: path, followSymbolicLinks: opts.followSymbolicLinks ?? true, absolute: true, ignore: opts.ignore })) {
    files.push(p)
  }
  return files.sort()
}
