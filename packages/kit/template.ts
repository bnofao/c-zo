import { existsSync, promises as fsp } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { basename, isAbsolute, join, normalize, parse, relative, resolve } from 'pathe'
import { hash } from 'ohash'
import type { Nuxt, NuxtServerTemplate, NuxtTemplate, NuxtTypeTemplate, ResolvedNuxtTemplate, TSReference } from '@nuxt/schema'
import { defu } from 'defu'
import type { TSConfig } from 'pkg-types'
import { gte } from 'semver'
import { readPackageJSON } from 'pkg-types'
import { resolveModulePath } from 'exsolve'
import { captureStackTrace } from 'errx'

import { distDirURL, filterInPlace } from './utils.ts'
import { directoryToURL } from './internal/esm.ts'
import { getDirectory } from './module/install.ts'
import { tryUseNuxt, useNuxt } from './context.ts'
import { resolveNuxtModule } from './resolve.ts'
import { getLayerDirectories } from './layers.ts'
import type { LayerDirectories } from './layers.ts'

/**
 * Adds a virtual file that can be used within the Nuxt Nitro server build.
 */
export function addTemplate (template: NuxtServerTemplate): NuxtServerTemplate {
  const nuxt = useNuxt()

  nuxt.options.nitro.virtual ||= {}
  nuxt.options.nitro.virtual[template.filename] = template.getContents

  return template
}