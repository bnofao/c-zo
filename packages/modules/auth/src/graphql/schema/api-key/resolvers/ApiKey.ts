import type { ApiKeyResolvers } from './../../../__generated__/types.generated'

export const ApiKey: ApiKeyResolvers = {
  id: parent => parent.id,
  name: parent => parent.name,
  prefix: parent => parent.prefix,
  start: parent => parent.start,
  enabled: parent => parent.enabled,
  expiresAt: parent => parent.expiresAt,
  lastRequest: parent => parent.lastRequest,
  createdAt: parent => parent.createdAt,
}
