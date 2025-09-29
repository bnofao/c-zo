// import { sync as existsSync } from "fs-exists-cached"
import { setTelemetryEnabled } from "@medusajs/telemetry"
import path from "path"
// import resolveCwd from "resolve-cwd"
// import { newStarter } from "./commands/new"
import startCommand from "./start"
import developCommand from "./develop"
import buildCommand from "./build"
import execCommand from "./exec"
// import { didYouMean } from "./did-you-mean"
// import reporter from "./reporter"
import consola from "consola"

const yargs = require(`yargs`)

const handlerP =
  (fn) =>
  (...args) => {
    Promise.resolve(fn(...args)).then(
      () => process.exit(0),
      (err) => console.log(err)
    )
  }

function buildLocalCommands(cli) {
  const defaultPort = "9000"
  const directory = path.resolve(`.`)

  const projectInfo = { directory }

  cli
    // .command({
    //   command: "db:migrate",
    //   desc: "Migrate the database by executing pending migrations",
    //   builder: (builder) => {
    //     builder.option("skip-scripts", {
    //       type: "boolean",
    //       describe: "Do not run migration scripts",
    //     })
    //     builder.option("skip-links", {
    //       type: "boolean",
    //       describe: "Do not sync links",
    //     })
    //     builder.option("execute-all-links", {
    //       type: "boolean",
    //       describe:
    //         "Skip prompts and execute all (including unsafe) actions from sync links",
    //     })
    //     builder.option("execute-safe-links", {
    //       type: "boolean",
    //       describe:
    //         "Skip prompts and execute only safe actions from sync links",
    //     })
    //   },
    //   handler: handlerP(
    //     getCommandHandler("db/migrate", (args, cmd) => {
    //       process.env.NODE_ENV = process.env.NODE_ENV || `development`
    //       return cmd(args)
    //     })
    //   ),
    // })
    // .command({
    //   command: "db:migrate:scripts",
    //   desc: "Run all migration scripts",
    //   handler: handlerP(
    //     getCommandHandler("db/run-scripts", (args, cmd) => {
    //       process.env.NODE_ENV = process.env.NODE_ENV || `development`
    //       return cmd(args)
    //     })
    //   ),
    // })
    // .command({
    //   command: "db:rollback [modules...]",
    //   desc: "Rollback last batch of executed migrations for a given module",
    //   builder: {
    //     modules: {
    //       type: "array",
    //       description: "Modules for which to rollback migrations",
    //       demand: true,
    //     },
    //   },
    //   handler: handlerP(
    //     getCommandHandler("db/rollback", (args, cmd) => {
    //       process.env.NODE_ENV = process.env.NODE_ENV || `development`
    //       return cmd(args)
    //     })
    //   ),
    // })
    // .command({
    //   command: "db:generate [modules...]",
    //   desc: "Generate migrations for a given module",
    //   builder: {
    //     modules: {
    //       type: "array",
    //       description: "Modules for which to generate migration files",
    //       demand: true,
    //     },
    //   },
    //   handler: handlerP(
    //     getCommandHandler("db/generate", (args, cmd) => {
    //       process.env.NODE_ENV = process.env.NODE_ENV || `development`
    //       return cmd(args)
    //     })
    //   ),
    // })
    // .command({
    //   command: "plugin:db:generate",
    //   desc: "Generate migrations for modules in a plugin",
    //   handler: handlerP(
    //     getCommandHandler("plugin/db/generate", (args, cmd) => {
    //       process.env.NODE_ENV = process.env.NODE_ENV || `development`
    //       return cmd(args)
    //     })
    //   ),
    // })
    // .command({
    //   command: "db:sync-links",
    //   desc: "Sync database schema with the links defined by your application and Medusa core",
    //   builder: (builder) => {
    //     builder.option("execute-all", {
    //       type: "boolean",
    //       describe: "Skip prompts and execute all (including unsafe) actions",
    //     })
    //     builder.option("execute-safe", {
    //       type: "boolean",
    //       describe: "Skip prompts and execute only safe actions",
    //     })
    //   },
    //   handler: handlerP(
    //     getCommandHandler("db/sync-links", (args, cmd) => {
    //       process.env.NODE_ENV = process.env.NODE_ENV || `development`
    //       return cmd(args)
    //     })
    //   ),
    // })
    // .command({
    //   command: "plugin:build",
    //   desc: "Build plugin source for publishing to a package registry",
    //   handler: handlerP(
    //     getCommandHandler("plugin/build", (args, cmd) => {
    //       process.env.NODE_ENV = process.env.NODE_ENV || `development`
    //       cmd(args)
    //       return new Promise((resolve) => {})
    //     })
    //   ),
    // })
    // .command({
    //   command: "plugin:develop",
    //   desc: "Start plugin development process in watch mode. Changes will be re-published to the local packages registry",
    //   handler: handlerP(
    //     getCommandHandler("plugin/develop", (args, cmd) => {
    //       process.env.NODE_ENV = process.env.NODE_ENV || `development`
    //       cmd(args)
    //       return new Promise(() => {})
    //     })
    //   ),
    // })
    // .command({
    //   command: "plugin:publish",
    //   desc: "Publish the plugin to the local packages registry",
    //   handler: handlerP(
    //     getCommandHandler("plugin/publish", (args, cmd) => {
    //       process.env.NODE_ENV = process.env.NODE_ENV || `development`
    //       cmd(args)
    //       return new Promise(() => {})
    //     })
    //   ),
    // })
    // .command({
    //   command: "plugin:add [plugin_names...]",
    //   desc: "Add the specified plugin to the project from the local packages registry",
    //   builder: {
    //     plugin_names: {
    //       type: "array",
    //       description: "The name of the plugins to add",
    //       demand: true,
    //     },
    //   },
    //   handler: handlerP(
    //     getCommandHandler("plugin/add", (args, cmd) => {
    //       process.env.NODE_ENV = process.env.NODE_ENV || `development`
    //       cmd(args)
    //       return new Promise(() => {})
    //     })
    //   ),
    // })
    .command({
      command: `telemetry`,
      describe: `Enable or disable collection of anonymous usage data.`,
      builder: (yargs) =>
        yargs
          .option(`enable`, {
            type: `boolean`,
            description: `Enable telemetry (default)`,
          })
          .option(`disable`, {
            type: `boolean`,
            description: `Disable telemetry`,
          }),

      handler: handlerP(({ enable, disable }) => {
        const enabled = Boolean(enable) || !disable
        setTelemetryEnabled(enabled)
        consola.info(`Telemetry collection ${enabled ? `enabled` : `disabled`}`)
      }),
    })
    .command({
      command: `develop`,
      desc: `Start development server. Watches file and rebuilds when something changes`,
      builder: (_) =>
        _.option("types", {
          type: "boolean",
          default: true,
          describe:
            "Generate automated types for modules inside the .medusa directory",
        })
          .option(`H`, {
            alias: `host`,
            type: `string`,
            default: process.env.HOST,
            describe: process.env.HOST
              ? `Set host. Defaults to ${process.env.HOST} (set by env.HOST)`
              : "",
          })
          .option(`p`, {
            alias: `port`,
            type: `string`,
            default: process.env.PORT || defaultPort,
            describe: process.env.PORT
              ? `Set port. Defaults to ${process.env.PORT} (set by env.PORT) (otherwise defaults ${defaultPort})`
              : `Set port. Defaults to ${defaultPort}`,
          }),
      handler: handlerP((args) => {
          process.env.NODE_ENV = process.env.NODE_ENV || `development`
        developCommand({...args, ...projectInfo})
        return new Promise(() => {})
      }),
      
    })
    .command({
      command: `start`,
      desc: `Start production server.`,
      builder: (_) =>
        _.option("types", {
          type: "boolean",
          default: false,
          describe:
            "Generate automated types for modules inside the .medusa directory",
        })
          .option(`H`, {
            alias: `host`,
            type: `string`,
            default: process.env.HOST,
            describe: process.env.HOST
              ? `Set host. Defaults to ${process.env.HOST} (set by env.HOST)`
              : ``,
          })
          .option(`p`, {
            alias: `port`,
            type: `string`,
            default: process.env.PORT || defaultPort,
            describe: process.env.PORT
              ? `Set port. Defaults to ${process.env.PORT} (set by env.PORT) (otherwise defaults ${defaultPort})`
              : `Set port. Defaults to ${defaultPort}`,
          })
          .option(`cluster`, {
            type: `string`,
            describe:
              "Start the Node.js server in cluster mode. Specify the number of CPUs to use or a percentage (e.g., 50%). Defaults to the number of available CPUs.",
          })
          .option("workers", {
            type: "string",
            default: "0",
            describe: "Number of worker processes in cluster mode or a percentage of cluster size (e.g., 25%).",
          })
          .option("servers", {
            type: "string",
            default: "0",
            describe: "Number of server processes in cluster mode or a percentage of cluster size (e.g., 25%).",
          }),
      handler: handlerP(
        (args) => {
          process.env.NODE_ENV = process.env.NODE_ENV || `production`
          startCommand({...args, ...projectInfo})
          // Return an empty promise to prevent handlerP from exiting early.
          // The development server shouldn't ever exit until the user directly
          // kills it so this is fine.
          return new Promise((resolve) => {})
        }),
    })
    .command({
      command: "build",
      desc: "Build your project.",
      builder: (_) =>
        _.option("admin-only", {
          default: false,
          type: "boolean",
          describe:
            "Only build the admin to serve it separately (outDir .medusa/admin)",
        }),
      handler: handlerP(
        (args) => {
          process.env.NODE_ENV = process.env.NODE_ENV || `development`
          buildCommand({...args, ...projectInfo})

          return new Promise((resolve) => {})
        }),
    })
    .command({
      command: `exec [file] [args..]`,
      desc: `Run a function defined in a file.`,
      handler: handlerP(
        (args) => {
          execCommand({...args, ...projectInfo})
          // Return an empty promise to prevent handlerP from exiting early.
          // The development server shouldn't ever exit until the user directly
          // kills it so this is fine.
          return new Promise((resolve) => {})
        }),
    })
}

function isLocalMedusaProject() {
  let inMedusaProject = false

  try {
    const { dependencies, devDependencies } = require(path.resolve(
      `./package.json`
    ))
    inMedusaProject = !!(
      (dependencies && dependencies["@medusajs/medusa"]) ||
      (devDependencies && devDependencies["@medusajs/medusa"])
    )
  } catch (err) {
    // ignore
  }

  return inMedusaProject
}

function getVersionInfo() {
  const { version } = require(`../../package.json`)
  const isMedusaProject = isLocalMedusaProject()
  if (isMedusaProject) {
    let medusaVersion = ""
    try {
      medusaVersion = require(path.join(
        process.cwd(),
        `node_modules`,
        `@medusajs/medusa`,
        `package.json`
      )).version
    } catch (e) {
      /* noop */
    }

    if (!medusaVersion) {
      medusaVersion = `unknown`
    }

    return `Medusa CLI version: ${version}
Medusa version: ${medusaVersion}
  Note: this is the Medusa version for the site at: ${process.cwd()}`
  } else {
    return `Medusa CLI version: ${version}`
  }
}

export default (argv) => {
  const cli = yargs()

  cli
    .scriptName(`czo`)
    .usage(`Usage: $0 <command> [options]`)
    .alias(`h`, `help`)
    .alias(`v`, `version`)
    .option(`verbose`, {
      default: false,
      type: `boolean`,
      describe: `Turn on verbose output`,
      global: true,
    })
    .option(`no-color`, {
      alias: `no-colors`,
      default: false,
      type: `boolean`,
      describe: `Turn off the color in output`,
      global: true,
    })
    .option(`json`, {
      describe: `Turn on the JSON logger`,
      default: false,
      type: `boolean`,
      global: true,
    })

  buildLocalCommands(cli)

  try {
    cli.version(
      `version`,
      `Show the version of the Medusa CLI and the Medusa package in the current project`,
      getVersionInfo()
    )
  } catch (e) {
    // ignore
  }

  return cli
    .wrap(cli.terminalWidth())
    .demandCommand(1, `Pass --help to see all available commands and options.`)
    .strict()
    .fail((msg, err, yargs) => {
      const availableCommands = yargs
        .getCommands()
        .map((commandDescription) => {
          const [command] = commandDescription
          return command.split(` `)[0]
        })
      const arg = argv.slice(2)[0]
      // const suggestion = arg ? didYouMean(arg, availableCommands) : ``

      if (msg) {
        consola.error(msg)
        console.log()
      }
      // if (suggestion) {
      //   consola.info(suggestion)
      //   console.log()
      // }

      if (err) {
        console.error("--------------- ERROR ---------------------")
        console.error(err)
        console.error("-------------------------------------------")
      }

      cli.showHelp((s: string) => console.error(s))
      process.exit(1)
    })
    .parse(argv.slice(2))
}