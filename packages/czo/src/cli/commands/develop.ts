import type { FSWatcher } from 'chokidar'
import type { ChildProcess } from 'node:child_process'
import { execSync, fork } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { initializeContainer } from '@czo/loaders'
import { logger as defaultLogger } from '@medusajs/framework/logger'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import * as swcCore from '@swc/core'
import chokidar from 'chokidar'
import { defineCommand } from 'citty'
import { Compiler } from 'node_modules/@medusajs/framework/dist/build-tools/compiler'

const CZO_CLI_PATH = require.resolve('@czo/czo')

async function devApp(dir: string, types: boolean, ignore: string) {
  process.env.NODE_ENV = process.env.NODE_ENV || `development`
  const container = await initializeContainer(dir)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const _args = process.argv

  const argv
    = process.argv.includes('--')
      ? process.argv.slice(process.argv.indexOf('--') + 1)
      : []

  _args.shift()
  _args.shift()
  _args.shift()

  if (types) {
    _args.push('--types')
  }

  /**
   * Re-constructing the path to Medusa CLI to execute the
   * start command.
   */

  const cliPath = path.resolve(CZO_CLI_PATH, '..', '..', 'dist', 'cli', 'index.cjs')

  const devServer = {
    childProcess: null as ChildProcess | null,
    watcher: null as FSWatcher | null,

    /**
     * Start the development server by forking a new process.
     *
     * We do not kill the parent process when child process dies. This is
     * because sometimes the dev server can die because of programming
     * or logical errors and we can still watch the file system and
     * restart the dev server instead of asking the user to re-run
     * the command.
     */
    start() {
      this.childProcess = fork(cliPath, ['start', ..._args], {
        cwd: dir,
        env: {
          ...process.env,
          NODE_ENV: 'development',
        },
        execArgv: argv,
      })
      this.childProcess.on('error', (error) => {
        logger.error('Dev server failed to start', error)
        logger.info('The server will restart automatically after your changes')
      })
    },

    /**
     * Restarts the development server by cleaning up the existing
     * child process and forking a new one
     */
    restart() {
      if (this.childProcess) {
        this.childProcess.removeAllListeners()
        if (process.platform === 'win32') {
          execSync(`taskkill /PID ${this.childProcess.pid} /F /T`)
        }
        else {
          this.childProcess.kill('SIGINT')
        }
      }
      this.start()
    },

    /**
     * Watches the entire file system and ignores the following files
     *
     * - Dot files
     * - node_modules
     * - dist
     * - src/admin/**
     */
    watch() {
      this.watcher = chokidar.watch(['.'], {
        ignoreInitial: true,
        cwd: process.cwd(),
        ignored: [
          /(^|[\\/])\../,
          'node_modules',
          'dist',
          'static',
          'private',
          '.medusa/**/*',
          ...ignore.trim().replace(/\s+/g, '').split(','),
        ],
      })

      this.watcher.on('add', (file) => {
        logger.info(
          `${path.relative(dir, file)} created: Restarting dev server`,
        )
        this.restart()
      })
      this.watcher.on('change', (file) => {
        logger.info(
          `${path.relative(dir, file)} modified: Restarting dev server`,
        )
        this.restart()
      })
      this.watcher.on('unlink', (file) => {
        logger.info(
          `${path.relative(dir, file)} removed: Restarting dev server`,
        )
        this.restart()
      })

      this.watcher.on('ready', () => {
        logger.info(`Watching filesystem to reload dev server on file change`)
      })
    },
  }

  process.on('SIGINT', () => {
    process.exit(0)
  })

  devServer.start()
  devServer.watch()
}

async function devPlugin(dir: string) {
  const compiler = new Compiler(dir, defaultLogger)
  const parsedConfig = await compiler.loadTSConfigFile()
  if (!parsedConfig) {
    return
  }

  /**
   * Transforms a given file using @swc/core
   */
  async function transformFile(filePath: string) {
    const output = await swcCore.transformFile(filePath, {
      sourceMaps: 'inline',
      module: {
        type: 'commonjs',
        strictMode: true,
        noInterop: false,
      },
      jsc: {
        externalHelpers: false,
        target: 'es2021',
        parser: {
          syntax: 'typescript',
          tsx: true,
          decorators: true,
          dynamicImport: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
          react: {
            throwIfNamespace: false,
            useBuiltins: false,
            pragma: 'React.createElement',
            pragmaFrag: 'React.Fragment',
            importSource: 'react',
            runtime: 'automatic',
          },
        },
        keepClassNames: true,
        baseUrl: dir,
      },
    })
    return output.code
  }

  await compiler.buildPluginBackend(parsedConfig)
  await compiler.developPluginBackend(transformFile)
}

export default (dir: string, port: string) => defineCommand({
  meta: {
    name: 'develop',
    description: 'Start development server',
  },
  args: {
    dir: {
      type: 'string',
      description: 'The server directory to start',
      default: dir,
    },
    types: {
      type: 'boolean',
      description: 'Generate automated types for modules inside the .medusa directory',
      default: false,
    },
    host: {
      type: 'string',
      alias: 'H',
      description: process.env.HOST
        ? `Set host. Defaults to ${process.env.HOST} (set by env.HOST)`
        : ``,
      default: process.env.HOST,
    },
    port: {
      type: 'string',
      alias: 'p',
      description: process.env.PORT
        ? `Set port. Defaults to ${process.env.PORT} (set by env.PORT) (otherwise defaults ${port})`
        : `Set port. Defaults to ${port}`,
      default: process.env.PORT || port,
    },
    ignore: {
      type: 'string',
      description: 'Watch ignore files and directories',
      default: '',
    },
    plugin: {
      type: 'boolean',
      description: 'Develop the plugin.',
      default: false,
    },
  },
  async run({ args }) {
    const { dir, types, ignore, plugin } = args

    if (plugin) {
      await devPlugin(dir)
    }
    else {
      await devApp(dir, types, ignore)
    }
  },
})
