export {}
declare global {
  const registeredResolvers: typeof import('@czo/kit/graphql').registeredResolvers
  const registeredTypeDefs: typeof import('@czo/kit/graphql').registeredTypeDefs
  const useContainer: typeof import('@czo/kit').useContainer
  const useDatabase: typeof import('@czo/kit/db').useDatabase
  const useLogger: typeof import('@czo/kit').useLogger
}