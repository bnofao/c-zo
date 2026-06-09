// Attribute module — typed value mutations (text / numeric / boolean / date /
// file). Each family has create / update / delete (15 total).
//
// authScope tiers mirror choice-value:
//   • create — keyed on the client-supplied `organizationId` input
//              (`valueCreateScope`, same convention as createAttribute): number →
//              org (membership checked); omit/null → platform (global role).
//              Parent-ownership integrity is enforced server-side in the service.
//   • update / delete — derive org from the VALUE row (`valueScope`), verbs
//              `update` / `delete`.
//   In by-id cases: undefined → { auth: true } (404 defer); null → permission
//   without org (global role); number → permission with org (member role).

import type { AttributeGraphQLSchemaBuilder } from '../..'
import { Effect } from 'effect'
import { AttributeValue, TypedValue } from '../../../services'
import { decodeOrgInput, valueCreateScope, valueScope } from '../../authz'

export function registerTypedValueMutations(builder: AttributeGraphQLSchemaBuilder): void {
  // ─── text ────────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createAttributeTextValue',
    {
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true, description: 'The TEXT attribute to set the value on.' }),
        // Optional org id (same convention as createAttribute): omit/null → platform value.
        organizationId: t.globalID({ for: 'Organization', description: 'Organization that owns the value; omit or null to create a platform-scoped value (requires the global role).' }),
        plain: t.string({ required: true, description: 'The plain-text representation of the value.' }),
        rich: t.field({ type: 'JSONObject', description: 'Optional rich-text representation stored as a JSON document.' }),
        externalSource: t.string({ description: 'Optional identifier of the external system this value originates from.' }),
        externalId: t.string({ description: 'Optional identifier of this value within its external source.' }),
      }),
    },
    {
      description: 'Sets the typed value of a TEXT attribute, creating its single AttributeTextValue node.',
      errors: { types: [AttributeValue.AttributeParentNotOwned] },
      authScopes: (_p, args) => valueCreateScope(args.input.organizationId),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TypedValue.TypedValueService
            return yield* svc.createText({
              attributeId: Number(input.attributeId.id),
              organizationId: decodeOrgInput(input.organizationId),
              plain: input.plain,
              rich: input.rich ?? null,
              externalSource: input.externalSource ?? null,
              externalId: input.externalId ?? null,
            })
          }),
        )
        return { value }
      },
    },
    { outputFields: t => ({ value: t.field({ type: 'AttributeTextValue', resolve: p => p.value, description: 'The newly created text value.' }) }) },
  )

  builder.relayMutationField(
    'updateAttributeTextValue',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeTextValue', required: true, description: 'The text value to update.' }),
        plain: t.string({ description: 'New plain-text representation; omit to leave it unchanged.' }),
        rich: t.field({ type: 'JSONObject', description: 'New rich-text JSON document; omit to leave it unchanged, pass null to clear it.' }),
      }),
    },
    {
      description: 'Updates the plain and/or rich representation of an existing TEXT attribute value.',
      errors: { types: [TypedValue.TypedValueNotFound] },
      authScopes: (_p, args, ctx) => valueScope(ctx, 'text', Number(args.input.id.id), 'update'),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TypedValue.TypedValueService
            return yield* svc.updateText(Number(input.id.id), {
              ...(input.plain != null && { plain: input.plain }),
              ...(input.rich !== undefined && { rich: input.rich ?? null }),
            })
          }),
        )
        return { value }
      },
    },
    { outputFields: t => ({ value: t.field({ type: 'AttributeTextValue', resolve: p => p.value, description: 'The updated text value.' }) }) },
  )

  builder.relayMutationField(
    'deleteAttributeTextValue',
    { inputFields: t => ({ id: t.globalID({ for: 'AttributeTextValue', required: true, description: 'The text value to clear.' }) }) },
    {
      description: 'Clears the typed value of a TEXT attribute, removing its AttributeTextValue node.',
      errors: { types: [TypedValue.TypedValueNotFound] },
      authScopes: (_p, args, ctx) => valueScope(ctx, 'text', Number(args.input.id.id), 'delete'),
      resolve: async (_root, args, ctx) => {
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TypedValue.TypedValueService
            return yield* svc.deleteText(Number(args.input.id.id))
          }),
        )
        return { value }
      },
    },
    { outputFields: t => ({ value: t.field({ type: 'AttributeTextValue', resolve: p => p.value, description: 'The text value that was cleared.' }) }) },
  )

  // ─── numeric ───────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createAttributeNumericValue',
    {
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true, description: 'The NUMBER attribute to set the value on.' }),
        // Optional org id (same convention as createAttribute): omit/null → platform value.
        organizationId: t.globalID({ for: 'Organization', description: 'Organization that owns the value; omit or null to create a platform-scoped value (requires the global role).' }),
        value: t.float({ required: true, description: 'The numeric value to store.' }),
        externalSource: t.string({ description: 'Optional identifier of the external system this value originates from.' }),
        externalId: t.string({ description: 'Optional identifier of this value within its external source.' }),
      }),
    },
    {
      description: 'Sets the typed value of a NUMBER attribute, creating its single AttributeNumericValue node.',
      errors: { types: [AttributeValue.AttributeParentNotOwned] },
      authScopes: (_p, args) => valueCreateScope(args.input.organizationId),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TypedValue.TypedValueService
            return yield* svc.createNumeric({
              attributeId: Number(input.attributeId.id),
              organizationId: decodeOrgInput(input.organizationId),
              value: input.value,
              externalSource: input.externalSource ?? null,
              externalId: input.externalId ?? null,
            })
          }),
        )
        return { value }
      },
    },
    { outputFields: t => ({ value: t.field({ type: 'AttributeNumericValue', resolve: p => p.value, description: 'The newly created numeric value.' }) }) },
  )

  builder.relayMutationField(
    'updateAttributeNumericValue',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeNumericValue', required: true, description: 'The numeric value to update.' }),
        value: t.float({ description: 'New numeric value; omit to leave it unchanged.' }),
      }),
    },
    {
      description: 'Updates the stored number of an existing NUMBER attribute value.',
      errors: { types: [TypedValue.TypedValueNotFound] },
      authScopes: (_p, args, ctx) => valueScope(ctx, 'numeric', Number(args.input.id.id), 'update'),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TypedValue.TypedValueService
            return yield* svc.updateNumeric(Number(input.id.id), {
              ...(input.value != null && { value: input.value }),
            })
          }),
        )
        return { value }
      },
    },
    { outputFields: t => ({ value: t.field({ type: 'AttributeNumericValue', resolve: p => p.value, description: 'The updated numeric value.' }) }) },
  )

  builder.relayMutationField(
    'deleteAttributeNumericValue',
    { inputFields: t => ({ id: t.globalID({ for: 'AttributeNumericValue', required: true, description: 'The numeric value to clear.' }) }) },
    {
      description: 'Clears the typed value of a NUMBER attribute, removing its AttributeNumericValue node.',
      errors: { types: [TypedValue.TypedValueNotFound] },
      authScopes: (_p, args, ctx) => valueScope(ctx, 'numeric', Number(args.input.id.id), 'delete'),
      resolve: async (_root, args, ctx) => {
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TypedValue.TypedValueService
            return yield* svc.deleteNumeric(Number(args.input.id.id))
          }),
        )
        return { value }
      },
    },
    { outputFields: t => ({ value: t.field({ type: 'AttributeNumericValue', resolve: p => p.value, description: 'The numeric value that was cleared.' }) }) },
  )

  // ─── boolean ─────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createAttributeBooleanValue',
    {
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true, description: 'The BOOLEAN attribute to set the value on.' }),
        // Optional org id (same convention as createAttribute): omit/null → platform value.
        organizationId: t.globalID({ for: 'Organization', description: 'Organization that owns the value; omit or null to create a platform-scoped value (requires the global role).' }),
        value: t.boolean({ required: true, description: 'The boolean value to store.' }),
        externalSource: t.string({ description: 'Optional identifier of the external system this value originates from.' }),
        externalId: t.string({ description: 'Optional identifier of this value within its external source.' }),
      }),
    },
    {
      description: 'Sets the typed value of a BOOLEAN attribute, creating its single AttributeBooleanValue node.',
      errors: { types: [AttributeValue.AttributeParentNotOwned] },
      authScopes: (_p, args) => valueCreateScope(args.input.organizationId),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TypedValue.TypedValueService
            return yield* svc.createBoolean({
              attributeId: Number(input.attributeId.id),
              organizationId: decodeOrgInput(input.organizationId),
              value: input.value,
              externalSource: input.externalSource ?? null,
              externalId: input.externalId ?? null,
            })
          }),
        )
        return { value }
      },
    },
    { outputFields: t => ({ value: t.field({ type: 'AttributeBooleanValue', resolve: p => p.value, description: 'The newly created boolean value.' }) }) },
  )

  builder.relayMutationField(
    'updateAttributeBooleanValue',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeBooleanValue', required: true, description: 'The boolean value to update.' }),
        value: t.boolean({ description: 'New boolean value; omit to leave it unchanged.' }),
      }),
    },
    {
      description: 'Updates the stored flag of an existing BOOLEAN attribute value.',
      errors: { types: [TypedValue.TypedValueNotFound] },
      authScopes: (_p, args, ctx) => valueScope(ctx, 'boolean', Number(args.input.id.id), 'update'),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TypedValue.TypedValueService
            return yield* svc.updateBoolean(Number(input.id.id), {
              ...(input.value != null && { value: input.value }),
            })
          }),
        )
        return { value }
      },
    },
    { outputFields: t => ({ value: t.field({ type: 'AttributeBooleanValue', resolve: p => p.value, description: 'The updated boolean value.' }) }) },
  )

  builder.relayMutationField(
    'deleteAttributeBooleanValue',
    { inputFields: t => ({ id: t.globalID({ for: 'AttributeBooleanValue', required: true, description: 'The boolean value to clear.' }) }) },
    {
      description: 'Clears the typed value of a BOOLEAN attribute, removing its AttributeBooleanValue node.',
      errors: { types: [TypedValue.TypedValueNotFound] },
      authScopes: (_p, args, ctx) => valueScope(ctx, 'boolean', Number(args.input.id.id), 'delete'),
      resolve: async (_root, args, ctx) => {
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TypedValue.TypedValueService
            return yield* svc.deleteBoolean(Number(args.input.id.id))
          }),
        )
        return { value }
      },
    },
    { outputFields: t => ({ value: t.field({ type: 'AttributeBooleanValue', resolve: p => p.value, description: 'The boolean value that was cleared.' }) }) },
  )

  // ─── date ────────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createAttributeDateValue',
    {
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true, description: 'The DATE or DATETIME attribute to set the value on.' }),
        // Optional org id (same convention as createAttribute): omit/null → platform value.
        organizationId: t.globalID({ for: 'Organization', description: 'Organization that owns the value; omit or null to create a platform-scoped value (requires the global role).' }),
        value: t.field({ type: 'DateTime', required: true, description: 'The date/time value to store.' }),
        externalSource: t.string({ description: 'Optional identifier of the external system this value originates from.' }),
        externalId: t.string({ description: 'Optional identifier of this value within its external source.' }),
      }),
    },
    {
      description: 'Sets the typed value of a DATE or DATETIME attribute, creating its single AttributeDateValue node.',
      errors: { types: [AttributeValue.AttributeParentNotOwned] },
      authScopes: (_p, args) => valueCreateScope(args.input.organizationId),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TypedValue.TypedValueService
            return yield* svc.createDate({
              attributeId: Number(input.attributeId.id),
              organizationId: decodeOrgInput(input.organizationId),
              value: new Date(input.value),
              externalSource: input.externalSource ?? null,
              externalId: input.externalId ?? null,
            })
          }),
        )
        return { value }
      },
    },
    { outputFields: t => ({ value: t.field({ type: 'AttributeDateValue', resolve: p => p.value, description: 'The newly created date value.' }) }) },
  )

  builder.relayMutationField(
    'updateAttributeDateValue',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeDateValue', required: true, description: 'The date value to update.' }),
        value: t.field({ type: 'DateTime', description: 'New date/time value; omit to leave it unchanged.' }),
      }),
    },
    {
      description: 'Updates the stored date/time of an existing DATE or DATETIME attribute value.',
      errors: { types: [TypedValue.TypedValueNotFound] },
      authScopes: (_p, args, ctx) => valueScope(ctx, 'date', Number(args.input.id.id), 'update'),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TypedValue.TypedValueService
            return yield* svc.updateDate(Number(input.id.id), {
              ...(input.value != null && { value: new Date(input.value) }),
            })
          }),
        )
        return { value }
      },
    },
    { outputFields: t => ({ value: t.field({ type: 'AttributeDateValue', resolve: p => p.value, description: 'The updated date value.' }) }) },
  )

  builder.relayMutationField(
    'deleteAttributeDateValue',
    { inputFields: t => ({ id: t.globalID({ for: 'AttributeDateValue', required: true, description: 'The date value to clear.' }) }) },
    {
      description: 'Clears the typed value of a DATE or DATETIME attribute, removing its AttributeDateValue node.',
      errors: { types: [TypedValue.TypedValueNotFound] },
      authScopes: (_p, args, ctx) => valueScope(ctx, 'date', Number(args.input.id.id), 'delete'),
      resolve: async (_root, args, ctx) => {
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TypedValue.TypedValueService
            return yield* svc.deleteDate(Number(args.input.id.id))
          }),
        )
        return { value }
      },
    },
    { outputFields: t => ({ value: t.field({ type: 'AttributeDateValue', resolve: p => p.value, description: 'The date value that was cleared.' }) }) },
  )

  // ─── file ────────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createAttributeFileValue',
    {
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true, description: 'The FILE attribute to set the value on.' }),
        // Optional org id (same convention as createAttribute): omit/null → platform value.
        organizationId: t.globalID({ for: 'Organization', description: 'Organization that owns the value; omit or null to create a platform-scoped value (requires the global role).' }),
        file: t.field({ type: 'FileInfoInput', required: true, description: 'The file to store, given as its URL and MIME type.' }),
        externalSource: t.string({ description: 'Optional identifier of the external system this value originates from.' }),
        externalId: t.string({ description: 'Optional identifier of this value within its external source.' }),
      }),
    },
    {
      description: 'Sets the typed value of a FILE attribute, creating its single AttributeFileValue node.',
      errors: { types: [AttributeValue.AttributeParentNotOwned] },
      authScopes: (_p, args) => valueCreateScope(args.input.organizationId),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TypedValue.TypedValueService
            return yield* svc.createFile({
              attributeId: Number(input.attributeId.id),
              organizationId: decodeOrgInput(input.organizationId),
              fileUrl: input.file.url,
              mimetype: input.file.mimetype,
              externalSource: input.externalSource ?? null,
              externalId: input.externalId ?? null,
            })
          }),
        )
        return { value }
      },
    },
    { outputFields: t => ({ value: t.field({ type: 'AttributeFileValue', resolve: p => p.value, description: 'The newly created file value.' }) }) },
  )

  builder.relayMutationField(
    'updateAttributeFileValue',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeFileValue', required: true, description: 'The file value to update.' }),
        file: t.field({ type: 'FileInfoInput', description: 'New file (URL and MIME type); omit to leave it unchanged.' }),
      }),
    },
    {
      description: 'Updates the stored file of an existing FILE attribute value.',
      errors: { types: [TypedValue.TypedValueNotFound] },
      authScopes: (_p, args, ctx) => valueScope(ctx, 'file', Number(args.input.id.id), 'update'),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TypedValue.TypedValueService
            return yield* svc.updateFile(Number(input.id.id), {
              ...(input.file != null && { fileUrl: input.file.url, mimetype: input.file.mimetype }),
            })
          }),
        )
        return { value }
      },
    },
    { outputFields: t => ({ value: t.field({ type: 'AttributeFileValue', resolve: p => p.value, description: 'The updated file value.' }) }) },
  )

  builder.relayMutationField(
    'deleteAttributeFileValue',
    { inputFields: t => ({ id: t.globalID({ for: 'AttributeFileValue', required: true, description: 'The file value to clear.' }) }) },
    {
      description: 'Clears the typed value of a FILE attribute, removing its AttributeFileValue node.',
      errors: { types: [TypedValue.TypedValueNotFound] },
      authScopes: (_p, args, ctx) => valueScope(ctx, 'file', Number(args.input.id.id), 'delete'),
      resolve: async (_root, args, ctx) => {
        const value = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TypedValue.TypedValueService
            return yield* svc.deleteFile(Number(args.input.id.id))
          }),
        )
        return { value }
      },
    },
    { outputFields: t => ({ value: t.field({ type: 'AttributeFileValue', resolve: p => p.value, description: 'The file value that was cleared.' }) }) },
  )
}
