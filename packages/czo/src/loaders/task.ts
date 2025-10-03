import type { MedusaContainer } from '@medusajs/types'
import type { CommandContext, CommandDef, CommandMeta } from 'citty'
import { basename, extname } from 'node:path'
import { container } from '@medusajs/framework'
import { isFileSkipped } from '@medusajs/framework/utils'
import { asValue } from 'awilix'
import { ResourceLoader } from './resource'

export type TaskConfig = Omit<CommandDef, 'run' | 'subCommands'>

export type TaskHandler = (commandContext: CommandContext, container: MedusaContainer) => Promise<unknown>

export type Tasks = Record<string, {
  name: string
  handler: TaskHandler
  config: TaskConfig
}>

export const TASKS = 'tasks'

export class TaskLoader extends ResourceLoader {
  protected resourceName = 'task'

  protected tasks: Tasks = {}

  constructor(sourceDir: string | string[], container: MedusaContainer) {
    super(sourceDir, container)
  }

  protected async onFileLoaded(
    path: string,
    fileExports: {
      default: TaskHandler
      config: TaskConfig
    },
  ) {
    if (isFileSkipped(fileExports)) {
      return
    }

    const config = fileExports.config
    const meta = typeof config.meta === 'function' ? await config.meta() : await config.meta
    const { name, filename } = await this.getTaskName(path, meta)

    config.meta = meta ? { ...meta, name } : { name }
    this.tasks[filename] = {
      name,
      handler: fileExports.default,
      config,
    }
  }

  /**
   * Get the name of the task
   * @param path
   * @param meta
   * @protected
   */
  protected async getTaskName(path: string, meta?: CommandMeta) {
    const filename = basename(path, extname(path))
    const name = meta?.name || basename(path, extname(path))
    return { filename, name }
  }

  protected registerTasks() {
    container.register(TASKS, asValue(this.tasks))
  }

  /**
   * Load tasks from one or multiple source paths
   */
  async load() {
    await super.discoverResources()
    this.registerTasks()
  }
}
