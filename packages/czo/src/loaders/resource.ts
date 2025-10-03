import type { Logger, MedusaContainer } from '@medusajs/framework/types'
import type { Dirent } from 'node:fs'
import { access } from 'node:fs/promises'
import { join, parse } from 'node:path'
import {
  ContainerRegistrationKeys,
  dynamicImport,
  promiseAll,
  readDirRecursive,
} from '@medusajs/framework/utils'

export abstract class ResourceLoader {
  /**
   * The name of the resource (e.g job, subscriber, workflow)
   */
  protected abstract resourceName: string

  /**
   * The directory from which to load the jobs
   * @private
   */
  #sourceDir: string | string[]

  /**
   * The list of file names to exclude from the subscriber scan
   * @private
   */
  // eslint-disable-next-line regexp/no-super-linear-backtracking, regexp/optimal-quantifier-concatenation
  #excludes: RegExp[] = [/^_[^/\\]*(\.[^/\\]+)?$/]

  protected logger: Logger

  constructor(sourceDir: string | string[], container: MedusaContainer) {
    this.#sourceDir = sourceDir
    this.logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  }

  /**
   * Discover resources from the source directory
   * @param options - The options for the discoverResources method
   * @param options.exclude - custom exclusion regexes
   * @param options.customFiltering - custom filtering function
   * @returns The resources discovered
   */
  protected async discoverResources({
    exclude,
    customFiltering,
  }: {
    exclude?: RegExp[]
    customFiltering?: (entry: Dirent) => boolean
  } = {}): Promise<Record<string, unknown>[]> {
    exclude ??= []
    customFiltering ??= (entry: Dirent) => {
      const parsedName = parse(entry.name)

      return (
        !entry.isDirectory()
        && parsedName.name !== 'index'
        && !parsedName.base.endsWith('.d.ts')
        && ['.js', '.ts'].includes(parsedName.ext)
        && !this.#excludes.some(exclude => exclude.test(parsedName.base))
        && !exclude.some(exclude => exclude.test(parsedName.base))
      )
    }

    const normalizedSourcePath = Array.isArray(this.#sourceDir)
      ? this.#sourceDir
      : [this.#sourceDir]

    const promises = normalizedSourcePath.map(async (sourcePath) => {
      try {
        await access(sourcePath)
      }
      catch {
        this.logger.info(
          `No ${this.resourceName} to load from ${sourcePath}. skipped.`,
        )
        return
      }

      return await readDirRecursive(sourcePath).then(async (entries) => {
        const fileEntries = entries.filter((entry: Dirent) =>
          customFiltering(entry),
        )

        return await promiseAll(
          fileEntries.map(async (entry: Dirent) => {
            const fullPath = join(entry.path, entry.name)

            const module_ = await dynamicImport(fullPath)

            await this.onFileLoaded(fullPath, module_)
            return module_
          }),
        )
      })
    })

    const resources = await promiseAll(promises)
    return resources.flat().filter(Boolean)
  }

  /**
   * Called when a file is imported
   * @param path - The path of the file
   * @param fileExports - The exports of the file
   */
  protected abstract onFileLoaded(
    path: string,
    fileExports: Record<string, unknown>
  ): Promise<void> | never
}
