import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildCategoryTree,
  getCategoryDescendantIds,
  getCategoryPath,
  validateCategoryMove,
  getCategoryDepth
} from '../../../src/utils/category-tree'
import { testDb } from '../../setup'

describe('Category Tree Utilities', () => {
  beforeEach(async () => {
    if (testDb) {
      await testDb.deleteFrom('p_categories').execute()
    }
  })

  describe('buildCategoryTree', () => {
    it('should build tree structure from flat data', () => {
      const flatData = [
        { id: '1', name: 'Root', parent_id: null },
        { id: '2', name: 'Child 1', parent_id: '1' },
        { id: '3', name: 'Child 2', parent_id: '1' },
        { id: '4', name: 'Grandchild', parent_id: '2' },
      ]

      const tree = buildCategoryTree(flatData)

      expect(tree.length).toBe(1) // One root
      expect(tree[0].id).toBe('1')
      expect(tree[0].children.length).toBe(2)
      expect(tree[0].children[0].children.length).toBe(1)
    })

    it('should handle multiple roots', () => {
      const flatData = [
        { id: '1', name: 'Root 1', parent_id: null },
        { id: '2', name: 'Root 2', parent_id: null },
        { id: '3', name: 'Child', parent_id: '1' },
      ]

      const tree = buildCategoryTree(flatData)

      expect(tree.length).toBe(2)
    })
  })

  describe('getCategoryDescendantIds', () => {
    it('should return all descendant IDs', async () => {
      const root = await testDb
        .insertInto('p_categories')
        .values({
          id: 'root',
          name: 'Root',
          description: '',
          handle: 'root',
          is_active: false,
          is_internal: false,
          rank: 0,
          parent_id: null,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        })
        .returningAll()
        .executeTakeFirst()

      const child = await testDb
        .insertInto('p_categories')
        .values({
          id: 'child',
          name: 'Child',
          description: '',
          handle: 'child',
          is_active: false,
          is_internal: false,
          rank: 0,
          parent_id: 'root',
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        })
        .returningAll()
        .executeTakeFirst()

      const grandchild = await testDb
        .insertInto('p_categories')
        .values({
          id: 'grandchild',
          name: 'Grandchild',
          description: '',
          handle: 'grandchild',
          is_active: false,
          is_internal: false,
          rank: 0,
          parent_id: 'child',
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        })
        .returningAll()
        .executeTakeFirst()

      const descendants = await getCategoryDescendantIds(testDb, 'root')

      expect(descendants).toContain('child')
      expect(descendants).toContain('grandchild')
      expect(descendants).not.toContain('root') // Excludes root itself
    })
  })

  describe('validateCategoryMove', () => {
    it('should allow valid moves', async () => {
      await testDb.insertInto('p_categories').values({
        id: 'cat1',
        name: 'Cat 1',
        description: '',
        handle: 'cat1',
        is_active: false,
        is_internal: false,
        rank: 0,
        parent_id: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      }).execute()

      await testDb.insertInto('p_categories').values({
        id: 'cat2',
        name: 'Cat 2',
        description: '',
        handle: 'cat2',
        is_active: false,
        is_internal: false,
        rank: 0,
        parent_id: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      }).execute()

      const isValid = await validateCategoryMove(testDb, 'cat1', 'cat2')
      expect(isValid).toBe(true)
    })

    it('should prevent category from being its own parent', async () => {
      const isValid = await validateCategoryMove(testDb, 'cat1', 'cat1')
      expect(isValid).toBe(false)
    })

    it('should allow moving to root', async () => {
      const isValid = await validateCategoryMove(testDb, 'cat1', null)
      expect(isValid).toBe(true)
    })
  })
})

