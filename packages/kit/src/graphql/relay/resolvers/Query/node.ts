import { resolveNode } from '../../node-registry'

export const node = (_parent: unknown, args: { id: string }, ctx: unknown): any =>
  resolveNode(args.id, ctx as any)
