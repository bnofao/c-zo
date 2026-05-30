/**
 * Declarative REST routes for the auth module, with OpenAPI metadata.
 *
 * These are the credential endpoints that have a fixed method + path and a
 * documentable request/response shape. The `/api/auth/**` better-auth
 * catch-all stays in the module's imperative `http` hook — a wildcard with
 * `all` methods isn't a single OpenAPI operation.
 *
 * h3's router (rou3) matches these specific paths over the catch-all
 * regardless of registration order, so the catch-all (registered in the
 * `http` hook) does not shadow them.
 */
import type { ApiRoute } from '@czo/kit/openapi'
import type { OpenAPIV3_1 } from 'openapi-types'
import { defineApiRoute } from '@czo/kit/openapi'
import { signInHandler } from './sign-in'
import { signOutHandler } from './sign-out'
import { signUpHandler } from './sign-up'

const TAGS = ['Auth']

const email: OpenAPIV3_1.SchemaObject = {
  type: 'string',
  format: 'email',
  description: 'User email address.',
}

const actorType: OpenAPIV3_1.SchemaObject = {
  type: 'string',
  description: 'Optional actor type to authenticate as (defaults to the standard actor).',
}

/** `200` success body — `{ user }`; the session cookie ships via `Set-Cookie`. */
const userResponse: OpenAPIV3_1.ResponseObject = {
  description: 'Authenticated. The session cookie is set via the `Set-Cookie` header.',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: { user: { type: 'object', description: 'The authenticated user.' } },
        required: ['user'],
      },
    },
  },
}

const errorCode: OpenAPIV3_1.SchemaObject = { type: 'string', description: 'Machine-readable error code.' }

/** Failure body — `{ error: code }`, where `code` is a machine-readable tag. */
function errorResponse(description: string): OpenAPIV3_1.ResponseObject {
  return {
    description,
    content: {
      'application/json': {
        schema: { type: 'object', properties: { error: errorCode }, required: ['error'] },
      },
    },
  }
}

/**
 * `400` failure body — `{ error: 'INVALID_REQUEST_BODY', details }`. `details`
 * lists each field that failed `Schema` decoding (Standard Schema V1 shape);
 * see `errorResponseBody` in `./error-map`. A 400 is only ever raised for an
 * invalid body, so `details` is always present.
 */
const invalidBodyResponse: OpenAPIV3_1.ResponseObject = {
  description: 'Invalid request body. `details` lists the offending fields.',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          error: errorCode,
          details: {
            type: 'array',
            description: 'Per-field validation failures.',
            items: {
              type: 'object',
              properties: {
                path: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Path to the offending field, e.g. `["email"]`.',
                },
                message: { type: 'string', description: 'Human-readable validation message.' },
              },
              required: ['path', 'message'],
            },
          },
        },
        required: ['error', 'details'],
      },
    },
  },
}

function jsonBody(schema: OpenAPIV3_1.SchemaObject): OpenAPIV3_1.RequestBodyObject {
  return { required: true, content: { 'application/json': { schema } } }
}

export const authRoutes: readonly ApiRoute[] = [
  defineApiRoute({
    method: 'post',
    path: '/api/auth/sign-up',
    handler: signUpHandler,
    operation: {
      tags: TAGS,
      summary: 'Sign up with email and password',
      description: 'Creates a credential account and starts a session (sets the session cookie).',
      requestBody: jsonBody({
        type: 'object',
        properties: {
          email,
          name: { type: 'string', minLength: 1, maxLength: 255, description: 'Display name.' },
          password: { type: 'string', minLength: 8, maxLength: 128, description: 'Plain-text password (min 8 chars).' },
          actorType,
        },
        required: ['email', 'name', 'password'],
      }),
      responses: {
        200: userResponse,
        400: invalidBodyResponse,
        403: errorResponse('Actor type not allowed.'),
        409: errorResponse('Email already registered.'),
      },
    },
  }),
  defineApiRoute({
    method: 'post',
    path: '/api/auth/sign-in',
    handler: signInHandler,
    operation: {
      tags: TAGS,
      summary: 'Sign in with email and password',
      description: 'Verifies credentials and starts a session (sets the session cookie).',
      requestBody: jsonBody({
        type: 'object',
        properties: {
          email,
          password: { type: 'string', minLength: 1, maxLength: 128, description: 'Plain-text password.' },
          actorType,
        },
        required: ['email', 'password'],
      }),
      responses: {
        200: userResponse,
        400: invalidBodyResponse,
        401: errorResponse('Invalid credentials.'),
        403: errorResponse('Actor type not allowed.'),
      },
    },
  }),
  defineApiRoute({
    method: 'post',
    path: '/api/auth/sign-out',
    handler: signOutHandler,
    operation: {
      tags: TAGS,
      summary: 'Sign out',
      description: 'Revokes the current session (best-effort) and clears the session cookie.',
      responses: {
        204: { description: 'Signed out. The session cookie is cleared.' },
      },
    },
  }),
]
