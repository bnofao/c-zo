import type { Tasks } from '@czo/loaders'
import type { ExecArgs, MedusaContainer } from '@medusajs/framework/types'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import loaders, { TASKS } from '@czo/loaders'
import { ContainerRegistrationKeys, dynamicImport, isFileSkipped } from '@medusajs/framework/utils'
import { defineCommand } from 'citty'

function fileCommand(container: MedusaContainer) {
  return defineCommand({
    meta: {
      name: 'file',
      description: 'Run task from a file',
    },
    args: {
      path: {
        type: 'positional',
        description: 'The path to the file',
        required: true,
      },
      payload: {
        type: 'string',
        description: 'The arguments to pass to the task',
      },
    },
    async run({ args }) {
      const { path: file, payload } = args

      if (!file || !payload) {
        throw new Error('File and payload are required')
      }

      const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

      logger.info(`Executing script at ${file}...`)
      const directory = process.cwd()

      try {
      // check if the file exists
        const filePath = path.resolve(directory, file)
        if (!existsSync(filePath)) {
          throw new Error(`File ${filePath} doesn't exist.`)
        }

        const scriptToExec = (await dynamicImport(path.resolve(filePath))).default

        if (isFileSkipped(scriptToExec)) {
          throw new Error(`File is disabled.`)
        }

        if (!scriptToExec || typeof scriptToExec !== 'function') {
          throw new Error(`File doesn't default export a function to execute.`)
        }

        const scriptParams: ExecArgs = {
          container,
          args: payload.replace(/\s+/g, '').split(','),
        }

        await scriptToExec(scriptParams)

        logger.info(`Finished executing script.`)

        process.exit()
      }
      catch (err) {
        logger.error('Error running script', err)
        process.exit(1)
      }
    },
  })
}

export default defineCommand({
  meta: {
    name: 'task',
    description: 'Run a task',
  },
  args: {
    file: {
      type: 'string',
      description: 'The file to run',
    },
    payload: {
      type: 'string',
      description: 'The arguments to pass to the task',
    },
  },
  subCommands: async () => {
    process.env.MEDUSA_WORKER_MODE = 'worker'
    const { container } = await loaders({
      directory: process.cwd(),
      expressApp: undefined,
      skipLoadingEntryPoints: true,
    })
    const tasks: Tasks = container.resolve(TASKS)

    return {
      ...Object.fromEntries(Object.values(tasks).map(task => ([
        task.name,
        {
          ...task.config,
          run: async (context) => {
            await task.handler(context, container)
            process.exit(0)
          },
        },
      ]))),
      file: fileCommand(container),
    }
  },
})
