import { describe, expect, it } from 'vitest'
import { buildConnection } from './connection'

const items = [
  { id: '1', name: 'A' },
  { id: '2', name: 'B' },
  { id: '3', name: 'C' },
]

const getCursor = (node: { id: string }) => btoa(`id:${node.id}`)

describe('buildConnection', () => {
  it('should build edges with cursors', () => {
    const conn = buildConnection({ nodes: items, args: { first: 10 }, totalCount: 3, getCursor })
    expect(conn.edges).toHaveLength(3)
    expect(conn.edges[0]!.node).toEqual(items[0])
    expect(conn.edges[0]!.cursor).toBe(getCursor(items[0]!))
  })

  it('should set pageInfo.hasNextPage=false when all items returned', () => {
    const conn = buildConnection({ nodes: items, args: { first: 10 }, totalCount: 3, getCursor })
    expect(conn.pageInfo.hasNextPage).toBe(false)
    expect(conn.pageInfo.hasPreviousPage).toBe(false)
  })

  it('should set hasNextPage=true when nodes.length > first', () => {
    const conn = buildConnection({ nodes: items, args: { first: 2 }, totalCount: 10, getCursor })
    expect(conn.edges).toHaveLength(2)
    expect(conn.pageInfo.hasNextPage).toBe(true)
  })

  it('should set hasPreviousPage=true when after cursor is provided', () => {
    const conn = buildConnection({ nodes: items, args: { first: 10, after: 'some-cursor' }, totalCount: 3, getCursor })
    expect(conn.pageInfo.hasPreviousPage).toBe(true)
  })

  it('should set startCursor and endCursor from first and last edges', () => {
    const conn = buildConnection({ nodes: items, args: { first: 10 }, totalCount: 3, getCursor })
    expect(conn.pageInfo.startCursor).toBe(getCursor(items[0]!))
    expect(conn.pageInfo.endCursor).toBe(getCursor(items[2]!))
  })

  it('should return null cursors and empty edges when no nodes', () => {
    const conn = buildConnection({ nodes: [], args: { first: 10 }, totalCount: 0, getCursor })
    expect(conn.edges).toEqual([])
    expect(conn.pageInfo.startCursor).toBeNull()
    expect(conn.pageInfo.endCursor).toBeNull()
    expect(conn.pageInfo.hasNextPage).toBe(false)
  })

  it('should handle last/before pagination', () => {
    const conn = buildConnection({ nodes: items, args: { last: 2, before: 'some-cursor' }, totalCount: 10, getCursor })
    expect(conn.edges).toHaveLength(2)
    expect(conn.pageInfo.hasNextPage).toBe(true)
  })

  it('should handle last-only (no before) — returns last N items', () => {
    const conn = buildConnection({ nodes: items.slice(-2), args: { last: 2 }, totalCount: 3, getCursor })
    expect(conn.edges).toHaveLength(2)
    expect(conn.pageInfo.hasPreviousPage).toBe(true)
  })

  it('should pass totalCount through', () => {
    const conn = buildConnection({ nodes: items, args: { first: 10 }, totalCount: 42, getCursor })
    expect(conn.totalCount).toBe(42)
  })
})
