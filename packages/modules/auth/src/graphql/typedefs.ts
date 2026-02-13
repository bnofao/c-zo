import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { registerTypeDefs } from '@czo/kit/graphql'

const schemaDir = resolve(import.meta.dirname, 'schema')
const orgSchema = readFileSync(resolve(schemaDir, 'organization.graphql'), 'utf-8')

registerTypeDefs(orgSchema)
