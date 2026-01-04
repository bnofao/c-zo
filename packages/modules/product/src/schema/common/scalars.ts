/**
 * Custom GraphQL Scalar Resolvers
 * Implements DateTime and JSON scalar types
 */

import { GraphQLScalarType, Kind } from 'graphql'

/**
 * DateTime scalar type
 * Serializes Date objects to ISO 8601 strings
 * Parses ISO 8601 strings to Date objects
 */
export const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  description: 'Date and time in ISO 8601 format',
  
  // Serialize Date to ISO string for output
  serialize(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString()
    }
    if (typeof value === 'string') {
      return new Date(value).toISOString()
    }
    if (typeof value === 'number') {
      return new Date(value).toISOString()
    }
    throw new Error('DateTime must be a Date object, ISO string, or timestamp')
  },
  
  // Parse ISO string to Date for input
  parseValue(value: unknown): Date {
    if (value instanceof Date) {
      return value
    }
    if (typeof value === 'string') {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid DateTime format. Expected ISO 8601 string')
      }
      return date
    }
    if (typeof value === 'number') {
      return new Date(value)
    }
    throw new Error('DateTime must be a Date object, ISO string, or timestamp')
  },
  
  // Parse AST literal to Date
  parseLiteral(ast): Date {
    if (ast.kind === Kind.STRING) {
      const date = new Date(ast.value)
      if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid DateTime format. Expected ISO 8601 string')
      }
      return date
    }
    if (ast.kind === Kind.INT) {
      return new Date(Number.parseInt(ast.value, 10))
    }
    throw new Error('DateTime must be a string or integer')
  },
})

/**
 * JSON scalar type
 * Handles arbitrary JSON data
 */
export const JSON = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON data',
  
  // Serialize object to JSON
  serialize(value: unknown): any {
    return value
  },
  
  // Parse JSON value
  parseValue(value: unknown): any {
    return value
  },
  
  // Parse AST literal to JSON
  parseLiteral(ast): any {
    switch (ast.kind) {
      case Kind.STRING:
        return ast.value
      case Kind.INT:
        return Number.parseInt(ast.value, 10)
      case Kind.FLOAT:
        return Number.parseFloat(ast.value)
      case Kind.BOOLEAN:
        return ast.value
      case Kind.NULL:
        return null
      case Kind.OBJECT:
        return ast.fields.reduce((acc, field) => {
          acc[field.name.value] = JSON.parseLiteral(field.value)
          return acc
        }, {} as Record<string, any>)
      case Kind.LIST:
        return ast.values.map((value) => JSON.parseLiteral(value))
      default:
        throw new Error(`Unexpected kind in JSON literal: ${ast.kind}`)
    }
  },
})

/**
 * Scalar resolvers map for GraphQL Code Generator
 */
export const scalars = {
  DateTime,
  JSON,
}
