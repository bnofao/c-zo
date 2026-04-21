import type { GraphQLResolveInfo } from 'graphql'
import type { IMiddlewareFunction } from 'graphql-middleware'
import { isInputObjectType } from 'graphql'
import { applyDrizzleDirectives } from '../directive'

/**
 * GraphQL creates args with Object.create(null) (no prototype).
 * Drizzle's `is()` function accesses `.constructor` which crashes on null-prototype objects.
 * This recursively converts them to normal objects with Object.prototype.
 */
function normalizeNullPrototype(value: unknown): unknown {
  if (value == null || typeof value !== 'object')
    return value
  if (Array.isArray(value))
    return value.map(normalizeNullPrototype)

  const normalized: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    normalized[k] = normalizeNullPrototype(v)
  }
  return normalized
}

/**
 * Middleware that auto-applies @drizzle transformations on all input object arguments.
 * Scans each arg for an input type with @drizzle-annotated fields and transforms values.
 * Also normalizes null-prototype objects from GraphQL to prevent Drizzle crashes.
 */
export const drizzleTransformationMiddleware: IMiddlewareFunction = async (
  resolve,
  root,
  args,
  ctx,
  info: GraphQLResolveInfo,
) => {
  const fieldDef = info.parentType.getFields()[info.fieldName]
  if (!fieldDef)
    return resolve(root, args, ctx, info)

  const transformedArgs = { ...args as Record<string, unknown> }
  let changed = false

  for (const argDef of fieldDef.args) {
    const argValue = transformedArgs[argDef.name]
    if (!argValue || typeof argValue !== 'object')
      continue

    let argType = argDef.type
    while ('ofType' in argType)
      argType = argType.ofType
    if (!isInputObjectType(argType))
      continue

    // Normalize null-prototype objects before passing to Drizzle
    const normalized = normalizeNullPrototype(argValue) as Record<string, unknown>

    const transformed = applyDrizzleDirectives(normalized, argType)

    transformedArgs[argDef.name] = transformed ?? normalized
    changed = true
  }

  return resolve(root, changed ? transformedArgs : args, ctx, info)
}
