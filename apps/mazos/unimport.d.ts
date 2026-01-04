export {}
declare global {
  const closeDatabase: typeof import('@czo/kit').closeDatabase
  const registeredResolvers: typeof import('@czo/kit/graphql').registeredResolvers
  const registeredTypeDefs: typeof import('@czo/kit/graphql').registeredTypeDefs
  const useContainer: typeof import('@czo/kit').useContainer
  const useDatabase: typeof import('@czo/kit').useDatabase
  const useLogger: typeof import('@czo/kit').useLogger
}