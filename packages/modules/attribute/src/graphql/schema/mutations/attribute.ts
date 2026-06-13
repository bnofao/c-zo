// Attribute module — attribute CRUD mutations.
//
// authScope tiers (all via auth's `permission` scope):
//   • createAttribute (platform, audience `admin`) — no `organizationId` input;
//       permission, no org (global role).
//   • createOrganizationAttribute (org, audience `org`) — `organizationId`
//       required; permission with that org (member role).
//   • update / delete (audiences `org` + `admin`) — derive the owning org from
//     the resource id via `loadAttributeOrg`, then `tierScope`:
//       undefined → unknown  → { auth: true }   (defer to NotFound 404)
//       null       → platform  → permission, no org
//       number     → org       → permission with org

import type { GraphQLContextMap } from '@czo/kit/graphql'
import type { AttributeGraphQLSchemaBuilder } from '../..'
import { OptimisticLockError } from '@czo/kit/db'
import { Effect } from 'effect'
import { Attribute } from '../../../services'
import { attributePermission, attributeScope, decodeOrgInput } from '../../authz'
import { attributeEnumRefs } from '../enums'
import { sg } from '../subgraphs'

/**
 * The exact type Pothos passes as `t` to a `relayMutationField`'s `inputFields`
 * callback, recovered from the builder's own signature so the shared-fields
 * helper matches without restating Pothos's internal `SchemaTypes` generics.
 * The 2nd param is a union (`InputObjectRef | options | null`); narrow to the
 * options object before recovering the `inputFields` callback's argument.
 */
type RelayInputOptions = Extract<
  Parameters<AttributeGraphQLSchemaBuilder['relayMutationField']>[1],
  { inputFields: unknown }
>
type InputFieldBuilderArg = RelayInputOptions extends { inputFields: (t: infer T) => unknown } ? T : never

/**
 * The fields shared by both create variants (everything except `organizationId`,
 * which only the org variant carries). `runCreate` accepts this shape directly.
 */
interface SharedCreateInput {
  name: string
  // `type` / `unit` arrive as the raw GraphQL enum value (Pothos types these as
  // `string | number`); `runCreate` casts them to the service's literal-union
  // types, mirroring the original code.
  type: string | number
  slug?: string | null
  referenceEntity?: string | null
  unit?: string | number | null
  isRequired?: boolean | null
  isFilterable?: boolean | null
  externalSource?: string | null
  externalId?: string | null
  metadata?: Attribute.CreateAttributeInput['metadata']
}

export function registerAttributeMutations(builder: AttributeGraphQLSchemaBuilder): void {
  const enums = attributeEnumRefs()

  const ADMIN = sg('admin')
  const ORG = sg('org')
  const BOTH = sg('org', 'admin')

  // The 9 fields shared by both create variants (everything but `organizationId`).
  // `t` is the input-field builder Pothos passes to a `relayMutationField`'s
  // `inputFields` callback; its type is captured from that very callback so the
  // spread typechecks without restating Pothos's internal generics.
  const sharedCreateFields = (t: InputFieldBuilderArg) => ({
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
  })

  // Single insertion path for both variants — the only difference is the org owner.
  const runCreate = (ctx: GraphQLContextMap, input: SharedCreateInput, organizationId: number | null) =>
    ctx.runEffect(
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

  // ── createAttribute (platform — audience `admin`) ───────────────────────────
  builder.relayMutationField(
    'createAttribute',
    {
      ...ADMIN.input,
      inputFields: t => sharedCreateFields(t),
    },
    {
      ...ADMIN.field,
      description: 'Creates a platform-wide attribute owned by no organization. Requires the global attribute:create role.',
      errors: {
        types: [
          Attribute.AttributeSlugTaken,
          Attribute.ReferenceEntityRequired,
          Attribute.ReferenceEntityNotAllowed,
          Attribute.UnitNotAllowed,
        ],
        ...ADMIN.errorOpts,
      },
      authScopes: () => attributePermission('create', null),
      resolve: async (_root, args, ctx) => ({ attribute: await runCreate(ctx, args.input, null) }),
    },
    {
      ...ADMIN.payload,
      outputFields: t => ({
        attribute: t.field({ type: 'Attribute', resolve: p => p.attribute, description: 'The newly created platform attribute.' }),
      }),
    },
  )

  // ── createOrganizationAttribute (org — audience `org`) ──────────────────────
  builder.relayMutationField(
    'createOrganizationAttribute',
    {
      ...ORG.input,
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'Owning organization of the new attribute.' }),
        ...sharedCreateFields(t),
      }),
    },
    {
      ...ORG.field,
      description: 'Creates an attribute scoped to an organization. Requires attribute:create in that organization.',
      errors: {
        types: [
          Attribute.AttributeSlugTaken,
          Attribute.ReferenceEntityRequired,
          Attribute.ReferenceEntityNotAllowed,
          Attribute.UnitNotAllowed,
        ],
        ...ORG.errorOpts,
      },
      authScopes: (_parent, args) => attributePermission('create', decodeOrgInput(args.input.organizationId)),
      resolve: async (_root, args, ctx) => ({ attribute: await runCreate(ctx, args.input, decodeOrgInput(args.input.organizationId)) }),
    },
    {
      ...ORG.payload,
      outputFields: t => ({
        attribute: t.field({ type: 'Attribute', resolve: p => p.attribute, description: 'The newly created organization attribute.' }),
      }),
    },
  )

  // ── updateAttribute ─────────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateAttribute',
    {
      ...BOTH.input,
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
      ...BOTH.field,
      description: 'Updates mutable fields of an existing attribute, guarded by optimistic locking.',
      errors: { types: [Attribute.AttributeNotFound, Attribute.UnitNotAllowed, OptimisticLockError], ...BOTH.errorOpts },
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
      ...BOTH.payload,
      outputFields: t => ({
        attribute: t.field({ type: 'Attribute', resolve: p => p.attribute, description: 'The updated attribute.' }),
      }),
    },
  )

  // ── deleteAttribute (hard delete, cascades to all value rows) ────────────────
  builder.relayMutationField(
    'deleteAttribute',
    {
      ...BOTH.input,
      inputFields: t => ({
        id: t.globalID({ for: 'Attribute', required: true, description: 'Global id of the attribute to delete.' }),
      }),
    },
    {
      ...BOTH.field,
      description: 'Permanently deletes an attribute, cascading to all of its value rows.',
      errors: { types: [Attribute.AttributeNotFound], ...BOTH.errorOpts },
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
      ...BOTH.payload,
      outputFields: t => ({
        attribute: t.field({ type: 'Attribute', resolve: p => p.attribute, description: 'The attribute that was deleted.' }),
      }),
    },
  )
}
