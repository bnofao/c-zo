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
        attributeId: t.globalID({ for: 'Attribute', required: true }),
        // Optional org id (same convention as createAttribute): omit/null → platform value.
        organizationId: t.globalID({ for: 'Organization' }),
        plain: t.string({ required: true }),
        rich: t.field({ type: 'JSONObject' }),
        externalSource: t.string(),
        externalId: t.string(),
      }),
    },
    {
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
    { outputFields: t => ({ value: t.field({ type: 'AttributeTextValue', resolve: p => p.value }) }) },
  )

  builder.relayMutationField(
    'updateAttributeTextValue',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeTextValue', required: true }),
        plain: t.string(),
        rich: t.field({ type: 'JSONObject' }),
      }),
    },
    {
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
    { outputFields: t => ({ value: t.field({ type: 'AttributeTextValue', resolve: p => p.value }) }) },
  )

  builder.relayMutationField(
    'deleteAttributeTextValue',
    { inputFields: t => ({ id: t.globalID({ for: 'AttributeTextValue', required: true }) }) },
    {
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
    { outputFields: t => ({ value: t.field({ type: 'AttributeTextValue', resolve: p => p.value }) }) },
  )

  // ─── numeric ───────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createAttributeNumericValue',
    {
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true }),
        // Optional org id (same convention as createAttribute): omit/null → platform value.
        organizationId: t.globalID({ for: 'Organization' }),
        value: t.float({ required: true }),
        externalSource: t.string(),
        externalId: t.string(),
      }),
    },
    {
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
    { outputFields: t => ({ value: t.field({ type: 'AttributeNumericValue', resolve: p => p.value }) }) },
  )

  builder.relayMutationField(
    'updateAttributeNumericValue',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeNumericValue', required: true }),
        value: t.float(),
      }),
    },
    {
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
    { outputFields: t => ({ value: t.field({ type: 'AttributeNumericValue', resolve: p => p.value }) }) },
  )

  builder.relayMutationField(
    'deleteAttributeNumericValue',
    { inputFields: t => ({ id: t.globalID({ for: 'AttributeNumericValue', required: true }) }) },
    {
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
    { outputFields: t => ({ value: t.field({ type: 'AttributeNumericValue', resolve: p => p.value }) }) },
  )

  // ─── boolean ─────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createAttributeBooleanValue',
    {
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true }),
        // Optional org id (same convention as createAttribute): omit/null → platform value.
        organizationId: t.globalID({ for: 'Organization' }),
        value: t.boolean({ required: true }),
        externalSource: t.string(),
        externalId: t.string(),
      }),
    },
    {
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
    { outputFields: t => ({ value: t.field({ type: 'AttributeBooleanValue', resolve: p => p.value }) }) },
  )

  builder.relayMutationField(
    'updateAttributeBooleanValue',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeBooleanValue', required: true }),
        value: t.boolean(),
      }),
    },
    {
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
    { outputFields: t => ({ value: t.field({ type: 'AttributeBooleanValue', resolve: p => p.value }) }) },
  )

  builder.relayMutationField(
    'deleteAttributeBooleanValue',
    { inputFields: t => ({ id: t.globalID({ for: 'AttributeBooleanValue', required: true }) }) },
    {
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
    { outputFields: t => ({ value: t.field({ type: 'AttributeBooleanValue', resolve: p => p.value }) }) },
  )

  // ─── date ────────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createAttributeDateValue',
    {
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true }),
        // Optional org id (same convention as createAttribute): omit/null → platform value.
        organizationId: t.globalID({ for: 'Organization' }),
        value: t.field({ type: 'DateTime', required: true }),
        externalSource: t.string(),
        externalId: t.string(),
      }),
    },
    {
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
    { outputFields: t => ({ value: t.field({ type: 'AttributeDateValue', resolve: p => p.value }) }) },
  )

  builder.relayMutationField(
    'updateAttributeDateValue',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeDateValue', required: true }),
        value: t.field({ type: 'DateTime' }),
      }),
    },
    {
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
    { outputFields: t => ({ value: t.field({ type: 'AttributeDateValue', resolve: p => p.value }) }) },
  )

  builder.relayMutationField(
    'deleteAttributeDateValue',
    { inputFields: t => ({ id: t.globalID({ for: 'AttributeDateValue', required: true }) }) },
    {
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
    { outputFields: t => ({ value: t.field({ type: 'AttributeDateValue', resolve: p => p.value }) }) },
  )

  // ─── file ────────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createAttributeFileValue',
    {
      inputFields: t => ({
        attributeId: t.globalID({ for: 'Attribute', required: true }),
        // Optional org id (same convention as createAttribute): omit/null → platform value.
        organizationId: t.globalID({ for: 'Organization' }),
        file: t.field({ type: 'FileInfoInput', required: true }),
        externalSource: t.string(),
        externalId: t.string(),
      }),
    },
    {
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
    { outputFields: t => ({ value: t.field({ type: 'AttributeFileValue', resolve: p => p.value }) }) },
  )

  builder.relayMutationField(
    'updateAttributeFileValue',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'AttributeFileValue', required: true }),
        file: t.field({ type: 'FileInfoInput' }),
      }),
    },
    {
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
    { outputFields: t => ({ value: t.field({ type: 'AttributeFileValue', resolve: p => p.value }) }) },
  )

  builder.relayMutationField(
    'deleteAttributeFileValue',
    { inputFields: t => ({ id: t.globalID({ for: 'AttributeFileValue', required: true }) }) },
    {
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
    { outputFields: t => ({ value: t.field({ type: 'AttributeFileValue', resolve: p => p.value }) }) },
  )
}
