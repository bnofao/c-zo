import type { AppInstallResultResolvers } from './../../../__generated__/types.generated'

export const AppInstallResult: AppInstallResultResolvers = {
  app: parent => parent.app,
  apiKeyId: parent => parent.apiKeyId,
}
