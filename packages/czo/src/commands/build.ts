import { Compiler } from "@medusajs/framework/build-tools"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { initializeContainer } from "../loader"

export default async function build({
  directory,
}: {
  directory: string
}) {
  const container = await initializeContainer(directory, {
    skipDbConnection: true,
  })
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  logger.info("Starting build...")
  const compiler = new Compiler(directory, logger)

  const tsConfig = await compiler.loadTSConfigFile()
  if (!tsConfig) {
    logger.error("Unable to compile application")
    process.exit(1)
  }

  const promises: Promise<boolean>[] = []
  promises.push(compiler.buildAppBackend(tsConfig))

  const responses = await Promise.all(promises)

  if (responses.every((response) => response === true)) {
    process.exit(0)
  } else {
    process.exit(1)
  }
}