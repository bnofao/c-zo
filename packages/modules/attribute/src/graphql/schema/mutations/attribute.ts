// Attribute module — attribute CRUD mutations.
//
// authScope tiers (all via auth's `permission` scope):
//   • create — input carries an optional `organizationId` (relay org id):
//       null  → platform attribute → permission, no org (global role)
//       set   → org attribute      → permission with org (member role)
//   • update / delete — derive the owning org from the resource id via
//     `loadAttributeOrg`, then `tierScope`:
//       undefined → unknown  → { auth: true }   (defer to NotFound 404)
//       null       → platform  → permission, no org
//       number     → org       → permission with org

import type { AttributeGraphQLSchemaBuilder } from '../..'
import { OptimisticLockError } from '@czo/kit/db'
import { Effect } from 'effect'
import { Attribute } from '../../../services'
import { attributePermission, attributeScope, decodeOrgInput } from '../../authz'
import { attributeEnumRefs } from '../enums'

export function registerAttributeMutations(builder: AttributeGraphQLSchemaBuilder): void {
  const enums = attributeEnumRefs()

  // ── createAttribute ─────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createAttribute',
    {
      inputFields: t => ({
        // Optional org id: omit / null → platform attribute (admin-only).
        organizationId: t.globalID({ for: 'Organization' }),
        name: t.string({ required: true }),
        slug: t.string(),
        type: t.field({ type: enums.AttributeType, required: true }),
        referenceEntity: t.string(),
        unit: t.field({ type: enums.AttributeUnit }),
        isRequired: t.boolean(),
        isFilterable: t.boolean(),
        externalSource: t.string(),
        externalId: t.string(),
        metadata: t.field({ type: 'JSONObject' }),
      }),
    },
    {
      errors: {
        types: [
          Attribute.AttributeSlugTaken,
          Attribute.ReferenceEntityRequired,
          Attribute.ReferenceEntityNotAllowed,
          Attribute.UnitNotAllowed,
        ],
      },
      authScopes: (_parent, args) => attributePermission('create', decodeOrgInput(args.input.organizationId)),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const organizationId = decodeOrgInput(input.organizationId)
        const attribute = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* Attribute.AttributeService
            return yield* svc.create({
              organizationId,
              name: input.name,
              slug: input.slug ?? undefined,
              type: input.type as Attribute.CreateAttributeInput['type'],
              referenceEntity: input.referenceEntity ?? null,
              unit: (input.unit ?? null) as Attribute.CreateAttributeInput['unit'],
              isRequired: input.isRequired ?? undefined,
              isFilterable: input.isFilterable ?? undefined,
              externalSource: input.externalSource ?? null,
              externalId: input.externalId ?? null,
              metadata: input.metadata,
            })
          }),
        )
        return { attribute }
      },
    },
    {
      outputFields: t => ({
        attribute: t.field({ type: 'Attribute', resolve: p => p.attribute }),
      }),
    },
  )

  // ── updateAttribute ─────────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateAttribute',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Attribute', required: true }),
        version: t.int({ required: true }),
        name: t.string(),
        unit: t.field({ type: enums.AttributeUnit }),
        isRequired: t.boolean(),
        isFilterable: t.boolean(),
        externalSource: t.string(),
        externalId: t.string(),
        metadata: t.field({ type: 'JSONObject' }),
      }),
    },
    {
      errors: { types: [Attribute.AttributeNotFound, Attribute.UnitNotAllowed, OptimisticLockError] },
      authScopes: (_parent, args, ctx) => attributeScope(ctx, Number(args.input.id.id), 'update'),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const attribute = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* Attribute.AttributeService
            return yield* svc.update(Number(input.id.id), input.version, {
              ...(input.name != null && { name: input.name }),
              ...(input.unit != null && { unit: input.unit as Attribute.UpdateAttributeInput['unit'] }),
              ...(input.isRequired != null && { isRequired: input.isRequired }),
              ...(input.isFilterable != null && { isFilterable: input.isFilterable }),
              ...(input.externalSource != null && { externalSource: input.externalSource }),
              ...(input.externalId != null && { externalId: input.externalId }),
              ...(input.metadata !== undefined && { metadata: input.metadata }),
            })
          }),
        )
        return { attribute }
      },
    },
    {
      outputFields: t => ({
        attribute: t.field({ type: 'Attribute', resolve: p => p.attribute }),
      }),
    },
  )

  // ── deleteAttribute (hard delete, cascades to all value rows) ────────────────
  builder.relayMutationField(
    'deleteAttribute',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Attribute', required: true }),
      }),
    },
    {
      errors: { types: [Attribute.AttributeNotFound] },
      authScopes: (_parent, args, ctx) => attributeScope(ctx, Number(args.input.id.id), 'delete'),
      resolve: async (_root, args, ctx) => {
        const attribute = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* Attribute.AttributeService
            return yield* svc.delete(Number(args.input.id.id))
          }),
        )
        return { attribute }
      },
    },
    {
      outputFields: t => ({
        attribute: t.field({ type: 'Attribute', resolve: p => p.attribute }),
      }),
    },
  )
}
