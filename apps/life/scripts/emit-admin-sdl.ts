/**
 * Emit the `admin` sub-graph SDL to `apps/tour/src/graphql/admin.graphql`.
 *
 * `buildSchema` issues no queries, so the pg pool is never actually used — any
 * well-formed DATABASE_URL works and no database needs to be running.
 */
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { emitSDL, GraphQLBuilder } from '@czo/kit/graphql'
import { buildApp } from '@czo/kit/module'
import { Effect } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import { modules } from '../src/modules'

process.env.AUTH_SECRET ??= 'x'.repeat(40)
process.env.AUTH_APP ??= 'life'
process.env.DATABASE_URL ??= 'postgresql://sdl:sdl@127.0.0.1:5432/sdl'

const here = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(here, '../../tour/src/graphql/admin.graphql')

const built = buildApp({ modules, subGraphs: ['public', 'account', 'org', 'admin'] })

const program = Effect.gen(function* () {
  const builder = yield* GraphQLBuilder
  const schema = yield* builder.buildSchema('admin')
  emitSDL({ schema, outputPath, header: '# GENERATED — admin sub-graph SDL. Run `pnpm --filter @czo/life emit:sdl`.\n\n' })
}).pipe(Effect.provide(built.appLayer), Effect.provide(Persistence.layerMemory))

Effect.runPromise(program as Effect.Effect<void, unknown, never>)
  .then(() => process.stdout.write(`admin SDL → ${outputPath}\n`))
  .catch((err) => { process.stderr.write(`emit-admin-sdl failed: ${String(err)}\n`); process.exit(1) })
