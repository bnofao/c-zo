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
import { sg } from '../subgraphs'

export function registerChoiceValueMutations(builder: AttributeGraphQLSchemaBuilder): void {
  const BOTH = sg('org', 'admin')

  // ─── value family ──────────────────────────────────────────────────────────

  builder.relayMutationField(
    'createAttributeValue',
    {
      ...BOTH.input,
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true, description: 'The DROPDOWN or MULTISELECT attribute that owns the new choice value.' }),
        // Optional org id (same convention as createAttribute): omit/null → platform value.
        organizationId: t.globalID({ for: 'Organization', description: 'Owning organization; omit or null to create a platform-scoped value.' }),
        value: t.string({ required: true, description: 'The displayed text of the choice value.' }),
        slug: t.string({ description: 'URL-friendly identifier, unique within the attribute and scope; auto-derived from the value when omitted.' }),
        position: t.int({ description: 'Sort order of the value among its siblings; appended last when omitted.' }),
      }),
    },
    {
      ...BOTH.field,
      description: 'Creates a plain choice value on a DROPDOWN or MULTISELECT attribute.',
      errors: { types: [AttributeValue.AttributeValueSlugTaken, AttributeValue.AttributeParentNotOwned], ...BOTH.errorOpts },
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
      ...BOTH.payload,
      outputFields: t => ({
        value: t.field({ type: 'AttributeValue', resolve: p => p.value, description: 'The newly created choice value.' }),
      }),
    },
  )

  builder.relayMutationField(
    'updateAttributeValue',
    {
      ...BOTH.input,
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeValue', required: true, description: 'The choice value to update.' }),
        value: t.string({ description: 'New displayed text; leave unset to keep the current value.' }),
        slug: t.string({ description: 'New slug, unique within the attribute and scope; leave unset to keep the current slug.' }),
        position: t.int({ description: 'New sort position among siblings; leave unset to keep the current order.' }),
      }),
    },
    {
      ...BOTH.field,
      description: 'Updates a plain choice value on a DROPDOWN or MULTISELECT attribute.',
      errors: { types: [AttributeValue.AttributeValueNotFound, AttributeValue.AttributeValueSlugTaken], ...BOTH.errorOpts },
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
      ...BOTH.payload,
      outputFields: t => ({
        value: t.field({ type: 'AttributeValue', resolve: p => p.value, description: 'The updated choice value.' }),
      }),
    },
  )

  builder.relayMutationField(
    'deleteAttributeValue',
    {
      ...BOTH.input,
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeValue', required: true, description: 'The choice value to delete.' }),
      }),
    },
    {
      ...BOTH.field,
      description: 'Deletes a plain choice value from a DROPDOWN or MULTISELECT attribute.',
      errors: { types: [AttributeValue.AttributeValueNotFound], ...BOTH.errorOpts },
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
      ...BOTH.payload,
      outputFields: t => ({
        value: t.field({ type: 'AttributeValue', resolve: p => p.value, description: 'The choice value that was deleted.' }),
      }),
    },
  )

  builder.relayMutationField(
    'reorderAttributeValues',
    {
      ...BOTH.input,
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true, description: 'The attribute whose choice values are being reordered.' }),
        orderedIds: t.globalIDList({ for: 'AttributeValue', required: true, description: 'The choice value ids in their desired display order.' }),
      }),
    },
    {
      ...BOTH.field,
      description: 'Reorders the plain choice values of a DROPDOWN or MULTISELECT attribute.',
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
      ...BOTH.payload,
      outputFields: t => ({
        success: t.boolean({ resolve: p => p.success, description: 'True when the values were reordered.' }),
      }),
    },
  )

  // ─── swatch family ─────────────────────────────────────────────────────────

  builder.relayMutationField(
    'createAttributeSwatch',
    {
      ...BOTH.input,
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true, description: 'The SWATCH attribute that owns the new swatch value.' }),
        // Optional org id (same convention as createAttribute): omit/null → platform value.
        organizationId: t.globalID({ for: 'Organization', description: 'Owning organization; omit or null to create a platform-scoped swatch.' }),
        value: t.string({ required: true, description: 'The displayed text of the swatch value.' }),
        slug: t.string({ description: 'URL-friendly identifier, unique within the attribute and scope; auto-derived from the value when omitted.' }),
        position: t.int({ description: 'Sort order of the swatch among its siblings; appended last when omitted.' }),
        color: t.string({ description: 'Hex color of the swatch; either this or a file must be supplied.' }),
        file: t.field({ type: 'FileInfoInput', description: 'Image file backing the swatch; either this or a color must be supplied.' }),
      }),
    },
    {
      ...BOTH.field,
      description: 'Creates a swatch choice value (color and/or image) on a SWATCH attribute.',
      errors: {
        types: [
          AttributeValue.AttributeValueSlugTaken,
          AttributeValue.SwatchRequiresColorOrFile,
          AttributeValue.SwatchVisualInvalid,
          AttributeValue.AttributeParentNotOwned,
        ],
        ...BOTH.errorOpts,
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
      ...BOTH.payload,
      outputFields: t => ({
        value: t.field({ type: 'AttributeSwatchValue', resolve: p => p.value, description: 'The newly created swatch value.' }),
      }),
    },
  )

  builder.relayMutationField(
    'updateAttributeSwatch',
    {
      ...BOTH.input,
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeSwatchValue', required: true, description: 'The swatch value to update.' }),
        value: t.string({ description: 'New displayed text; leave unset to keep the current value.' }),
        slug: t.string({ description: 'New slug, unique within the attribute and scope; leave unset to keep the current slug.' }),
        position: t.int({ description: 'New sort position among siblings; leave unset to keep the current order.' }),
        color: t.string({ description: 'New hex color; pass null to clear it, leave unset to keep the current color.' }),
        file: t.field({ type: 'FileInfoInput', description: 'New backing image; pass null to clear it, leave unset to keep the current file.' }),
      }),
    },
    {
      ...BOTH.field,
      description: 'Updates a swatch choice value on a SWATCH attribute.',
      errors: {
        types: [
          AttributeValue.AttributeValueNotFound,
          AttributeValue.AttributeValueSlugTaken,
          AttributeValue.SwatchRequiresColorOrFile,
          AttributeValue.SwatchVisualInvalid,
        ],
        ...BOTH.errorOpts,
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
      ...BOTH.payload,
      outputFields: t => ({
        value: t.field({ type: 'AttributeSwatchValue', resolve: p => p.value, description: 'The updated swatch value.' }),
      }),
    },
  )

  builder.relayMutationField(
    'deleteAttributeSwatch',
    {
      ...BOTH.input,
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeSwatchValue', required: true, description: 'The swatch value to delete.' }),
      }),
    },
    {
      ...BOTH.field,
      description: 'Deletes a swatch choice value from a SWATCH attribute.',
      errors: { types: [AttributeValue.AttributeValueNotFound], ...BOTH.errorOpts },
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
      ...BOTH.payload,
      outputFields: t => ({
        value: t.field({ type: 'AttributeSwatchValue', resolve: p => p.value, description: 'The swatch value that was deleted.' }),
      }),
    },
  )

  builder.relayMutationField(
    'reorderAttributeSwatches',
    {
      ...BOTH.input,
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true, description: 'The attribute whose swatch values are being reordered.' }),
        orderedIds: t.globalIDList({ for: 'AttributeSwatchValue', required: true, description: 'The swatch value ids in their desired display order.' }),
      }),
    },
    {
      ...BOTH.field,
      description: 'Reorders the swatch values of a SWATCH attribute.',
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
      ...BOTH.payload,
      outputFields: t => ({
        success: t.boolean({ resolve: p => p.success, description: 'True when the swatches were reordered.' }),
      }),
    },
  )

  // ─── reference family ──────────────────────────────────────────────────────

  builder.relayMutationField(
    'createAttributeReference',
    {
      ...BOTH.input,
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true, description: 'The REFERENCE attribute that owns the new reference value.' }),
        // Optional org id (same convention as createAttribute): omit/null → platform value.
        organizationId: t.globalID({ for: 'Organization', description: 'Owning organization; omit or null to create a platform-scoped reference.' }),
        value: t.string({ required: true, description: 'The displayed text of the reference value.' }),
        referenceId: t.int({ required: true, description: 'Identifier of the entity this value points at.' }),
        slug: t.string({ description: 'URL-friendly identifier, unique within the attribute and scope; auto-derived from the value when omitted.' }),
        position: t.int({ description: 'Sort order of the value among its siblings; appended last when omitted.' }),
      }),
    },
    {
      ...BOTH.field,
      description: 'Creates a reference choice value pointing at another entity on a REFERENCE attribute.',
      errors: { types: [AttributeValue.AttributeValueSlugTaken, AttributeValue.AttributeParentNotOwned], ...BOTH.errorOpts },
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
      ...BOTH.payload,
      outputFields: t => ({
        value: t.field({ type: 'AttributeReferenceValue', resolve: p => p.value, description: 'The newly created reference value.' }),
      }),
    },
  )

  builder.relayMutationField(
    'updateAttributeReference',
    {
      ...BOTH.input,
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeReferenceValue', required: true, description: 'The reference value to update.' }),
        value: t.string({ description: 'New displayed text; leave unset to keep the current value.' }),
        slug: t.string({ description: 'New slug, unique within the attribute and scope; leave unset to keep the current slug.' }),
        position: t.int({ description: 'New sort position among siblings; leave unset to keep the current order.' }),
        referenceId: t.int({ description: 'New target entity id; leave unset to keep the current reference.' }),
      }),
    },
    {
      ...BOTH.field,
      description: 'Updates a reference choice value on a REFERENCE attribute.',
      errors: { types: [AttributeValue.AttributeValueNotFound, AttributeValue.AttributeValueSlugTaken], ...BOTH.errorOpts },
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
      ...BOTH.payload,
      outputFields: t => ({
        value: t.field({ type: 'AttributeReferenceValue', resolve: p => p.value, description: 'The updated reference value.' }),
      }),
    },
  )

  builder.relayMutationField(
    'deleteAttributeReference',
    {
      ...BOTH.input,
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeReferenceValue', required: true, description: 'The reference value to delete.' }),
      }),
    },
    {
      ...BOTH.field,
      description: 'Deletes a reference choice value from a REFERENCE attribute.',
      errors: { types: [AttributeValue.AttributeValueNotFound], ...BOTH.errorOpts },
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
      ...BOTH.payload,
      outputFields: t => ({
        value: t.field({ type: 'AttributeReferenceValue', resolve: p => p.value, description: 'The reference value that was deleted.' }),
      }),
    },
  )

  builder.relayMutationField(
    'reorderAttributeReferences',
    {
      ...BOTH.input,
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true, description: 'The attribute whose reference values are being reordered.' }),
        orderedIds: t.globalIDList({ for: 'AttributeReferenceValue', required: true, description: 'The reference value ids in their desired display order.' }),
      }),
    },
    {
      ...BOTH.field,
      description: 'Reorders the reference values of a REFERENCE attribute.',
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
      ...BOTH.payload,
      outputFields: t => ({
        success: t.boolean({ resolve: p => p.success, description: 'True when the references were reordered.' }),
      }),
    },
  )
}
