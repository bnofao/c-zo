import { Schema } from 'effect'
import { signUp } from './credential'
import { makeCredentialHandler } from './handler'

const BodySchema = Schema.Struct({
  email: Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
  password: Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(128)),
  actorType: Schema.optional(Schema.String),
})

export const signUpHandler = makeCredentialHandler(BodySchema, signUp)
