import { Schema } from 'effect'
import { signIn } from './credential'
import { makeCredentialHandler } from './handler'

const BodySchema = Schema.Struct({
  email: Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/)),
  password: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  actorType: Schema.optional(Schema.String),
})

export const signInHandler = makeCredentialHandler('signin', BodySchema, signIn)
