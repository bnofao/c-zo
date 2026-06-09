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
        organizationId: t.globalID({
          for: 'Organization',
          description: 'Owning organization; omit or null creates a platform attribute owned by no organization.',
        }),
        name: t.string({ required: true, description: 'Human-readable display name of the attribute.' }),
        slug: t.string({ description: 'URL-safe identifier, unique within the attribute\'s scope; auto-derived from the name when omitted.' }),
        type: t.field({ type: enums.AttributeType, required: true, description: 'Data type of the attribute, which determines the shape of its values.' }),
        referenceEntity: t.string({ description: 'Target entity referenced by a REFERENCE-typed attribute; required for REFERENCE and rejected otherwise.' }),
        unit: t.field({ type: enums.AttributeUnit, description: 'Measurement unit, applicable only to NUMBER-typed attributes.' }),
        isRequired: t.boolean({ description: 'Whether a value for this attribute is mandatory.' }),
        isFilterable: t.boolean({ description: 'Whether this attribute can be used as a filter facet.' }),
        externalSource: t.string({ description: 'Name of the external system this attribute was imported from.' }),
        externalId: t.string({ description: 'Identifier of this attribute in the external source system.' }),
        metadata: t.field({ type: 'JSONObject', description: 'Freeform JSON metadata associated with the attribute.' }),
      }),
    },
    {
      description: 'Creates a new attribute, either platform-wide or scoped to an organization.',
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
        attribute: t.field({ type: 'Attribute', resolve: p => p.attribute, description: 'The newly created attribute.' }),
      }),
    },
  )

  // ── updateAttribute ─────────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateAttribute',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Attribute', required: true, description: 'Global id of the attribute to update.' }),
        version: t.int({ required: true, description: 'Expected current version for optimistic-lock concurrency control.' }),
        name: t.string({ description: 'New display name; left unchanged when omitted.' }),
        unit: t.field({ type: enums.AttributeUnit, description: 'New measurement unit, applicable only to NUMBER-typed attributes; left unchanged when omitted.' }),
        isRequired: t.boolean({ description: 'New required flag; left unchanged when omitted.' }),
        isFilterable: t.boolean({ description: 'New filterable flag; left unchanged when omitted.' }),
        externalSource: t.string({ description: 'New external source name; left unchanged when omitted.' }),
        externalId: t.string({ description: 'New external source identifier; left unchanged when omitted.' }),
        metadata: t.field({ type: 'JSONObject', description: 'Replacement freeform JSON metadata; left unchanged when omitted.' }),
      }),
    },
    {
      description: 'Updates mutable fields of an existing attribute, guarded by optimistic locking.',
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
        attribute: t.field({ type: 'Attribute', resolve: p => p.attribute, description: 'The updated attribute.' }),
      }),
    },
  )

  // ── deleteAttribute (hard delete, cascades to all value rows) ────────────────
  builder.relayMutationField(
    'deleteAttribute',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Attribute', required: true, description: 'Global id of the attribute to delete.' }),
      }),
    },
    {
      description: 'Permanently deletes an attribute, cascading to all of its value rows.',
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
        attribute: t.field({ type: 'Attribute', resolve: p => p.attribute, description: 'The attribute that was deleted.' }),
      }),
    },
  )
}
