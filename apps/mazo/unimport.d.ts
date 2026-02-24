export {}
declare global {
  const applyDirectives: typeof import('@czo/kit/graphql').applyDirectives
  const buildGraphQLContext: typeof import('@czo/kit/graphql').buildGraphQLContext
  const registerContextFactory: typeof import('@czo/kit/graphql').registerContextFactory
  const registerDirective: typeof import('@czo/kit/graphql').registerDirective
  const registeredDirectiveTypeDefs: typeof import('@czo/kit/graphql').registeredDirectiveTypeDefs
  const registeredResolvers: typeof import('@czo/kit/graphql').registeredResolvers
  const registeredTypeDefs: typeof import('@czo/kit/graphql').registeredTypeDefs
  const useContainer: typeof import('@czo/kit/ioc').useContainer
  const useDatabase: typeof import('@czo/kit/db').useDatabase
  const useLogger: typeof import('@czo/kit').useLogger
}