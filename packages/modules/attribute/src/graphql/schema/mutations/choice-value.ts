// Attribute module — choice value mutations (value / swatch / reference).
//
// Each family has create / update / delete / reorder. authScope tiers:
//   • create — keyed on the client-supplied `organizationId` input
//              (`valueCreateScope`, same convention as createAttribute): a number
//              → org `attribute:create` (membership checked); omit/null → platform
//              `attribute:create` (global role). Parent-ownership integrity is
//              enforced server-side in the service (`AttributeParentNotOwned`).
//   • update / delete — derive the org from the VALUE row (`valueScope`).
//   • reorder — derive the org from the PARENT attribute (`attributeScope`),
//               verb `update`.
//   In by-id cases: undefined → { auth: true } (404 defer); null → permission
//   without org (global role); number → permission with org (member role).

import type { AttributeGraphQLSchemaBuilder } from '../..'
import { Effect } from 'effect'
import { AttributeValue } from '../../../services'
import { attributeScope, decodeOrgInput, valueCreateScope, valueScope } from '../../authz'

export function registerChoiceValueMutations(builder: AttributeGraphQLSchemaBuilder): void {
  // ─── value family ──────────────────────────────────────────────────────────

  builder.relayMutationField(
    'createAttributeValue',
    {
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true }),
        // Optional org id (same convention as createAttribute): omit/null → platform value.
        organizationId: t.globalID({ for: 'Organization' }),
        value: t.string({ required: true }),
        slug: t.string(),
        position: t.int(),
      }),
    },
    {
      errors: { types: [AttributeValue.AttributeValueSlugTaken, AttributeValue.AttributeParentNotOwned] },
      authScopes: (_parent, args) => valueCreateScope(args.input.organizationId),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const attributeId = Number(input.attributeId.id)
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AttributeValue.AttributeValueService
            return yield* svc.createValue({
              attributeId,
              organizationId: decodeOrgInput(input.organizationId),
              value: input.value,
              slug: input.slug ?? undefined,
              position: input.position ?? undefined,
            })
          }),
        )
        return { value }
      },
    },
    {
      outputFields: t => ({
        value: t.field({ type: 'AttributeValue', resolve: p => p.value }),
      }),
    },
  )

  builder.relayMutationField(
    'updateAttributeValue',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeValue', required: true }),
        value: t.string(),
        slug: t.string(),
        position: t.int(),
      }),
    },
    {
      errors: { types: [AttributeValue.AttributeValueNotFound, AttributeValue.AttributeValueSlugTaken] },
      authScopes: (_parent, args, ctx) => valueScope(ctx, 'value', Number(args.input.id.id), 'update'),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const id = Number(input.id.id)
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AttributeValue.AttributeValueService
            return yield* svc.updateValue(id, {
              ...(input.value != null && { value: input.value }),
              ...(input.slug != null && { slug: input.slug }),
              ...(input.position != null && { position: input.position }),
            })
          }),
        )
        return { value }
      },
    },
    {
      outputFields: t => ({
        value: t.field({ type: 'AttributeValue', resolve: p => p.value }),
      }),
    },
  )

  builder.relayMutationField(
    'deleteAttributeValue',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeValue', required: true }),
      }),
    },
    {
      errors: { types: [AttributeValue.AttributeValueNotFound] },
      authScopes: (_parent, args, ctx) => valueScope(ctx, 'value', Number(args.input.id.id), 'delete'),
      resolve: async (_root, args, ctx) => {
        const id = Number(args.input.id.id)
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AttributeValue.AttributeValueService
            return yield* svc.deleteValue(id)
          }),
        )
        return { value }
      },
    },
    {
      outputFields: t => ({
        value: t.field({ type: 'AttributeValue', resolve: p => p.value }),
      }),
    },
  )

  builder.relayMutationField(
    'reorderAttributeValues',
    {
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true }),
        orderedIds: t.globalIDList({ for: 'AttributeValue', required: true }),
      }),
    },
    {
      authScopes: (_parent, args, ctx) => attributeScope(ctx, Number(args.input.attributeId.id), 'update'),
      resolve: async (_root, args, ctx) => {
        const attributeId = Number(args.input.attributeId.id)
        const orderedIds = args.input.orderedIds.map(g => Number(g.id))
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AttributeValue.AttributeValueService
            yield* svc.reorderValues(attributeId, orderedIds)
          }),
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({ resolve: p => p.success }),
      }),
    },
  )

  // ─── swatch family ─────────────────────────────────────────────────────────

  builder.relayMutationField(
    'createAttributeSwatch',
    {
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true }),
        // Optional org id (same convention as createAttribute): omit/null → platform value.
        organizationId: t.globalID({ for: 'Organization' }),
        value: t.string({ required: true }),
        slug: t.string(),
        position: t.int(),
        color: t.string(),
        file: t.field({ type: 'FileInfoInput' }),
      }),
    },
    {
      errors: {
        types: [
          AttributeValue.AttributeValueSlugTaken,
          AttributeValue.SwatchRequiresColorOrFile,
          AttributeValue.SwatchVisualInvalid,
          AttributeValue.AttributeParentNotOwned,
        ],
      },
      authScopes: (_parent, args) => valueCreateScope(args.input.organizationId),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const attributeId = Number(input.attributeId.id)
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AttributeValue.AttributeValueService
            return yield* svc.createSwatch({
              ...input,
              attributeId,
              organizationId: decodeOrgInput(input.organizationId),
              slug: input.slug ?? undefined,
              position: input.position ?? undefined,
            })
          }),
        )
        return { value }
      },
    },
    {
      outputFields: t => ({
        value: t.field({ type: 'AttributeSwatchValue', resolve: p => p.value }),
      }),
    },
  )

  builder.relayMutationField(
    'updateAttributeSwatch',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeSwatchValue', required: true }),
        value: t.string(),
        slug: t.string(),
        position: t.int(),
        color: t.string(),
        file: t.field({ type: 'FileInfoInput' }),
      }),
    },
    {
      errors: {
        types: [
          AttributeValue.AttributeValueNotFound,
          AttributeValue.AttributeValueSlugTaken,
          AttributeValue.SwatchRequiresColorOrFile,
          AttributeValue.SwatchVisualInvalid,
        ],
      },
      authScopes: (_parent, args, ctx) => valueScope(ctx, 'swatch', Number(args.input.id.id), 'update'),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const id = Number(input.id.id)
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AttributeValue.AttributeValueService
            return yield* svc.updateSwatch(id, {
              ...(input.value != null && { value: input.value }),
              ...(input.slug != null && { slug: input.slug }),
              ...(input.position != null && { position: input.position }),
              ...(input.color !== undefined && { color: input.color }),
              ...(input.file !== undefined && { file: input.file }),
            })
          }),
        )
        return { value }
      },
    },
    {
      outputFields: t => ({
        value: t.field({ type: 'AttributeSwatchValue', resolve: p => p.value }),
      }),
    },
  )

  builder.relayMutationField(
    'deleteAttributeSwatch',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeSwatchValue', required: true }),
      }),
    },
    {
      errors: { types: [AttributeValue.AttributeValueNotFound] },
      authScopes: (_parent, args, ctx) => valueScope(ctx, 'swatch', Number(args.input.id.id), 'delete'),
      resolve: async (_root, args, ctx) => {
        const id = Number(args.input.id.id)
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AttributeValue.AttributeValueService
            return yield* svc.deleteSwatch(id)
          }),
        )
        return { value }
      },
    },
    {
      outputFields: t => ({
        value: t.field({ type: 'AttributeSwatchValue', resolve: p => p.value }),
      }),
    },
  )

  builder.relayMutationField(
    'reorderAttributeSwatches',
    {
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true }),
        orderedIds: t.globalIDList({ for: 'AttributeSwatchValue', required: true }),
      }),
    },
    {
      authScopes: (_parent, args, ctx) => attributeScope(ctx, Number(args.input.attributeId.id), 'update'),
      resolve: async (_root, args, ctx) => {
        const attributeId = Number(args.input.attributeId.id)
        const orderedIds = args.input.orderedIds.map(g => Number(g.id))
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AttributeValue.AttributeValueService
            yield* svc.reorderSwatches(attributeId, orderedIds)
          }),
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({ resolve: p => p.success }),
      }),
    },
  )

  // ─── reference family ──────────────────────────────────────────────────────

  builder.relayMutationField(
    'createAttributeReference',
    {
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true }),
        // Optional org id (same convention as createAttribute): omit/null → platform value.
        organizationId: t.globalID({ for: 'Organization' }),
        value: t.string({ required: true }),
        referenceId: t.int({ required: true }),
        slug: t.string(),
        position: t.int(),
      }),
    },
    {
      errors: { types: [AttributeValue.AttributeValueSlugTaken, AttributeValue.AttributeParentNotOwned] },
      authScopes: (_parent, args) => valueCreateScope(args.input.organizationId),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const attributeId = Number(input.attributeId.id)
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AttributeValue.AttributeValueService
            return yield* svc.createReference({
              attributeId,
              organizationId: decodeOrgInput(input.organizationId),
              value: input.value,
              referenceId: input.referenceId,
              slug: input.slug ?? undefined,
              position: input.position ?? undefined,
            })
          }),
        )
        return { value }
      },
    },
    {
      outputFields: t => ({
        value: t.field({ type: 'AttributeReferenceValue', resolve: p => p.value }),
      }),
    },
  )

  builder.relayMutationField(
    'updateAttributeReference',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeReferenceValue', required: true }),
        value: t.string(),
        slug: t.string(),
        position: t.int(),
        referenceId: t.int(),
      }),
    },
    {
      errors: { types: [AttributeValue.AttributeValueNotFound, AttributeValue.AttributeValueSlugTaken] },
      authScopes: (_parent, args, ctx) => valueScope(ctx, 'reference', Number(args.input.id.id), 'update'),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const id = Number(input.id.id)
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AttributeValue.AttributeValueService
            return yield* svc.updateReference(id, {
              ...(input.value != null && { value: input.value }),
              ...(input.slug != null && { slug: input.slug }),
              ...(input.position != null && { position: input.position }),
              ...(input.referenceId != null && { referenceId: input.referenceId }),
            })
          }),
        )
        return { value }
      },
    },
    {
      outputFields: t => ({
        value: t.field({ type: 'AttributeReferenceValue', resolve: p => p.value }),
      }),
    },
  )

  builder.relayMutationField(
    'deleteAttributeReference',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeReferenceValue', required: true }),
      }),
    },
    {
      errors: { types: [AttributeValue.AttributeValueNotFound] },
      authScopes: (_parent, args, ctx) => valueScope(ctx, 'reference', Number(args.input.id.id), 'delete'),
      resolve: async (_root, args, ctx) => {
        const id = Number(args.input.id.id)
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AttributeValue.AttributeValueService
            return yield* svc.deleteReference(id)
          }),
        )
        return { value }
      },
    },
    {
      outputFields: t => ({
        value: t.field({ type: 'AttributeReferenceValue', resolve: p => p.value }),
      }),
    },
  )

  builder.relayMutationField(
    'reorderAttributeReferences',
    {
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true }),
        orderedIds: t.globalIDList({ for: 'AttributeReferenceValue', required: true }),
      }),
    },
    {
      authScopes: (_parent, args, ctx) => attributeScope(ctx, Number(args.input.attributeId.id), 'update'),
      resolve: async (_root, args, ctx) => {
        const attributeId = Number(args.input.attributeId.id)
        const orderedIds = args.input.orderedIds.map(g => Number(g.id))
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AttributeValue.AttributeValueService
            yield* svc.reorderReferences(attributeId, orderedIds)
          }),
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({ resolve: p => p.success }),
      }),
    },
  )
}
