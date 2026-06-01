/**
 * Crypto primitives for the auth module.
 *
 * RUNTIME ASSUMPTION: Node ≥18 (`node:crypto`). All Node-specific calls live
 * in this file alone — a runtime change (Bun, Deno, Workers, edge) only
 * requires swapping the bodies here for Web Crypto / @oslojs / etc.
 */
import { createHash, randomBytes } from 'node:crypto'

export function sha256Hex(plain: string): string {
  return createHash('sha256').update(plain).digest('hex')
}

export function randomString(length: number, alphabet?: string): string {
  const chars = alphabet ?? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += chars[bytes[i]! % chars.length]
  return out
}
