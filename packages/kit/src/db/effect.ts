import type { Database } from './manager'
import { Context, Effect, Layer } from 'effect'
import { useDatabase } from './manager'

export const DrizzleDb = Context.GenericTag<'@czo/kit/DrizzleDb', Database>('@czo/kit/DrizzleDb')

export const DrizzleDbLive = Layer.effect(
  DrizzleDb,
  Effect.promise(() => useDatabase()),
)
 