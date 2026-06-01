import type { Effect as EffectNS } from 'effect'
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2'
import { Context, Effect, Layer } from 'effect'
import { PasswordHashFailed } from './user'

/**
 * Password hashing/verification via Argon2id (`@node-rs/argon2`).
 *
 * - `hash` returns a self-describing PHC string (`$argon2id$v=19$m=…$…`);
 *   any failure → `PasswordHashFailed` (reused from `./user`).
 * - `verify` never fails: a wrong password → `false`, and a malformed stored
 *   hash (which `@node-rs/argon2` reports by THROWING) is caught → `false`.
 */
export class PasswordService extends Context.Service<
  PasswordService,
  {
    readonly hash: (plain: string) => EffectNS.Effect<string, PasswordHashFailed>
    readonly verify: (storedHash: string, plain: string) => EffectNS.Effect<boolean>
  }
>()('@czo/auth/PasswordService') {}

const make = Effect.sync(() =>
  PasswordService.of({
    hash: plain =>
      Effect.tryPromise({
        try: () => argonHash(plain),
        catch: cause => new PasswordHashFailed({ cause }),
      }),
    verify: (storedHash, plain) =>
      Effect.tryPromise(() => argonVerify(storedHash, plain)).pipe(
        Effect.orElseSucceed(() => false),
      ),
  }),
)

/** Layer — no dependencies, no async construction. */
export const layer = Layer.effect(PasswordService, make)
