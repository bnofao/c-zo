import type { IMiddleware } from 'graphql-middleware'
import { drizzleTransformationMiddleware } from './drizzle'

const middlewares: IMiddleware[] = [
  drizzleTransformationMiddleware,
]

export function registerMiddleware(middleware: IMiddleware) {
  middlewares.push(middleware)
}

export function registeredMiddlewares(): IMiddleware[] {
  return [...middlewares]
}
