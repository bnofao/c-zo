import { printSchema, lexicographicSortSchema, type GraphQLSchema } from 'graphql'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'

export interface EmitSDLOptions {
  schema: GraphQLSchema
  outputPath: string
  /** Alphabetical sort of types/fields for stable diffs. Default: true */
  sort?: boolean
  /** Custom header string prepended. Default: auto-generated warning */
  header?: string
}

const DEFAULT_HEADER = '# AUTO-GENERATED — do not edit. Run `pnpm generate-sdl` to regenerate.\n\n'

export function emitSDL({ schema, outputPath, sort = true, header }: EmitSDLOptions): void {
  const finalSchema = sort ? lexicographicSortSchema(schema) : schema
  writeFileSync(outputPath, (header ?? DEFAULT_HEADER) + printSchema(finalSchema) + '\n')
}

export function verifySDL({ schema, outputPath, sort = true, header }: EmitSDLOptions): boolean {
  if (!existsSync(outputPath)) return false
  const finalSchema = sort ? lexicographicSortSchema(schema) : schema
  const expected = (header ?? DEFAULT_HEADER) + printSchema(finalSchema) + '\n'
  return readFileSync(outputPath, 'utf-8') === expected
}
