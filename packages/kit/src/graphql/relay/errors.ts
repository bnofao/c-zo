import { z } from 'zod'
import { DatabaseError } from '../../db/repository'

export enum ErrorCode {
  UNIQUE_CONSTRAINT = 'UNIQUE_CONSTRAINT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  FORBIDDEN = 'FORBIDDEN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface UserError {
  field: string[] | null
  message: string
  code: string
}

export function toUserErrors(error: unknown): UserError[] {
  if (error instanceof DatabaseError && error.fieldErrors) {
    return Object.entries(error.fieldErrors)
      .filter(([, messages]) => messages && messages.length > 0)
      .map(([field, messages]) => ({
        field: [field],
        message: messages![0]!,
        code: ErrorCode.UNIQUE_CONSTRAINT,
      }))
  }

  if (error instanceof z.ZodError) {
    return error.issues.map(issue => ({
      field: issue.path.map(String),
      message: issue.message,
      code: ErrorCode.VALIDATION_ERROR,
    }))
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase()

    if (msg.includes('not found')) {
      return [{ field: null, message: error.message, code: ErrorCode.NOT_FOUND }]
    }

    if (msg.includes('forbidden') || msg.includes('permission')) {
      return [{ field: null, message: error.message, code: ErrorCode.FORBIDDEN }]
    }
  }

  const message = error instanceof Error ? error.message : 'An unexpected error occurred'
  return [{ field: null, message, code: ErrorCode.INTERNAL_ERROR }]
}
