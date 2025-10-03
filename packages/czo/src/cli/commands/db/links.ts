import type { MedusaAppLoader } from '@medusajs/framework'
import type {
  LinkMigrationsPlannerAction,
  Logger,
} from '@medusajs/framework/types'
import process from 'node:process'
import { coreLoader } from '@czo/loaders'
// import checkbox from '@inquirer/checkbox'
// import boxen from 'boxen'
// import chalk from 'chalk'
import { defineCommand } from 'citty'
import { consola } from 'consola'
import { colors } from 'consola/utils'
import { ensureDbExists } from '../utils'

/**
 * Groups action tables by their "action" property
 * @param actionPlan LinkMigrationsPlannerAction
 */
function groupByActionPlan(actionPlan: LinkMigrationsPlannerAction[]) {
  return actionPlan.reduce((acc, action) => {
    acc[action.action] ??= []
    acc[action.action].push(action)
    return acc
  }, {} as Record<'noop' | 'notify' | 'create' | 'update' | 'delete', LinkMigrationsPlannerAction[]>)
}

/**
 * Creates the link description for printing it to the
 * console
 *
 * @param action LinkMigrationsPlannerAction
 */
function buildLinkDescription(action: LinkMigrationsPlannerAction) {
  const { linkDescriptor } = action
  const from = colors.yellow(
    `${linkDescriptor.fromModule}.${linkDescriptor.fromModel}`,
  )
  const to = colors.yellow(
    `${linkDescriptor.toModule}.${linkDescriptor.toModel}`,
  )
  const table = colors.dim(`(${action.tableName})`)

  return `${from} <> ${to} ${table}`
}

/**
 * Creates the link description for printing it to the
 * console
 *
 * @param action LinkMigrationsPlannerAction
 */
function buildLinkDescriptionAsKey(action: LinkMigrationsPlannerAction) {
  const { linkDescriptor } = action
  const from = `${linkDescriptor.fromModule}.${linkDescriptor.fromModel}`
  const to = `${linkDescriptor.toModule}.${linkDescriptor.toModel}`
  const table = `(${action.tableName})`

  return `${from}-${to}-${table}`
}

/**
 * Logs the actions of a given action type with a nice border and
 * a title
 */
function logActions(
  title: string,
  actionsOrContext: LinkMigrationsPlannerAction[],
) {
  const actionsList = actionsOrContext
    .map(action => `  - ${buildLinkDescription(action)}`)
    .join('\n')

  consola.box({ styles: { padding: 1 }, message: `${title}\n${actionsList}` })
}

/**
 * Displays a prompt to select tables that must be impacted with
 * action
 */
async function askForLinkActionsToPerform(
  message: string,
  actions: LinkMigrationsPlannerAction[],
) {
  const actionsMap = Object.fromEntries(actions.map(action => [buildLinkDescriptionAsKey(action), action]))
  consola.box({ styles: { padding: 1, borderColor: 'red' }, message })

  const answers = await consola.prompt('Select tables to act upon', {
    type: 'multiselect',
    options: actions.map((action) => {
      return {
        label: buildLinkDescription(action),
        value: buildLinkDescriptionAsKey(action),
      }
    }),
  })
  return answers.map(answer => actionsMap[answer.value]) as LinkMigrationsPlannerAction[]
}

/**
 * Low-level utility to sync links. This utility is used
 * by the migrate command as-well.
 */
export async function syncLinks(
  medusaAppLoader: MedusaAppLoader,
  {
    executeAll,
    executeSafe,
    logger,
  }: {
    executeSafe: boolean
    executeAll: boolean
    logger: Logger
  },
) {
  const planner = await medusaAppLoader.getLinksExecutionPlanner()

  logger.info('Syncing links...')

  const actionPlan = await planner.createPlan()
  const groupActionPlan = groupByActionPlan(actionPlan)

  if (groupActionPlan.delete?.length) {
    /**
     * Do not delete anything when "--execute-safe" flag
     * is used. And only prompt when "--execute-all"
     * flag isn't used either
     */
    if (executeSafe) {
      groupActionPlan.delete = []
    }
    else if (!executeAll) {
      groupActionPlan.delete = await askForLinkActionsToPerform(
        `Select the tables to ${colors.red(
          'DELETE',
        )}. The following links have been removed`,
        groupActionPlan.delete,
      )
    }
  }

  if (groupActionPlan.notify?.length) {
    let answer = groupActionPlan.notify

    /**
     * Do not update anything when "--execute-safe" flag
     * is used. And only prompt when "--execute-all"
     * flag isn't used either.
     */
    if (executeSafe) {
      answer = []
    }
    else if (!executeAll) {
      answer = await askForLinkActionsToPerform(
        `Select the tables to ${colors.red(
          'UPDATE',
        )}. The following links have been updated`,
        groupActionPlan.notify,
      )
    }

    groupActionPlan.update ??= []
    groupActionPlan.update.push(
      ...answer.map((action) => {
        return {
          ...action,
          action: 'update',
        } as LinkMigrationsPlannerAction
      }),
    )
  }

  const toCreate = groupActionPlan.create ?? []
  const toUpdate = groupActionPlan.update ?? []
  const toDelete = groupActionPlan.delete ?? []
  const actionsToExecute = [...toCreate, ...toUpdate, ...toDelete]

  await planner.executePlan(actionsToExecute)

  if (toCreate.length) {
    logActions('Created following links tables', toCreate)
  }
  if (toUpdate.length) {
    logActions('Updated following links tables', toUpdate)
  }
  if (toDelete.length) {
    logActions('Deleted following links tables', toDelete)
  }

  if (actionsToExecute.length) {
    logger.info('Links sync completed')
  }
  else {
    logger.info('Database already up-to-date')
  }
}

// export default main

export default (directory: string) => defineCommand({
  meta: {
    name: 'db:links',
    description: 'Sync modules links',
  },
  args: {
    directory: {
      type: 'string',
      description: 'The directory to sync the links',
      default: directory,
    },
    safe: {
      type: 'boolean',
      description: 'Execute safe links only',
      default: false,
    },
    all: {
      type: 'boolean',
      description: 'Execute all links including unsafe ones',
      default: false,
    },
  },
  async run({ args }) {
    const { directory, safe, all } = args
    const { logger, container, appLoader } = await coreLoader(directory)

    try {
      await ensureDbExists(container)

      await syncLinks(appLoader, {
        executeAll: all,
        executeSafe: safe,
        logger,
      })

      process.exit()
    }
    catch (error) {
      logger.error(error)
      process.exit(1)
    }
  },
})
