/* eslint-disable */
import { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** A date-time string at UTC, such as 2007-12-03T10:15:30Z, compliant with the `date-time` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar. */
  DateTime: { input: string; output: string; }
  /** The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSON: { input: unknown; output: unknown; }
  /** The `JSONObject` scalar type represents JSON objects as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSONObject: { input: Record<string, unknown>; output: Record<string, unknown>; }
};

export type AddMediaInput = {
  /** Accessibility alt text describing the media asset. */
  alt?: InputMaybe<Scalars['String']['input']>;
  /** References an Organization node. When null, the media is created as a global BASE row; when set, it is created as an organization-scoped GRAFT over the product. */
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  /** Ordering position of the media within the product gallery. */
  position?: InputMaybe<Scalars['Int']['input']>;
  /** Identifies the product the media asset is attached to. */
  productId: Scalars['Int']['input'];
  /** The kind of media asset, either IMAGE or VIDEO. */
  type?: InputMaybe<ProductMediaType>;
  /** The URL of the media asset to display. */
  url: Scalars['String']['input'];
};

export type AddMediaPayload = {
  __typename?: 'AddMediaPayload';
  /** The newly created product media asset. */
  media: ProductMedia;
};

export type AddMediaResult = AddMediaSuccess | ProductNotAdoptedError;

export type AddMediaSuccess = {
  __typename?: 'AddMediaSuccess';
  data: AddMediaPayload;
};

export type ApproveListingInput = {
  /** Global ID of the ProductChannelListing to approve. */
  listingId: Scalars['ID']['input'];
};

export type ApproveListingPayload = {
  __typename?: 'ApproveListingPayload';
  /** The approved listing. */
  listing: ProductChannelListing;
};

export type ApproveListingResult = ApproveListingSuccess | ChannelListingNotFoundError | MarketplaceCategoryNotGlobalError | NotAMarketplaceChannelError | ProductNotFoundError | ProductTypeNotGlobalError;

export type ApproveListingSuccess = {
  __typename?: 'ApproveListingSuccess';
  data: ApproveListingPayload;
};

export type ApproveTaxonomyRequestInput = {
  /** Global ID of the request to approve. */
  requestId: Scalars['ID']['input'];
};

export type ApproveTaxonomyRequestPayload = {
  __typename?: 'ApproveTaxonomyRequestPayload';
  /** The approved request. */
  request: TaxonomyRequest;
};

export type ApproveTaxonomyRequestResult = ApproveTaxonomyRequestSuccess | AttributeNotFoundError | CategoryAlreadyGlobalError | CategoryNotFoundError | CategoryParentNotGlobalError | CategorySlugTakenError | ProductTypeAlreadyGlobalError | ProductTypeNotFoundError | ProductTypeSlugTakenError | TaxonomyRequestNotFoundError | TaxonomyRequestNotPendingError;

export type ApproveTaxonomyRequestSuccess = {
  __typename?: 'ApproveTaxonomyRequestSuccess';
  data: ApproveTaxonomyRequestPayload;
};

export type AssignProductValueInput = {
  /** The attribute being assigned; it must be declared on the product's type. */
  attributeId: Scalars['Int']['input'];
  /** When null the assignment is a global BASE write; when set it is an org GRAFT scoped to this Organization, requiring a live adoption if the product is global. */
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  /** The Product node to assign the value onto. */
  productId: Scalars['ID']['input'];
  /** The value to assign: valueIds for select types, otherwise exactly one scalar member. */
  value: AssignmentValueInput;
};

export type AssignProductValuePayload = {
  __typename?: 'AssignProductValuePayload';
  /** The ids of the affected assignment pivot rows. */
  pivotIds: Array<Scalars['Int']['output']>;
};

export type AssignProductValueResult = AssignProductValueSuccess | AttributeNotAssignedToTypeError | ProductNotAdoptedError | ProductNotFoundError | ProductTypeNotFoundError | ValueKindMismatchError;

export type AssignProductValueSuccess = {
  __typename?: 'AssignProductValueSuccess';
  data: AssignProductValuePayload;
};

export type AssignVariantValueInput = {
  /** The attribute being assigned; it must be declared on the product's type. */
  attributeId: Scalars['Int']['input'];
  /** When null the assignment is a global BASE write; when set it is an org GRAFT scoped to this Organization, requiring a live adoption if the variant's product is global. */
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  /** The value to assign: valueIds for select types, otherwise exactly one scalar member. */
  value: AssignmentValueInput;
  /** The ProductVariant node to assign the value onto. */
  variantId: Scalars['ID']['input'];
};

export type AssignVariantValuePayload = {
  __typename?: 'AssignVariantValuePayload';
  /** The ids of the affected assignment pivot rows. */
  pivotIds: Array<Scalars['Int']['output']>;
};

export type AssignVariantValueResult = AssignVariantValueSuccess | AttributeNotAssignedToTypeError | ProductNotAdoptedError | ProductNotFoundError | ProductTypeNotFoundError | ValueKindMismatchError | VariantNotFoundError;

export type AssignVariantValueSuccess = {
  __typename?: 'AssignVariantValueSuccess';
  data: AssignVariantValuePayload;
};

/** An attribute assigned to an object, with its typed value(s) resolved inline. */
export type AssignedAttribute = {
  /** The attribute. */
  attribute: Attribute;
};

export type AssignedBooleanAttribute = AssignedAttribute & {
  __typename?: 'AssignedBooleanAttribute';
  /** The attribute. */
  attribute: Attribute;
  /** The boolean value. */
  value: Scalars['Boolean']['output'];
};

export type AssignedDateAttribute = AssignedAttribute & {
  __typename?: 'AssignedDateAttribute';
  /** The attribute. */
  attribute: Attribute;
  /** The date/datetime value. */
  value: Scalars['DateTime']['output'];
};

export type AssignedDropdownAttribute = AssignedAttribute & {
  __typename?: 'AssignedDropdownAttribute';
  /** The attribute. */
  attribute: Attribute;
  /** Selected dropdown/multiselect values. */
  values: Array<AttributeValue>;
};

export type AssignedFileAttribute = AssignedAttribute & {
  __typename?: 'AssignedFileAttribute';
  /** The attribute. */
  attribute: Attribute;
  /** File MIME type. */
  mimetype: Scalars['String']['output'];
  /** File URL. */
  url: Scalars['String']['output'];
};

export type AssignedNumericAttribute = AssignedAttribute & {
  __typename?: 'AssignedNumericAttribute';
  /** The attribute. */
  attribute: Attribute;
  /** The numeric value. */
  value: Scalars['Float']['output'];
};

export type AssignedReferenceAttribute = AssignedAttribute & {
  __typename?: 'AssignedReferenceAttribute';
  /** The attribute. */
  attribute: Attribute;
  /** Selected reference values. */
  values: Array<AttributeReferenceValue>;
};

export type AssignedSwatchAttribute = AssignedAttribute & {
  __typename?: 'AssignedSwatchAttribute';
  /** The attribute. */
  attribute: Attribute;
  /** Selected swatch values. */
  values: Array<AttributeSwatchValue>;
};

export type AssignedTextAttribute = AssignedAttribute & {
  __typename?: 'AssignedTextAttribute';
  /** The attribute. */
  attribute: Attribute;
  /** Plain-text value. */
  plain: Scalars['String']['output'];
  /** Optional rich-text payload. */
  rich?: Maybe<Scalars['JSONObject']['output']>;
};

/** A file attribute value: the asset URL and its MIME type. */
export type AssignmentFileValueInput = {
  /** URL of the uploaded file asset. */
  fileUrl: Scalars['String']['input'];
  /** MIME type of the file (e.g. `application/pdf`). */
  mimetype: Scalars['String']['input'];
};

export type AssignmentNotFoundError = Error & {
  __typename?: 'AssignmentNotFoundError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** A text attribute value: required plain text plus optional rich (structured JSON) content. */
export type AssignmentTextValueInput = {
  /** Plain-text representation of the value. */
  plain: Scalars['String']['input'];
  /** Optional structured rich-text payload (e.g. a document AST). */
  rich?: InputMaybe<Scalars['JSON']['input']>;
};

/** The value to assign for an attribute. Exactly one member must match the attribute's type: `valueIds` for select types, otherwise one of the scalar members. A mismatched shape is rejected as ValueKindMismatch. */
export type AssignmentValueInput = {
  /** For BOOLEAN attributes: the boolean value. */
  boolean?: InputMaybe<Scalars['Boolean']['input']>;
  /** For DATE/DATETIME attributes: the date value. */
  date?: InputMaybe<Scalars['DateTime']['input']>;
  /** For FILE attributes: the file value. */
  file?: InputMaybe<AssignmentFileValueInput>;
  /** For NUMBER attributes: the numeric value. */
  numeric?: InputMaybe<Scalars['Float']['input']>;
  /** For TEXT attributes: the text value. */
  text?: InputMaybe<AssignmentTextValueInput>;
  /** For select attributes (DROPDOWN/MULTISELECT/SWATCH/REFERENCE): the chosen catalog value id(s). */
  valueIds?: InputMaybe<Array<Scalars['Int']['input']>>;
};

/** A typed descriptor that products and variants can carry values for. PLATFORM (organizationId null, platform-admin-managed) or ORG-OWNED. Choice types expose one of the values/swatchValues/referenceValues connections (per `type`); non-choice types hold a single typed value resolved elsewhere. */
export type Attribute = Node & {
  __typename?: 'Attribute';
  /** Timestamp when this row was created. */
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** Whether this attribute may be used as a storefront/listing filter facet. */
  isFilterable: Scalars['Boolean']['output'];
  /** Whether a value for this attribute is mandatory on the entities that carry it. */
  isRequired: Scalars['Boolean']['output'];
  /** Freeform JSON metadata attached to the attribute. */
  metadata?: Maybe<Scalars['JSONObject']['output']>;
  /** Human-readable attribute name. */
  name: Scalars['String']['output'];
  /** Owning organization, or null for a PLATFORM (global) attribute. */
  organizationId?: Maybe<Scalars['Int']['output']>;
  /** For REFERENCE attributes, the name of the entity its values point at; null otherwise. */
  referenceEntity?: Maybe<Scalars['String']['output']>;
  /** Catalog values for a REFERENCE attribute (ordered by position); empty for other types. */
  referenceValues: AttributeReferenceValuesConnection;
  /** URL-safe slug, unique within the attribute's scope. */
  slug: Scalars['String']['output'];
  /** Catalog values for a SWATCH attribute (ordered by position); empty for other types. */
  swatchValues: AttributeSwatchValuesConnection;
  /** The attribute's type, which fixes how its value(s) are stored and which value connection is populated. */
  type: AttributeType;
  /** For NUMBER attributes, the unit of measure; null otherwise. */
  unit?: Maybe<AttributeUnit>;
  /** Timestamp when this row was last updated. */
  updatedAt: Scalars['DateTime']['output'];
  /** Catalog values for a DROPDOWN/MULTISELECT attribute (ordered by position); empty for other types. */
  values: AttributeValuesConnection;
  /** Optimistic-lock version, incremented on each update. */
  version: Scalars['Int']['output'];
};


/** A typed descriptor that products and variants can carry values for. PLATFORM (organizationId null, platform-admin-managed) or ORG-OWNED. Choice types expose one of the values/swatchValues/referenceValues connections (per `type`); non-choice types hold a single typed value resolved elsewhere. */
export type AttributeReferenceValuesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  organizationId?: InputMaybe<Scalars['ID']['input']>;
};


/** A typed descriptor that products and variants can carry values for. PLATFORM (organizationId null, platform-admin-managed) or ORG-OWNED. Choice types expose one of the values/swatchValues/referenceValues connections (per `type`); non-choice types hold a single typed value resolved elsewhere. */
export type AttributeSwatchValuesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  organizationId?: InputMaybe<Scalars['ID']['input']>;
};


/** A typed descriptor that products and variants can carry values for. PLATFORM (organizationId null, platform-admin-managed) or ORG-OWNED. Choice types expose one of the values/swatchValues/referenceValues connections (per `type`); non-choice types hold a single typed value resolved elsewhere. */
export type AttributeValuesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  organizationId?: InputMaybe<Scalars['ID']['input']>;
};

/** The single value of a BOOLEAN attribute. */
export type AttributeBooleanValue = Node & {
  __typename?: 'AttributeBooleanValue';
  /** Timestamp when this row was created. */
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** Timestamp when this row was last updated. */
  updatedAt: Scalars['DateTime']['output'];
  /** The boolean value. */
  value: Scalars['Boolean']['output'];
};

/** The single value of a DATE or DATETIME attribute. */
export type AttributeDateValue = Node & {
  __typename?: 'AttributeDateValue';
  /** Timestamp when this row was created. */
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** Timestamp when this row was last updated. */
  updatedAt: Scalars['DateTime']['output'];
  /** The date/time value. */
  value: Scalars['DateTime']['output'];
};

/** The single value of a FILE attribute: the stored file reference. */
export type AttributeFileValue = Node & {
  __typename?: 'AttributeFileValue';
  /** Timestamp when this row was created. */
  createdAt: Scalars['DateTime']['output'];
  /** The stored file (URL + MIME type). */
  file: FileInfo;
  id: Scalars['ID']['output'];
  /** Timestamp when this row was last updated. */
  updatedAt: Scalars['DateTime']['output'];
};

export type AttributeNotAssignedToTypeError = Error & {
  __typename?: 'AttributeNotAssignedToTypeError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type AttributeNotFoundError = Error & {
  __typename?: 'AttributeNotFoundError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** The single value of a NUMBER attribute (interpreted in the attribute's unit, when set). */
export type AttributeNumericValue = Node & {
  __typename?: 'AttributeNumericValue';
  /** Timestamp when this row was created. */
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** Timestamp when this row was last updated. */
  updatedAt: Scalars['DateTime']['output'];
  /** The numeric value. */
  value: Scalars['Float']['output'];
};

/** One ordering clause for the `attributes` connection (field + direction). Multiple clauses are applied in order. */
export type AttributeOrderByInput = {
  /** Ascending or descending. */
  direction: AttributeOrderDirection;
  /** The attribute field to sort by. */
  field: AttributeOrderField;
};

/** Sort direction: ascending or descending. */
export enum AttributeOrderDirection {
  Asc = 'ASC',
  Desc = 'DESC'
}

/** A field the `attributes` connection can be ordered by. */
export enum AttributeOrderField {
  CreatedAt = 'CREATED_AT',
  Name = 'NAME',
  Slug = 'SLUG',
  UpdatedAt = 'UPDATED_AT'
}

export type AttributeParentNotOwnedError = Error & {
  __typename?: 'AttributeParentNotOwnedError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** A catalog value of a REFERENCE attribute: a label pointing at another entity by id. */
export type AttributeReferenceValue = Node & {
  __typename?: 'AttributeReferenceValue';
  /** Timestamp when this row was created. */
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** Sort order among the attribute's reference values. */
  position: Scalars['Int']['output'];
  /** Id of the referenced entity (interpreted per the attribute's referenceEntity). */
  referenceId: Scalars['Int']['output'];
  /** URL-safe slug, unique within the attribute and scope. */
  slug: Scalars['String']['output'];
  /** Timestamp when this row was last updated. */
  updatedAt: Scalars['DateTime']['output'];
  /** Human-readable label of the reference. */
  value: Scalars['String']['output'];
};

export type AttributeReferenceValuesConnection = {
  __typename?: 'AttributeReferenceValuesConnection';
  edges: Array<AttributeReferenceValuesConnectionEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type AttributeReferenceValuesConnectionEdge = {
  __typename?: 'AttributeReferenceValuesConnectionEdge';
  cursor: Scalars['String']['output'];
  node: AttributeReferenceValue;
};

export type AttributeSlugTakenError = Error & {
  __typename?: 'AttributeSlugTakenError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  slug: Scalars['String']['output'];
};

/** A catalog value of a SWATCH attribute: a label plus an optional color and/or image file. */
export type AttributeSwatchValue = Node & {
  __typename?: 'AttributeSwatchValue';
  /** Optional color (e.g. a hex code) representing the swatch. */
  color?: Maybe<Scalars['String']['output']>;
  /** Timestamp when this row was created. */
  createdAt: Scalars['DateTime']['output'];
  /** Optional image file backing the swatch; null when none is stored. */
  file?: Maybe<FileInfo>;
  id: Scalars['ID']['output'];
  /** Sort order among the attribute's swatch values. */
  position: Scalars['Int']['output'];
  /** URL-safe slug, unique within the attribute and scope. */
  slug: Scalars['String']['output'];
  /** Timestamp when this row was last updated. */
  updatedAt: Scalars['DateTime']['output'];
  /** Human-readable label of the swatch. */
  value: Scalars['String']['output'];
};

export type AttributeSwatchValuesConnection = {
  __typename?: 'AttributeSwatchValuesConnection';
  edges: Array<AttributeSwatchValuesConnectionEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type AttributeSwatchValuesConnectionEdge = {
  __typename?: 'AttributeSwatchValuesConnectionEdge';
  cursor: Scalars['String']['output'];
  node: AttributeSwatchValue;
};

/** The single value of a TEXT attribute: plain text plus optional structured rich content. */
export type AttributeTextValue = Node & {
  __typename?: 'AttributeTextValue';
  /** Timestamp when this row was created. */
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** Plain-text representation of the value. */
  plain: Scalars['String']['output'];
  /** Optional structured rich-text payload (e.g. a document AST); null when unset. */
  rich?: Maybe<Scalars['JSONObject']['output']>;
  /** Timestamp when this row was last updated. */
  updatedAt: Scalars['DateTime']['output'];
};

/** The kind of an attribute. Choice types (DROPDOWN, MULTISELECT, SWATCH, REFERENCE) carry a list of catalog values; the rest (TEXT, NUMBER, BOOLEAN, DATE, DATETIME, FILE) carry a single typed value. */
export enum AttributeType {
  Boolean = 'BOOLEAN',
  Date = 'DATE',
  DateTime = 'DATE_TIME',
  Dropdown = 'DROPDOWN',
  File = 'FILE',
  Multiselect = 'MULTISELECT',
  Numeric = 'NUMERIC',
  PlainText = 'PLAIN_TEXT',
  Reference = 'REFERENCE',
  RichText = 'RICH_TEXT',
  Swatch = 'SWATCH'
}

/** Filter attributes by their type (AttributeType enum). */
export type AttributeTypeFilterInput = {
  /** Match attributes whose type equals this value. */
  eq?: InputMaybe<AttributeType>;
  /** Match attributes whose type is any of these values. */
  in?: InputMaybe<Array<AttributeType>>;
  /** Match attributes whose type differs from this value. */
  ne?: InputMaybe<AttributeType>;
};

/** The unit of measure for a NUMBER attribute (e.g. weight, length, volume); null for non-numeric attributes. */
export enum AttributeUnit {
  Centimeter = 'CENTIMETER',
  Foot = 'FOOT',
  Gallon = 'GALLON',
  Gram = 'GRAM',
  Inch = 'INCH',
  Kilogram = 'KILOGRAM',
  Liter = 'LITER',
  Meter = 'METER',
  Milliliter = 'MILLILITER',
  Millimeter = 'MILLIMETER',
  Ounce = 'OUNCE',
  Percent = 'PERCENT',
  Piece = 'PIECE',
  Pound = 'POUND',
  SquareCentimeter = 'SQUARE_CENTIMETER',
  SquareMeter = 'SQUARE_METER'
}

/** Filter attributes by their unit (AttributeUnit enum). */
export type AttributeUnitFilterInput = {
  /** Match attributes whose unit equals this value. */
  eq?: InputMaybe<AttributeUnit>;
  /** Match attributes whose unit is any of these values. */
  in?: InputMaybe<Array<AttributeUnit>>;
  /** Match attributes whose unit differs from this value. */
  ne?: InputMaybe<AttributeUnit>;
};

/** A catalog value of a DROPDOWN or MULTISELECT attribute. */
export type AttributeValue = Node & {
  __typename?: 'AttributeValue';
  /** Timestamp when this row was created. */
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** Sort order among the attribute's values. */
  position: Scalars['Int']['output'];
  /** URL-safe slug, unique within the attribute and scope. */
  slug: Scalars['String']['output'];
  /** Timestamp when this row was last updated. */
  updatedAt: Scalars['DateTime']['output'];
  /** Human-readable label of the value. */
  value: Scalars['String']['output'];
};

export type AttributeValueNotFoundError = Error & {
  __typename?: 'AttributeValueNotFoundError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type AttributeValueSlugTakenError = Error & {
  __typename?: 'AttributeValueSlugTakenError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  slug: Scalars['String']['output'];
};

export type AttributeValuesConnection = {
  __typename?: 'AttributeValuesConnection';
  edges: Array<AttributeValuesConnectionEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type AttributeValuesConnectionEdge = {
  __typename?: 'AttributeValuesConnectionEdge';
  cursor: Scalars['String']['output'];
  node: AttributeValue;
};

/** Filter predicate for the `attributes` connection. Field filters are AND-combined; use the AND/OR/NOT members to compose arbitrary boolean trees. */
export type AttributeWhereInput = {
  /** All sub-predicates must match. */
  AND?: InputMaybe<Array<AttributeWhereInput>>;
  /** The sub-predicate must not match. */
  NOT?: InputMaybe<AttributeWhereInput>;
  /** At least one sub-predicate must match. */
  OR?: InputMaybe<Array<AttributeWhereInput>>;
  /** Filter by creation timestamp. */
  createdAt?: InputMaybe<DateTimeFilterInput>;
  /** Filter by the isFilterable flag. */
  isFilterable?: InputMaybe<BooleanFilterInput>;
  /** Filter by the isRequired flag. */
  isRequired?: InputMaybe<BooleanFilterInput>;
  /** Filter by attribute name. */
  name?: InputMaybe<StringFilterInput>;
  /** Filter by the referenced entity name (REFERENCE attributes). */
  referenceEntity?: InputMaybe<StringFilterInput>;
  /** Filter by attribute slug. */
  slug?: InputMaybe<StringFilterInput>;
  /** Filter by attribute type. */
  type?: InputMaybe<AttributeTypeFilterInput>;
  /** Filter by attribute unit. */
  unit?: InputMaybe<AttributeUnitFilterInput>;
  /** Filter by last-update timestamp. */
  updatedAt?: InputMaybe<DateTimeFilterInput>;
};

export type BanUserInput = {
  /** Duration, in seconds, after which the ban expires; omit for a permanent ban. */
  expiresIn?: InputMaybe<Scalars['Int']['input']>;
  /** Global ID of the user to ban. */
  id: Scalars['ID']['input'];
  /** Reason recorded for the ban. */
  reason?: InputMaybe<Scalars['String']['input']>;
};

export type BanUserPayload = {
  __typename?: 'BanUserPayload';
  /** The banned user. */
  user: User;
};

export type BanUserResult = BanUserSuccess | CannotBanSelfError | ForbiddenError | UserAlreadyBannedError | UserNotFoundError;

export type BanUserSuccess = {
  __typename?: 'BanUserSuccess';
  data: BanUserPayload;
};

export type BooleanFilterInput = {
  AND?: InputMaybe<Array<BooleanFilterInput>>;
  NOT?: InputMaybe<BooleanFilterInput>;
  OR?: InputMaybe<Array<BooleanFilterInput>>;
  eq?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CannotBanSelfError = Error & {
  __typename?: 'CannotBanSelfError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type CannotChainImpersonationError = Error & {
  __typename?: 'CannotChainImpersonationError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type CannotDemoteSelfError = Error & {
  __typename?: 'CannotDemoteSelfError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type CannotImpersonateAdminError = Error & {
  __typename?: 'CannotImpersonateAdminError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type CannotImpersonateBannedUserError = Error & {
  __typename?: 'CannotImpersonateBannedUserError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type CannotImpersonateSelfError = Error & {
  __typename?: 'CannotImpersonateSelfError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type CannotRemoveSelfError = Error & {
  __typename?: 'CannotRemoveSelfError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** A node in the category tree. Categories are either global (organizationId null) or owned by a single organization, nest via a self parent/children relation, and group products through many-to-many placements. */
export type Category = Node & {
  __typename?: 'Category';
  /** Direct child categories, excluding soft-deleted ones, ordered by their sibling position. */
  children: CategoryChildrenConnection;
  /** Timestamp at which the category was created. */
  createdAt: Scalars['DateTime']['output'];
  /** Optional descriptive text for the category, resolved for the requested locale and falling back to the base value. */
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  /** Display name of the category, resolved for the requested locale and falling back to the base value. */
  name: Scalars['String']['output'];
  /** The owning organization, or null when the category is global and shared across all organizations. */
  organizationId?: Maybe<Scalars['Int']['output']>;
  /** The parent category in the tree, or null when this is a root category. */
  parent?: Maybe<Category>;
  /** Sort order of this category among its siblings under the same parent. */
  position: Scalars['Int']['output'];
  /** Product placements that assign products to this category. */
  products: CategoryProductsConnection;
  /** URL-friendly identifier for the category, unique within its owning scope. */
  slug: Scalars['String']['output'];
  /** Timestamp of the most recent update to the category. */
  updatedAt: Scalars['DateTime']['output'];
  /** Optimistic-locking version, incremented on each update to detect concurrent writes. */
  version: Scalars['Int']['output'];
};


/** A node in the category tree. Categories are either global (organizationId null) or owned by a single organization, nest via a self parent/children relation, and group products through many-to-many placements. */
export type CategoryChildrenArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


/** A node in the category tree. Categories are either global (organizationId null) or owned by a single organization, nest via a self parent/children relation, and group products through many-to-many placements. */
export type CategoryDescriptionArgs = {
  locale?: InputMaybe<Scalars['String']['input']>;
};


/** A node in the category tree. Categories are either global (organizationId null) or owned by a single organization, nest via a self parent/children relation, and group products through many-to-many placements. */
export type CategoryNameArgs = {
  locale?: InputMaybe<Scalars['String']['input']>;
};


/** A node in the category tree. Categories are either global (organizationId null) or owned by a single organization, nest via a self parent/children relation, and group products through many-to-many placements. */
export type CategoryProductsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};

export type CategoryAlreadyGlobalError = Error & {
  __typename?: 'CategoryAlreadyGlobalError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type CategoryChildrenConnection = {
  __typename?: 'CategoryChildrenConnection';
  edges: Array<CategoryChildrenConnectionEdge>;
  pageInfo: PageInfo;
};

export type CategoryChildrenConnectionEdge = {
  __typename?: 'CategoryChildrenConnectionEdge';
  cursor: Scalars['String']['output'];
  node: Category;
};

export type CategoryCycleError = Error & {
  __typename?: 'CategoryCycleError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type CategoryNotFoundError = Error & {
  __typename?: 'CategoryNotFoundError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** One ordering clause for the `categories` connection (field + direction). Multiple clauses are applied in order. */
export type CategoryOrderByInput = {
  /** Ascending or descending. */
  direction: CategoryOrderDirection;
  /** The category field to sort by. */
  field: CategoryOrderField;
};

/** Sort direction: ascending or descending. */
export enum CategoryOrderDirection {
  Asc = 'ASC',
  Desc = 'DESC'
}

/** A field the `categories` connection can be ordered by. */
export enum CategoryOrderField {
  CreatedAt = 'CREATED_AT',
  Name = 'NAME',
  Position = 'POSITION'
}

export type CategoryParentNotGlobalError = Error & {
  __typename?: 'CategoryParentNotGlobalError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type CategoryProductsConnection = {
  __typename?: 'CategoryProductsConnection';
  edges: Array<CategoryProductsConnectionEdge>;
  pageInfo: PageInfo;
};

export type CategoryProductsConnectionEdge = {
  __typename?: 'CategoryProductsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: ProductCategory;
};

export type CategorySlugTakenError = Error & {
  __typename?: 'CategorySlugTakenError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** Filter predicate for the `categories` connection. Field filters are AND-combined; use AND/OR/NOT to compose arbitrary boolean trees. */
export type CategoryWhereInput = {
  /** All sub-predicates must match. */
  AND?: InputMaybe<Array<CategoryWhereInput>>;
  /** The sub-predicate must not match. */
  NOT?: InputMaybe<CategoryWhereInput>;
  /** At least one sub-predicate must match. */
  OR?: InputMaybe<Array<CategoryWhereInput>>;
  /** Filter by the parent category id. */
  parentId?: InputMaybe<IntFilterInput>;
};

/** An organization-scoped sales channel — a storefront or market through which products are sold and published. Links to the stock locations that fulfil it. */
export type Channel = Node & {
  __typename?: 'Channel';
  /** Timestamp when the channel was created. */
  createdAt: Scalars['DateTime']['output'];
  /** Optional freeform description of the channel. */
  description?: Maybe<Scalars['String']['output']>;
  /** URL-safe handle, unique within the owning organization. */
  handle: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** Whether the channel is currently active (available for selling). */
  isActive: Scalars['Boolean']['output'];
  /** Whether this is the organization's default sales channel. */
  isDefault: Scalars['Boolean']['output'];
  /** Freeform JSON metadata attached to the channel. */
  metadata?: Maybe<Scalars['JSONObject']['output']>;
  /** Human-readable channel name. */
  name: Scalars['String']['output'];
  /** Timestamp when the channel was last updated. */
  updatedAt: Scalars['DateTime']['output'];
  /** Optimistic-lock version, incremented on each update. */
  version: Scalars['Int']['output'];
};

export type ChannelHandleTakenError = Error & {
  __typename?: 'ChannelHandleTakenError';
  code: Scalars['String']['output'];
  handle: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type ChannelListingNotFoundError = Error & {
  __typename?: 'ChannelListingNotFoundError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type ChannelNotFoundError = Error & {
  __typename?: 'ChannelNotFoundError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** One ordering clause for the `channels` connection (field + direction). Multiple clauses are applied in order. */
export type ChannelOrderByInput = {
  /** Ascending or descending. */
  direction: ChannelOrderDirection;
  /** The channel field to sort by. */
  field: ChannelOrderField;
};

/** Sort direction: ascending or descending. */
export enum ChannelOrderDirection {
  Asc = 'ASC',
  Desc = 'DESC'
}

/** A field the `channels` connection can be ordered by. */
export enum ChannelOrderField {
  CreatedAt = 'CREATED_AT',
  Handle = 'HANDLE',
  Name = 'NAME'
}

/** Filter predicate for the `channels` connection. Field filters are AND-combined; use AND/OR/NOT to compose arbitrary boolean trees. */
export type ChannelWhereInput = {
  /** All sub-predicates must match. */
  AND?: InputMaybe<Array<ChannelWhereInput>>;
  /** The sub-predicate must not match. */
  NOT?: InputMaybe<ChannelWhereInput>;
  /** At least one sub-predicate must match. */
  OR?: InputMaybe<Array<ChannelWhereInput>>;
  /** Filter by creation timestamp. */
  createdAt?: InputMaybe<DateTimeFilterInput>;
  /** Filter by channel handle. */
  handle?: InputMaybe<StringFilterInput>;
  /** Filter by active state. */
  isActive?: InputMaybe<BooleanFilterInput>;
  /** Filter by default-channel flag. */
  isDefault?: InputMaybe<BooleanFilterInput>;
  /** Filter by channel name. */
  name?: InputMaybe<StringFilterInput>;
  /** Filter by owning organization id. */
  organizationId?: InputMaybe<IntFilterInput>;
};

/** A curated, organization-scoped grouping of products, related to its members many-to-many. Collections exist only at the organization tier; there is no global collection. */
export type Collection = Node & {
  __typename?: 'Collection';
  /** Timestamp at which the collection was created. */
  createdAt: Scalars['DateTime']['output'];
  /** Free-form summary of the collection, returned in the requested locale when a translation exists, otherwise the base value. */
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  /** Display name of the collection, returned in the requested locale when a translation exists, otherwise the base value. */
  name: Scalars['String']['output'];
  /** Identifier of the organization that owns this collection. */
  organizationId: Scalars['Int']['output'];
  /** Products that belong to this collection, paginated as a Relay connection. */
  products: CollectionProductsConnection;
  /** URL-friendly identifier, unique within the owning organization. */
  slug: Scalars['String']['output'];
  /** Timestamp at which the collection was last modified. */
  updatedAt: Scalars['DateTime']['output'];
  /** Optimistic-lock counter that increments on every update. */
  version: Scalars['Int']['output'];
};


/** A curated, organization-scoped grouping of products, related to its members many-to-many. Collections exist only at the organization tier; there is no global collection. */
export type CollectionDescriptionArgs = {
  locale?: InputMaybe<Scalars['String']['input']>;
};


/** A curated, organization-scoped grouping of products, related to its members many-to-many. Collections exist only at the organization tier; there is no global collection. */
export type CollectionNameArgs = {
  locale?: InputMaybe<Scalars['String']['input']>;
};


/** A curated, organization-scoped grouping of products, related to its members many-to-many. Collections exist only at the organization tier; there is no global collection. */
export type CollectionProductsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};

/** One ordering clause for the `collections` connection (field + direction). Multiple clauses are applied in order. */
export type CollectionOrderByInput = {
  /** Ascending or descending. */
  direction: CollectionOrderDirection;
  /** The collection field to sort by. */
  field: CollectionOrderField;
};

/** Sort direction: ascending or descending. */
export enum CollectionOrderDirection {
  Asc = 'ASC',
  Desc = 'DESC'
}

/** A field the `collections` connection can be ordered by. */
export enum CollectionOrderField {
  CreatedAt = 'CREATED_AT',
  Name = 'NAME'
}

/** A link row recording that a product belongs to a collection. */
export type CollectionProduct = Node & {
  __typename?: 'CollectionProduct';
  /** The collection the product is a member of. */
  collectionId: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  /** The product that is a member of the collection. */
  productId: Scalars['Int']['output'];
};

export type CollectionProductsConnection = {
  __typename?: 'CollectionProductsConnection';
  edges: Array<CollectionProductsConnectionEdge>;
  pageInfo: PageInfo;
};

export type CollectionProductsConnectionEdge = {
  __typename?: 'CollectionProductsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: CollectionProduct;
};

export type CreateAttributeBooleanValueInput = {
  /** The BOOLEAN attribute to set the value on. */
  attributeId: Scalars['ID']['input'];
  /** Optional identifier of this value within its external source. */
  externalId?: InputMaybe<Scalars['String']['input']>;
  /** Optional identifier of the external system this value originates from. */
  externalSource?: InputMaybe<Scalars['String']['input']>;
  /** Organization that owns the value; omit or null to create a platform-scoped value (requires the global role). */
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  /** The boolean value to store. */
  value: Scalars['Boolean']['input'];
};

export type CreateAttributeBooleanValuePayload = {
  __typename?: 'CreateAttributeBooleanValuePayload';
  /** The newly created boolean value. */
  value: AttributeBooleanValue;
};

export type CreateAttributeBooleanValueResult = AttributeParentNotOwnedError | CreateAttributeBooleanValueSuccess;

export type CreateAttributeBooleanValueSuccess = {
  __typename?: 'CreateAttributeBooleanValueSuccess';
  data: CreateAttributeBooleanValuePayload;
};

export type CreateAttributeDateValueInput = {
  /** The DATE or DATETIME attribute to set the value on. */
  attributeId: Scalars['ID']['input'];
  /** Optional identifier of this value within its external source. */
  externalId?: InputMaybe<Scalars['String']['input']>;
  /** Optional identifier of the external system this value originates from. */
  externalSource?: InputMaybe<Scalars['String']['input']>;
  /** Organization that owns the value; omit or null to create a platform-scoped value (requires the global role). */
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  /** The date/time value to store. */
  value: Scalars['DateTime']['input'];
};

export type CreateAttributeDateValuePayload = {
  __typename?: 'CreateAttributeDateValuePayload';
  /** The newly created date value. */
  value: AttributeDateValue;
};

export type CreateAttributeDateValueResult = AttributeParentNotOwnedError | CreateAttributeDateValueSuccess;

export type CreateAttributeDateValueSuccess = {
  __typename?: 'CreateAttributeDateValueSuccess';
  data: CreateAttributeDateValuePayload;
};

export type CreateAttributeFileValueInput = {
  /** The FILE attribute to set the value on. */
  attributeId: Scalars['ID']['input'];
  /** Optional identifier of this value within its external source. */
  externalId?: InputMaybe<Scalars['String']['input']>;
  /** Optional identifier of the external system this value originates from. */
  externalSource?: InputMaybe<Scalars['String']['input']>;
  /** The file to store, given as its URL and MIME type. */
  file: FileInfoInput;
  /** Organization that owns the value; omit or null to create a platform-scoped value (requires the global role). */
  organizationId?: InputMaybe<Scalars['ID']['input']>;
};

export type CreateAttributeFileValuePayload = {
  __typename?: 'CreateAttributeFileValuePayload';
  /** The newly created file value. */
  value: AttributeFileValue;
};

export type CreateAttributeFileValueResult = AttributeParentNotOwnedError | CreateAttributeFileValueSuccess;

export type CreateAttributeFileValueSuccess = {
  __typename?: 'CreateAttributeFileValueSuccess';
  data: CreateAttributeFileValuePayload;
};

export type CreateAttributeInput = {
  /** Identifier of this attribute in the external source system. */
  externalId?: InputMaybe<Scalars['String']['input']>;
  /** Name of the external system this attribute was imported from. */
  externalSource?: InputMaybe<Scalars['String']['input']>;
  /** Whether this attribute can be used as a filter facet. */
  isFilterable?: InputMaybe<Scalars['Boolean']['input']>;
  /** Whether a value for this attribute is mandatory. */
  isRequired?: InputMaybe<Scalars['Boolean']['input']>;
  /** Freeform JSON metadata associated with the attribute. */
  metadata?: InputMaybe<Scalars['JSONObject']['input']>;
  /** Human-readable display name of the attribute. */
  name: Scalars['String']['input'];
  /** Target entity referenced by a REFERENCE-typed attribute; required for REFERENCE and rejected otherwise. */
  referenceEntity?: InputMaybe<Scalars['String']['input']>;
  /** URL-safe identifier, unique within the attribute's scope; auto-derived from the name when omitted. */
  slug?: InputMaybe<Scalars['String']['input']>;
  /** Data type of the attribute, which determines the shape of its values. */
  type: AttributeType;
  /** Measurement unit, applicable only to NUMBER-typed attributes. */
  unit?: InputMaybe<AttributeUnit>;
};

export type CreateAttributeNumericValueInput = {
  /** The NUMBER attribute to set the value on. */
  attributeId: Scalars['ID']['input'];
  /** Optional identifier of this value within its external source. */
  externalId?: InputMaybe<Scalars['String']['input']>;
  /** Optional identifier of the external system this value originates from. */
  externalSource?: InputMaybe<Scalars['String']['input']>;
  /** Organization that owns the value; omit or null to create a platform-scoped value (requires the global role). */
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  /** The numeric value to store. */
  value: Scalars['Float']['input'];
};

export type CreateAttributeNumericValuePayload = {
  __typename?: 'CreateAttributeNumericValuePayload';
  /** The newly created numeric value. */
  value: AttributeNumericValue;
};

export type CreateAttributeNumericValueResult = AttributeParentNotOwnedError | CreateAttributeNumericValueSuccess;

export type CreateAttributeNumericValueSuccess = {
  __typename?: 'CreateAttributeNumericValueSuccess';
  data: CreateAttributeNumericValuePayload;
};

export type CreateAttributePayload = {
  __typename?: 'CreateAttributePayload';
  /** The newly created platform attribute. */
  attribute: Attribute;
};

export type CreateAttributeReferenceInput = {
  /** The REFERENCE attribute that owns the new reference value. */
  attributeId: Scalars['ID']['input'];
  /** Owning organization; omit or null to create a platform-scoped reference. */
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  /** Sort order of the value among its siblings; appended last when omitted. */
  position?: InputMaybe<Scalars['Int']['input']>;
  /** Identifier of the entity this value points at. */
  referenceId: Scalars['Int']['input'];
  /** URL-friendly identifier, unique within the attribute and scope; auto-derived from the value when omitted. */
  slug?: InputMaybe<Scalars['String']['input']>;
  /** The displayed text of the reference value. */
  value: Scalars['String']['input'];
};

export type CreateAttributeReferencePayload = {
  __typename?: 'CreateAttributeReferencePayload';
  /** The newly created reference value. */
  value: AttributeReferenceValue;
};

export type CreateAttributeReferenceResult = AttributeParentNotOwnedError | AttributeValueSlugTakenError | CreateAttributeReferenceSuccess;

export type CreateAttributeReferenceSuccess = {
  __typename?: 'CreateAttributeReferenceSuccess';
  data: CreateAttributeReferencePayload;
};

export type CreateAttributeResult = AttributeSlugTakenError | CreateAttributeSuccess | ReferenceEntityNotAllowedError | ReferenceEntityRequiredError | UnitNotAllowedError;

export type CreateAttributeSuccess = {
  __typename?: 'CreateAttributeSuccess';
  data: CreateAttributePayload;
};

export type CreateAttributeSwatchInput = {
  /** The SWATCH attribute that owns the new swatch value. */
  attributeId: Scalars['ID']['input'];
  /** Hex color of the swatch; either this or a file must be supplied. */
  color?: InputMaybe<Scalars['String']['input']>;
  /** Image file backing the swatch; either this or a color must be supplied. */
  file?: InputMaybe<FileInfoInput>;
  /** Owning organization; omit or null to create a platform-scoped swatch. */
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  /** Sort order of the swatch among its siblings; appended last when omitted. */
  position?: InputMaybe<Scalars['Int']['input']>;
  /** URL-friendly identifier, unique within the attribute and scope; auto-derived from the value when omitted. */
  slug?: InputMaybe<Scalars['String']['input']>;
  /** The displayed text of the swatch value. */
  value: Scalars['String']['input'];
};

export type CreateAttributeSwatchPayload = {
  __typename?: 'CreateAttributeSwatchPayload';
  /** The newly created swatch value. */
  value: AttributeSwatchValue;
};

export type CreateAttributeSwatchResult = AttributeParentNotOwnedError | AttributeValueSlugTakenError | CreateAttributeSwatchSuccess | SwatchRequiresColorOrFileError | SwatchVisualInvalidError;

export type CreateAttributeSwatchSuccess = {
  __typename?: 'CreateAttributeSwatchSuccess';
  data: CreateAttributeSwatchPayload;
};

export type CreateAttributeTextValueInput = {
  /** The TEXT attribute to set the value on. */
  attributeId: Scalars['ID']['input'];
  /** Optional identifier of this value within its external source. */
  externalId?: InputMaybe<Scalars['String']['input']>;
  /** Optional identifier of the external system this value originates from. */
  externalSource?: InputMaybe<Scalars['String']['input']>;
  /** Organization that owns the value; omit or null to create a platform-scoped value (requires the global role). */
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  /** The plain-text representation of the value. */
  plain: Scalars['String']['input'];
  /** Optional rich-text representation stored as a JSON document. */
  rich?: InputMaybe<Scalars['JSONObject']['input']>;
};

export type CreateAttributeTextValuePayload = {
  __typename?: 'CreateAttributeTextValuePayload';
  /** The newly created text value. */
  value: AttributeTextValue;
};

export type CreateAttributeTextValueResult = AttributeParentNotOwnedError | CreateAttributeTextValueSuccess;

export type CreateAttributeTextValueSuccess = {
  __typename?: 'CreateAttributeTextValueSuccess';
  data: CreateAttributeTextValuePayload;
};

export type CreateAttributeValueInput = {
  /** The DROPDOWN or MULTISELECT attribute that owns the new choice value. */
  attributeId: Scalars['ID']['input'];
  /** Owning organization; omit or null to create a platform-scoped value. */
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  /** Sort order of the value among its siblings; appended last when omitted. */
  position?: InputMaybe<Scalars['Int']['input']>;
  /** URL-friendly identifier, unique within the attribute and scope; auto-derived from the value when omitted. */
  slug?: InputMaybe<Scalars['String']['input']>;
  /** The displayed text of the choice value. */
  value: Scalars['String']['input'];
};

export type CreateAttributeValuePayload = {
  __typename?: 'CreateAttributeValuePayload';
  /** The newly created choice value. */
  value: AttributeValue;
};

export type CreateAttributeValueResult = AttributeParentNotOwnedError | AttributeValueSlugTakenError | CreateAttributeValueSuccess;

export type CreateAttributeValueSuccess = {
  __typename?: 'CreateAttributeValueSuccess';
  data: CreateAttributeValuePayload;
};

export type CreateCategoryInput = {
  /** An optional long-form description of the category. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** The display name of the category. */
  name: Scalars['String']['input'];
  /** The id of the parent category in the tree; omit to create the category at the root. */
  parentId?: InputMaybe<Scalars['Int']['input']>;
  /** The ordering position among sibling categories. */
  position?: InputMaybe<Scalars['Int']['input']>;
  /** The URL-friendly identifier, unique within the category's scope. */
  slug: Scalars['String']['input'];
};

export type CreateCategoryPayload = {
  __typename?: 'CreateCategoryPayload';
  /** The newly created global category. */
  category: Category;
};

export type CreateCategoryResult = CategoryNotFoundError | CategorySlugTakenError | CreateCategorySuccess;

export type CreateCategorySuccess = {
  __typename?: 'CreateCategorySuccess';
  data: CreateCategoryPayload;
};

export type CreateLocaleInput = {
  /** BCP-47 locale code; trimmed and lowercased. Must be unique in the registry. */
  code: Scalars['String']['input'];
  /** Whether the locale is active on creation; defaults to the service default. */
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  /** Human-readable display name of the locale. */
  name: Scalars['String']['input'];
};

export type CreateLocalePayload = {
  __typename?: 'CreateLocalePayload';
  /** The newly created locale. */
  locale: Locale;
};

export type CreateLocaleResult = CreateLocaleSuccess | LocaleCodeTakenError | ValidationError;

export type CreateLocaleSuccess = {
  __typename?: 'CreateLocaleSuccess';
  data: CreateLocalePayload;
};

export type CreatePlatformChannelInput = {
  /** Optional longer description of the sales channel. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** URL-safe identifier, unique among platform channels; derived from the name when omitted. */
  handle?: InputMaybe<Scalars['String']['input']>;
  /** Whether the channel is available for selling; defaults to true when omitted. */
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  /** Marks this channel as the platform default; defaults to false when omitted. */
  isDefault?: InputMaybe<Scalars['Boolean']['input']>;
  /** Freeform key-value metadata attached to the channel. */
  metadata?: InputMaybe<Scalars['JSONObject']['input']>;
  /** Human-readable display name of the sales channel. */
  name: Scalars['String']['input'];
};

export type CreatePlatformChannelPayload = {
  __typename?: 'CreatePlatformChannelPayload';
  /** The newly created platform channel. */
  channel: Channel;
};

export type CreatePlatformChannelResult = ChannelHandleTakenError | CreatePlatformChannelSuccess | ValidationError;

export type CreatePlatformChannelSuccess = {
  __typename?: 'CreatePlatformChannelSuccess';
  data: CreatePlatformChannelPayload;
};

export type CreateProductInput = {
  /** An optional long-form description of the product. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** The URL handle, which must be unique within the product's scope. */
  handle: Scalars['String']['input'];
  /** The display name of the product. */
  name: Scalars['String']['input'];
  /** The product type to assign; a global product requires a global product type. */
  productTypeId: Scalars['Int']['input'];
  /** An optional URL for the product's thumbnail image. */
  thumbnailUrl?: InputMaybe<Scalars['String']['input']>;
};

export type CreateProductPayload = {
  __typename?: 'CreateProductPayload';
  /** The newly created global product. */
  product: Product;
};

export type CreateProductResult = CreateProductSuccess | GlobalProductRequiresGlobalTypeError | HandleTakenError | ProductNotFoundError | ProductTypeNotFoundError;

export type CreateProductSuccess = {
  __typename?: 'CreateProductSuccess';
  data: CreateProductPayload;
};

export type CreateProductTypeInput = {
  /** Whether products of this type are physical goods that require shipping. */
  isShippingRequired: Scalars['Boolean']['input'];
  /** Human-readable display name of the product type. */
  name: Scalars['String']['input'];
  /** URL-safe identifier for the product type. */
  slug: Scalars['String']['input'];
};

export type CreateProductTypePayload = {
  __typename?: 'CreateProductTypePayload';
  /** The newly created global product type. */
  productType: ProductType;
};

export type CreateProductTypeResult = CreateProductTypeSuccess;

export type CreateProductTypeSuccess = {
  __typename?: 'CreateProductTypeSuccess';
  data: CreateProductTypePayload;
};

export type CreateUserInput = {
  /** Email address for the new user; normalized to lowercase. */
  email: Scalars['String']['input'];
  /** When true, send an invitation email with a set-password link after creation. */
  invite?: InputMaybe<Scalars['Boolean']['input']>;
  /** Display name for the new user. */
  name: Scalars['String']['input'];
  /** Optional initial password. Omit to create an invite-only account whose password is set via the invitation email. */
  password?: InputMaybe<Scalars['String']['input']>;
  /** Global platform roles to assign to the new user. */
  role?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type CreateUserPayload = {
  __typename?: 'CreateUserPayload';
  /** The newly created user. */
  user: User;
};

export type CreateUserResult = CreateUserSuccess | CredentialLinkFailedError | InvalidRoleError | PasswordHashFailedError | RoleAssignmentDeniedError | UserAlreadyExistsError | ValidationError;

export type CreateUserSuccess = {
  __typename?: 'CreateUserSuccess';
  data: CreateUserPayload;
};

export type CreateVariantInput = {
  /** Optional sort position ordering the variant among its siblings. */
  position?: InputMaybe<Scalars['Int']['input']>;
  /** Global ID of the parent Product node the new variant belongs to. */
  productId: Scalars['ID']['input'];
  /** Option selection (attribute/value pairs) identifying the variant. Only validated for uniqueness among siblings here; it is persisted separately via assignVariantValue. */
  selection?: InputMaybe<Array<VariantSelectionPairInput>>;
  /** Optional stock-keeping unit. Must be unique when provided. */
  sku?: InputMaybe<Scalars['String']['input']>;
};

export type CreateVariantPayload = {
  __typename?: 'CreateVariantPayload';
  /** The newly created variant. */
  variant: ProductVariant;
};

export type CreateVariantResult = CreateVariantSuccess | DuplicateVariantMatrixError | ProductSkuTakenError | VariantNotFoundError;

export type CreateVariantSuccess = {
  __typename?: 'CreateVariantSuccess';
  data: CreateVariantPayload;
};

export type CredentialLinkFailedError = Error & {
  __typename?: 'CredentialLinkFailedError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type DateTimeFilterInput = {
  AND?: InputMaybe<Array<DateTimeFilterInput>>;
  NOT?: InputMaybe<DateTimeFilterInput>;
  OR?: InputMaybe<Array<DateTimeFilterInput>>;
  eq?: InputMaybe<Scalars['DateTime']['input']>;
  gt?: InputMaybe<Scalars['DateTime']['input']>;
  gte?: InputMaybe<Scalars['DateTime']['input']>;
  in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  lt?: InputMaybe<Scalars['DateTime']['input']>;
  lte?: InputMaybe<Scalars['DateTime']['input']>;
  ne?: InputMaybe<Scalars['DateTime']['input']>;
  notIn?: InputMaybe<Array<Scalars['DateTime']['input']>>;
};

export type DeclareAttributeInput = {
  /** Whether the attribute applies to the PRODUCT or to each VARIANT. */
  assignment: ProductAttributeAssignment;
  /** Identifier of the attribute to declare on the type. */
  attributeId: Scalars['Int']['input'];
  /** References an Organization node. When set this is an org GRAFT extension where that organization extends a typically-global type, gated on that org; when null it is a BASE declaration scoped to the type's own org or global scope. */
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  /** Ordering position of the attribute within the type's declarations. */
  position: Scalars['Int']['input'];
  /** References the ProductType node the attribute is being attached to. */
  productTypeId: Scalars['ID']['input'];
  /** Whether this attribute participates in the variant selection matrix. */
  variantSelection: Scalars['Boolean']['input'];
};

export type DeclareAttributePayload = {
  __typename?: 'DeclareAttributePayload';
  /** The resulting attribute declaration attached to the product type. */
  attribute: ProductTypeAttribute;
};

export type DeclareAttributeResult = DeclareAttributeSuccess | InvalidAttributeDeclarationError;

export type DeclareAttributeSuccess = {
  __typename?: 'DeclareAttributeSuccess';
  data: DeclareAttributePayload;
};

export type DeleteAttributeBooleanValueInput = {
  /** The boolean value to clear. */
  id: Scalars['ID']['input'];
};

export type DeleteAttributeBooleanValuePayload = {
  __typename?: 'DeleteAttributeBooleanValuePayload';
  /** The boolean value that was cleared. */
  value: AttributeBooleanValue;
};

export type DeleteAttributeBooleanValueResult = DeleteAttributeBooleanValueSuccess | TypedValueNotFoundError;

export type DeleteAttributeBooleanValueSuccess = {
  __typename?: 'DeleteAttributeBooleanValueSuccess';
  data: DeleteAttributeBooleanValuePayload;
};

export type DeleteAttributeDateValueInput = {
  /** The date value to clear. */
  id: Scalars['ID']['input'];
};

export type DeleteAttributeDateValuePayload = {
  __typename?: 'DeleteAttributeDateValuePayload';
  /** The date value that was cleared. */
  value: AttributeDateValue;
};

export type DeleteAttributeDateValueResult = DeleteAttributeDateValueSuccess | TypedValueNotFoundError;

export type DeleteAttributeDateValueSuccess = {
  __typename?: 'DeleteAttributeDateValueSuccess';
  data: DeleteAttributeDateValuePayload;
};

export type DeleteAttributeFileValueInput = {
  /** The file value to clear. */
  id: Scalars['ID']['input'];
};

export type DeleteAttributeFileValuePayload = {
  __typename?: 'DeleteAttributeFileValuePayload';
  /** The file value that was cleared. */
  value: AttributeFileValue;
};

export type DeleteAttributeFileValueResult = DeleteAttributeFileValueSuccess | TypedValueNotFoundError;

export type DeleteAttributeFileValueSuccess = {
  __typename?: 'DeleteAttributeFileValueSuccess';
  data: DeleteAttributeFileValuePayload;
};

export type DeleteAttributeInput = {
  /** Global id of the attribute to delete. */
  id: Scalars['ID']['input'];
};

export type DeleteAttributeNumericValueInput = {
  /** The numeric value to clear. */
  id: Scalars['ID']['input'];
};

export type DeleteAttributeNumericValuePayload = {
  __typename?: 'DeleteAttributeNumericValuePayload';
  /** The numeric value that was cleared. */
  value: AttributeNumericValue;
};

export type DeleteAttributeNumericValueResult = DeleteAttributeNumericValueSuccess | TypedValueNotFoundError;

export type DeleteAttributeNumericValueSuccess = {
  __typename?: 'DeleteAttributeNumericValueSuccess';
  data: DeleteAttributeNumericValuePayload;
};

export type DeleteAttributePayload = {
  __typename?: 'DeleteAttributePayload';
  /** The attribute that was deleted. */
  attribute: Attribute;
};

export type DeleteAttributeReferenceInput = {
  /** The reference value to delete. */
  id: Scalars['ID']['input'];
};

export type DeleteAttributeReferencePayload = {
  __typename?: 'DeleteAttributeReferencePayload';
  /** The reference value that was deleted. */
  value: AttributeReferenceValue;
};

export type DeleteAttributeReferenceResult = AttributeValueNotFoundError | DeleteAttributeReferenceSuccess;

export type DeleteAttributeReferenceSuccess = {
  __typename?: 'DeleteAttributeReferenceSuccess';
  data: DeleteAttributeReferencePayload;
};

export type DeleteAttributeResult = AttributeNotFoundError | DeleteAttributeSuccess;

export type DeleteAttributeSuccess = {
  __typename?: 'DeleteAttributeSuccess';
  data: DeleteAttributePayload;
};

export type DeleteAttributeSwatchInput = {
  /** The swatch value to delete. */
  id: Scalars['ID']['input'];
};

export type DeleteAttributeSwatchPayload = {
  __typename?: 'DeleteAttributeSwatchPayload';
  /** The swatch value that was deleted. */
  value: AttributeSwatchValue;
};

export type DeleteAttributeSwatchResult = AttributeValueNotFoundError | DeleteAttributeSwatchSuccess;

export type DeleteAttributeSwatchSuccess = {
  __typename?: 'DeleteAttributeSwatchSuccess';
  data: DeleteAttributeSwatchPayload;
};

export type DeleteAttributeTextValueInput = {
  /** The text value to clear. */
  id: Scalars['ID']['input'];
};

export type DeleteAttributeTextValuePayload = {
  __typename?: 'DeleteAttributeTextValuePayload';
  /** The text value that was cleared. */
  value: AttributeTextValue;
};

export type DeleteAttributeTextValueResult = DeleteAttributeTextValueSuccess | TypedValueNotFoundError;

export type DeleteAttributeTextValueSuccess = {
  __typename?: 'DeleteAttributeTextValueSuccess';
  data: DeleteAttributeTextValuePayload;
};

export type DeleteAttributeValueInput = {
  /** The choice value to delete. */
  id: Scalars['ID']['input'];
};

export type DeleteAttributeValuePayload = {
  __typename?: 'DeleteAttributeValuePayload';
  /** The choice value that was deleted. */
  value: AttributeValue;
};

export type DeleteAttributeValueResult = AttributeValueNotFoundError | DeleteAttributeValueSuccess;

export type DeleteAttributeValueSuccess = {
  __typename?: 'DeleteAttributeValueSuccess';
  data: DeleteAttributeValuePayload;
};

export type DeleteCategoryInput = {
  /** References the Category node to delete. */
  id: Scalars['ID']['input'];
  /** The expected current version for optimistic-lock checking; a stale value is rejected. */
  version: Scalars['Int']['input'];
};

export type DeleteCategoryPayload = {
  __typename?: 'DeleteCategoryPayload';
  /** The soft-deleted category. */
  category: Category;
};

export type DeleteCategoryResult = CategoryNotFoundError | DeleteCategorySuccess | OptimisticLockError;

export type DeleteCategorySuccess = {
  __typename?: 'DeleteCategorySuccess';
  data: DeleteCategoryPayload;
};

export type DeleteChannelInput = {
  /** Identifies the Channel node to soft-delete. */
  id: Scalars['ID']['input'];
  /** Expected current version for optimistic-lock concurrency control. */
  version: Scalars['Int']['input'];
};

export type DeleteChannelPayload = {
  __typename?: 'DeleteChannelPayload';
  /** The soft-deleted sales channel. */
  channel: Channel;
};

export type DeleteChannelResult = ChannelNotFoundError | DeleteChannelSuccess | OptimisticLockError;

export type DeleteChannelSuccess = {
  __typename?: 'DeleteChannelSuccess';
  data: DeleteChannelPayload;
};

export type DeleteLocaleInput = {
  /** The Locale to soft-delete. */
  id: Scalars['ID']['input'];
  /** Optimistic-lock version; must match the current row or the delete is rejected. */
  version: Scalars['Int']['input'];
};

export type DeleteLocalePayload = {
  __typename?: 'DeleteLocalePayload';
  /** The soft-deleted locale. */
  locale: Locale;
};

export type DeleteLocaleResult = DeleteLocaleSuccess | LocaleNotFoundError | OptimisticLockError;

export type DeleteLocaleSuccess = {
  __typename?: 'DeleteLocaleSuccess';
  data: DeleteLocalePayload;
};

export type DeleteProductInput = {
  /** The Product to soft-delete. */
  id: Scalars['ID']['input'];
  /** The optimistic-lock version, which must match the current row or the delete is rejected. */
  version: Scalars['Int']['input'];
};

export type DeleteProductPayload = {
  __typename?: 'DeleteProductPayload';
  /** The soft-deleted product, with its deletedAt timestamp set. */
  product: Product;
};

export type DeleteProductResult = DeleteProductSuccess | OptimisticLockError | ProductNotFoundError;

export type DeleteProductSuccess = {
  __typename?: 'DeleteProductSuccess';
  data: DeleteProductPayload;
};

export type DeleteProductTypeInput = {
  /** References the ProductType node to soft-delete. */
  id: Scalars['ID']['input'];
  /** Expected current version for optimistic-lock concurrency control; the deletion fails if it no longer matches. */
  version: Scalars['Int']['input'];
};

export type DeleteProductTypePayload = {
  __typename?: 'DeleteProductTypePayload';
  /** The soft-deleted product type. */
  productType: ProductType;
};

export type DeleteProductTypeResult = DeleteProductTypeSuccess | OptimisticLockError | ProductTypeNotFoundError;

export type DeleteProductTypeSuccess = {
  __typename?: 'DeleteProductTypeSuccess';
  data: DeleteProductTypePayload;
};

export type DeleteVariantInput = {
  /** Global ID of the ProductVariant node to soft-delete. */
  id: Scalars['ID']['input'];
  /** Expected current version for optimistic locking; a mismatch raises OptimisticLockError. */
  version: Scalars['Int']['input'];
};

export type DeleteVariantPayload = {
  __typename?: 'DeleteVariantPayload';
  /** The soft-deleted variant. */
  variant: ProductVariant;
};

export type DeleteVariantResult = DeleteVariantSuccess | OptimisticLockError | VariantNotFoundError;

export type DeleteVariantSuccess = {
  __typename?: 'DeleteVariantSuccess';
  data: DeleteVariantPayload;
};

export type DuplicateVariantMatrixError = Error & {
  __typename?: 'DuplicateVariantMatrixError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type Error = {
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type FieldError = {
  __typename?: 'FieldError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  path: Scalars['String']['output'];
};

/** A file reference attached to an attribute value (swatch image or file value): a URL plus its MIME type. */
export type FileInfo = {
  __typename?: 'FileInfo';
  /** MIME type of the file (e.g. `image/png`). */
  mimetype: Scalars['String']['output'];
  /** URL of the file asset. */
  url: Scalars['String']['output'];
};

/** Write counterpart of FileInfo: the file URL and its MIME type to store on an attribute value. */
export type FileInfoInput = {
  /** MIME type of the file (e.g. `image/png`). */
  mimetype: Scalars['String']['input'];
  /** URL of the file asset. */
  url: Scalars['String']['input'];
};

export type FloatFilterInput = {
  AND?: InputMaybe<Array<FloatFilterInput>>;
  NOT?: InputMaybe<FloatFilterInput>;
  OR?: InputMaybe<Array<FloatFilterInput>>;
  eq?: InputMaybe<Scalars['Float']['input']>;
  gt?: InputMaybe<Scalars['Float']['input']>;
  gte?: InputMaybe<Scalars['Float']['input']>;
  in?: InputMaybe<Array<Scalars['Float']['input']>>;
  lt?: InputMaybe<Scalars['Float']['input']>;
  lte?: InputMaybe<Scalars['Float']['input']>;
  ne?: InputMaybe<Scalars['Float']['input']>;
  notIn?: InputMaybe<Array<Scalars['Float']['input']>>;
};

export type ForbiddenError = Error & {
  __typename?: 'ForbiddenError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  requiredPermission: Scalars['String']['output'];
};

export type GlobalProductRequiresGlobalTypeError = Error & {
  __typename?: 'GlobalProductRequiresGlobalTypeError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type HandleTakenError = Error & {
  __typename?: 'HandleTakenError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type IdFilterInput = {
  AND?: InputMaybe<Array<IdFilterInput>>;
  NOT?: InputMaybe<IdFilterInput>;
  OR?: InputMaybe<Array<IdFilterInput>>;
  eq?: InputMaybe<Scalars['ID']['input']>;
  in?: InputMaybe<Array<Scalars['ID']['input']>>;
  notIn?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type ImpersonationNotActiveError = Error & {
  __typename?: 'ImpersonationNotActiveError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type ImpersonationTtlTooLongError = Error & {
  __typename?: 'ImpersonationTtlTooLongError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type IntFilterInput = {
  AND?: InputMaybe<Array<IntFilterInput>>;
  NOT?: InputMaybe<IntFilterInput>;
  OR?: InputMaybe<Array<IntFilterInput>>;
  eq?: InputMaybe<Scalars['Int']['input']>;
  gt?: InputMaybe<Scalars['Int']['input']>;
  gte?: InputMaybe<Scalars['Int']['input']>;
  in?: InputMaybe<Array<Scalars['Int']['input']>>;
  lt?: InputMaybe<Scalars['Int']['input']>;
  lte?: InputMaybe<Scalars['Int']['input']>;
  ne?: InputMaybe<Scalars['Int']['input']>;
  notIn?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type InvalidAttributeDeclarationError = Error & {
  __typename?: 'InvalidAttributeDeclarationError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type InvalidRoleError = Error & {
  __typename?: 'InvalidRoleError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  role: Scalars['String']['output'];
};

export type LinkVariantMediaInput = {
  /** References the ProductMedia node to attach to the variant. */
  mediaId: Scalars['ID']['input'];
  /** References the ProductVariant node to attach the media asset to. */
  variantId: Scalars['ID']['input'];
};

export type LinkVariantMediaPayload = {
  __typename?: 'LinkVariantMediaPayload';
  /** True when the media asset was successfully linked to the variant. */
  success: Scalars['Boolean']['output'];
};

export type LinkVariantMediaResult = LinkVariantMediaSuccess | MediaNotFoundError;

export type LinkVariantMediaSuccess = {
  __typename?: 'LinkVariantMediaSuccess';
  data: LinkVariantMediaPayload;
};

/** A platform-wide locale in the global registry. Consumer modules key their translations by a locale `code`; one locale is the platform default. */
export type Locale = Node & {
  __typename?: 'Locale';
  /** BCP-47 locale code (e.g. `fr`, `en-US`), unique and lowercased. */
  code: Scalars['String']['output'];
  /** Timestamp when the locale was created. */
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** Whether the locale is available for use (inactive locales are kept but not offered). */
  isActive: Scalars['Boolean']['output'];
  /** Human-readable display name of the locale. */
  name: Scalars['String']['output'];
  /** Timestamp when the locale was last updated. */
  updatedAt: Scalars['DateTime']['output'];
  /** Optimistic-lock version, incremented on each update. */
  version: Scalars['Int']['output'];
};

export type LocaleCodeTakenError = Error & {
  __typename?: 'LocaleCodeTakenError';
  code: Scalars['String']['output'];
  localeCode: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type LocaleNotFoundError = Error & {
  __typename?: 'LocaleNotFoundError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type MarketplaceCategoryNotGlobalError = Error & {
  __typename?: 'MarketplaceCategoryNotGlobalError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type MediaNotFoundError = Error & {
  __typename?: 'MediaNotFoundError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Adds a media asset to a product, either as a global BASE row when organizationId is null or as an organization-scoped GRAFT when it is set. */
  addMedia: AddMediaResult;
  /** Approves a product's marketplace listing, making it live-eligible (live once the org keeps it published). Requires the global `channel:update` role. */
  approveListing: ApproveListingResult;
  /** Approves a taxonomy request: creates the global entity (create) or flips the org entity to global (promote). Requires the global `product:create` role; product-type requests additionally require the global `attribute:create` role. */
  approveTaxonomyRequest: ApproveTaxonomyRequestResult;
  /** Assigns an attribute value onto a product. A BASE assignment (no organizationId) is global; an org GRAFT (organizationId set) requires a live adoption when the product is global. */
  assignProductValue: AssignProductValueResult;
  /** Assigns an attribute value onto a product variant. A BASE assignment (no organizationId) is global; an org GRAFT (organizationId set) requires a live adoption when the product is global. */
  assignVariantValue: AssignVariantValueResult;
  /** Bans a user from the platform, optionally with a reason and expiry. Cannot be used to ban oneself. Admin-only. */
  banUser: BanUserResult;
  /** Creates a platform-wide attribute owned by no organization. Requires the global attribute:create role. */
  createAttribute: CreateAttributeResult;
  /** Sets the typed value of a BOOLEAN attribute, creating its single AttributeBooleanValue node. */
  createAttributeBooleanValue: CreateAttributeBooleanValueResult;
  /** Sets the typed value of a DATE or DATETIME attribute, creating its single AttributeDateValue node. */
  createAttributeDateValue: CreateAttributeDateValueResult;
  /** Sets the typed value of a FILE attribute, creating its single AttributeFileValue node. */
  createAttributeFileValue: CreateAttributeFileValueResult;
  /** Sets the typed value of a NUMBER attribute, creating its single AttributeNumericValue node. */
  createAttributeNumericValue: CreateAttributeNumericValueResult;
  /** Creates a reference choice value pointing at another entity on a REFERENCE attribute. */
  createAttributeReference: CreateAttributeReferenceResult;
  /** Creates a swatch choice value (color and/or image) on a SWATCH attribute. */
  createAttributeSwatch: CreateAttributeSwatchResult;
  /** Sets the typed value of a TEXT attribute, creating its single AttributeTextValue node. */
  createAttributeTextValue: CreateAttributeTextValueResult;
  /** Creates a plain choice value on a DROPDOWN or MULTISELECT attribute. */
  createAttributeValue: CreateAttributeValueResult;
  /** Creates a GLOBAL (base) category, gated on the global `product` create permission. */
  createCategory: CreateCategoryResult;
  /** Add a locale to the platform registry. Requires the global `locale:create` permission. Fails with LocaleCodeTaken if the code already exists. */
  createLocale: CreateLocaleResult;
  /** Creates a platform-wide channel (no owning organization), manageable only by a platform operator. */
  createPlatformChannel: CreatePlatformChannelResult;
  /** Creates a GLOBAL (base) product, gated on the global `product` create permission. A global product requires a global product type. */
  createProduct: CreateProductResult;
  /** Creates a GLOBAL product type, the pivot declaring which attributes apply to its products and variants. Gated on the global `product` create permission. */
  createProductType: CreateProductTypeResult;
  /** Creates a new platform user with a credential account and optional global roles. Admin-only. */
  createUser: CreateUserResult;
  /** Creates a variant under a product. Validates that the option selection is unique among sibling variants; the selection itself is persisted separately via assignVariantValue. Authorization is inherited from the parent product's scope (global or org). */
  createVariant: CreateVariantResult;
  /** Attaches an attribute to a product type. A BASE declaration (organizationId null) is scoped to the type's own org or global scope; an org GRAFT (organizationId set) lets that organization extend a typically-global type. Gates on the resulting scope. */
  declareAttribute: DeclareAttributeResult;
  /** Permanently deletes an attribute, cascading to all of its value rows. */
  deleteAttribute: DeleteAttributeResult;
  /** Clears the typed value of a BOOLEAN attribute, removing its AttributeBooleanValue node. */
  deleteAttributeBooleanValue: DeleteAttributeBooleanValueResult;
  /** Clears the typed value of a DATE or DATETIME attribute, removing its AttributeDateValue node. */
  deleteAttributeDateValue: DeleteAttributeDateValueResult;
  /** Clears the typed value of a FILE attribute, removing its AttributeFileValue node. */
  deleteAttributeFileValue: DeleteAttributeFileValueResult;
  /** Clears the typed value of a NUMBER attribute, removing its AttributeNumericValue node. */
  deleteAttributeNumericValue: DeleteAttributeNumericValueResult;
  /** Deletes a reference choice value from a REFERENCE attribute. */
  deleteAttributeReference: DeleteAttributeReferenceResult;
  /** Deletes a swatch choice value from a SWATCH attribute. */
  deleteAttributeSwatch: DeleteAttributeSwatchResult;
  /** Clears the typed value of a TEXT attribute, removing its AttributeTextValue node. */
  deleteAttributeTextValue: DeleteAttributeTextValueResult;
  /** Deletes a plain choice value from a DROPDOWN or MULTISELECT attribute. */
  deleteAttributeValue: DeleteAttributeValueResult;
  /** Soft-deletes a category, marking it as removed while preserving the record. */
  deleteCategory: DeleteCategoryResult;
  /** Soft-deletes a sales channel, marking it removed without erasing the row. */
  deleteChannel: DeleteChannelResult;
  /** Soft-delete a locale from the registry. Requires the global `locale:delete` permission. */
  deleteLocale: DeleteLocaleResult;
  /** Soft-deletes a product by setting its deletedAt timestamp. Authorization gates on the global `product` delete permission for a GLOBAL product (organizationId null) or on `product:delete` in the owning organization. */
  deleteProduct: DeleteProductResult;
  /** Soft-deletes a product type. Gates on the type's own scope: the global `product` permission for a GLOBAL type, or the owning organization otherwise. */
  deleteProductType: DeleteProductTypeResult;
  /** Soft-deletes a variant by setting its deletedAt timestamp. Uses optimistic locking via the version field. Authorization is inherited from the variant's scope (global or org). */
  deleteVariant: DeleteVariantResult;
  /** Attaches a media asset to a specific product variant via the global link table, authorized against the owning organization of the media row. */
  linkVariantMedia: LinkVariantMediaResult;
  /** Places a product into a category, either as a global base placement or as an organization-specific graft. */
  placeProduct: PlaceProductResult;
  /** Rejects a product's marketplace listing with a reason. Requires the global `channel:update` role. */
  rejectListing: RejectListingResult;
  /** Rejects a taxonomy request with a reason. Requires the global `product:create` role. */
  rejectTaxonomyRequest: RejectTaxonomyRequestResult;
  /** Deletes the localized translation row of a category for the given locale. */
  removeCategoryTranslation: RemoveCategoryTranslationResult;
  /** Soft-deletes an existing media asset, authorized against the owning organization of the media row. */
  removeMedia: RemoveMediaResult;
  /** Removes a product's placement from a category, either the global base placement or an organization-specific graft. */
  removePlacement: RemovePlacementResult;
  /** Deletes the localized translation row of a product for the given locale. */
  removeProductTranslation: RemoveProductTranslationResult;
  /** Soft-deletes a user account, setting its deletedAt timestamp. Cannot be used to remove oneself. Admin-only. */
  removeUser: RemoveUserResult;
  /** Deletes the localized translation row of a product variant for the given locale. */
  removeVariantTranslation: RemoveVariantTranslationResult;
  /** Reorders the reference values of a REFERENCE attribute. */
  reorderAttributeReferences: ReorderAttributeReferencesPayload;
  /** Reorders the swatch values of a SWATCH attribute. */
  reorderAttributeSwatches: ReorderAttributeSwatchesPayload;
  /** Reorders the plain choice values of a DROPDOWN or MULTISELECT attribute. */
  reorderAttributeValues: ReorderAttributeValuesPayload;
  /** Re-sends the invitation email (a set-password link) to a user. Admin-only. */
  resendInvitation: ResendInvitationResult;
  /** Revokes a single session identified by its token, signing out that session. Admin-only. */
  revokeSession: RevokeSessionPayload;
  /** Revokes all active sessions for a given user, signing them out everywhere. Admin-only. */
  revokeSessions: RevokeSessionsPayload;
  /** Moves a category to a new parent in the tree, or detaches it to the root; a move that would form a cycle is rejected. */
  setCategoryParent: SetCategoryParentResult;
  /** Sets a user's global platform roles (one tier per hierarchy). Cannot be used to demote oneself. Admin-only. */
  setRole: SetRoleResult;
  /** Sets a new password on a user's credential account. Admin-only. */
  setUserPassword: SetUserPasswordResult;
  /** Starts impersonating another user. Requires the global user:impersonate permission; mints a child session whose parent_token links back to the admin's session. */
  startImpersonation: StartImpersonationResult;
  /** Stops the active impersonation by walking back up to the parent (admin) session. Requires an active impersonation session. */
  stopImpersonation: StopImpersonationResult;
  /** Suspends a previously-approved marketplace listing with a reason (takes it off the marketplace). Requires the global `channel:update` role. */
  suspendListing: SuspendListingResult;
  /** Removes an attribute value assignment from a product, identified by its pivot row id. */
  unassignProductValue: UnassignProductValueResult;
  /** Removes an attribute value assignment from a product variant, identified by its pivot row id. */
  unassignVariantValue: UnassignVariantValueResult;
  /** Lifts an active ban on a user, restoring their platform access. Admin-only. */
  unbanUser: UnbanUserResult;
  /** Detaches an attribute declaration from a product type. Gates on the type's own scope: the global `product` permission for a GLOBAL type, or the owning organization otherwise. */
  undeclareAttribute: UndeclareAttributeResult;
  /** Detaches a media asset from a specific product variant via the global link table, authorized against the owning organization of the media row. */
  unlinkVariantMedia: UnlinkVariantMediaResult;
  /** Updates mutable fields of an existing attribute, guarded by optimistic locking. */
  updateAttribute: UpdateAttributeResult;
  /** Updates the stored flag of an existing BOOLEAN attribute value. */
  updateAttributeBooleanValue: UpdateAttributeBooleanValueResult;
  /** Updates the stored date/time of an existing DATE or DATETIME attribute value. */
  updateAttributeDateValue: UpdateAttributeDateValueResult;
  /** Updates the stored file of an existing FILE attribute value. */
  updateAttributeFileValue: UpdateAttributeFileValueResult;
  /** Updates the stored number of an existing NUMBER attribute value. */
  updateAttributeNumericValue: UpdateAttributeNumericValueResult;
  /** Updates a reference choice value on a REFERENCE attribute. */
  updateAttributeReference: UpdateAttributeReferenceResult;
  /** Updates a swatch choice value on a SWATCH attribute. */
  updateAttributeSwatch: UpdateAttributeSwatchResult;
  /** Updates the plain and/or rich representation of an existing TEXT attribute value. */
  updateAttributeTextValue: UpdateAttributeTextValueResult;
  /** Updates a plain choice value on a DROPDOWN or MULTISELECT attribute. */
  updateAttributeValue: UpdateAttributeValueResult;
  /** Updates an existing category's editable fields, guarded by optimistic locking. */
  updateCategory: UpdateCategoryResult;
  /** Updates an existing sales channel's fields. */
  updateChannel: UpdateChannelResult;
  /** Update a locale's name or active state. Requires the global `locale:update` permission. */
  updateLocale: UpdateLocaleResult;
  /** Updates an existing media asset, authorized against the owning organization of the media row. */
  updateMedia: UpdateMediaResult;
  /** Updates a product. Authorization gates on the global `product` update permission for a GLOBAL product (organizationId null) or on `product:update` in the owning organization. */
  updateProduct: UpdateProductResult;
  /** Updates a product type. Gates on the type's own scope: the global `product` permission for a GLOBAL type, or the owning organization otherwise. */
  updateProductType: UpdateProductTypeResult;
  /** Updates an existing user's profile and, optionally, their global roles. Admin-only. */
  updateUser: UpdateUserResult;
  /** Updates a variant's sku and position. Uses optimistic locking via the version field. Authorization is inherited from the variant's scope (global or org). */
  updateVariant: UpdateVariantResult;
  /** Creates or updates the localized translation of a category's name and description for the given locale. */
  upsertCategoryTranslation: UpsertCategoryTranslationResult;
  /** Creates or updates the localized translation of a product's name and description for the given locale. */
  upsertProductTranslation: UpsertProductTranslationResult;
  /** Creates or updates the localized translation of a product variant's name for the given locale. */
  upsertVariantTranslation: UpsertVariantTranslationResult;
};


export type MutationAddMediaArgs = {
  input: AddMediaInput;
};


export type MutationApproveListingArgs = {
  input: ApproveListingInput;
};


export type MutationApproveTaxonomyRequestArgs = {
  input: ApproveTaxonomyRequestInput;
};


export type MutationAssignProductValueArgs = {
  input: AssignProductValueInput;
};


export type MutationAssignVariantValueArgs = {
  input: AssignVariantValueInput;
};


export type MutationBanUserArgs = {
  input: BanUserInput;
};


export type MutationCreateAttributeArgs = {
  input: CreateAttributeInput;
};


export type MutationCreateAttributeBooleanValueArgs = {
  input: CreateAttributeBooleanValueInput;
};


export type MutationCreateAttributeDateValueArgs = {
  input: CreateAttributeDateValueInput;
};


export type MutationCreateAttributeFileValueArgs = {
  input: CreateAttributeFileValueInput;
};


export type MutationCreateAttributeNumericValueArgs = {
  input: CreateAttributeNumericValueInput;
};


export type MutationCreateAttributeReferenceArgs = {
  input: CreateAttributeReferenceInput;
};


export type MutationCreateAttributeSwatchArgs = {
  input: CreateAttributeSwatchInput;
};


export type MutationCreateAttributeTextValueArgs = {
  input: CreateAttributeTextValueInput;
};


export type MutationCreateAttributeValueArgs = {
  input: CreateAttributeValueInput;
};


export type MutationCreateCategoryArgs = {
  input: CreateCategoryInput;
};


export type MutationCreateLocaleArgs = {
  input: CreateLocaleInput;
};


export type MutationCreatePlatformChannelArgs = {
  input: CreatePlatformChannelInput;
};


export type MutationCreateProductArgs = {
  input: CreateProductInput;
};


export type MutationCreateProductTypeArgs = {
  input: CreateProductTypeInput;
};


export type MutationCreateUserArgs = {
  input: CreateUserInput;
};


export type MutationCreateVariantArgs = {
  input: CreateVariantInput;
};


export type MutationDeclareAttributeArgs = {
  input: DeclareAttributeInput;
};


export type MutationDeleteAttributeArgs = {
  input: DeleteAttributeInput;
};


export type MutationDeleteAttributeBooleanValueArgs = {
  input: DeleteAttributeBooleanValueInput;
};


export type MutationDeleteAttributeDateValueArgs = {
  input: DeleteAttributeDateValueInput;
};


export type MutationDeleteAttributeFileValueArgs = {
  input: DeleteAttributeFileValueInput;
};


export type MutationDeleteAttributeNumericValueArgs = {
  input: DeleteAttributeNumericValueInput;
};


export type MutationDeleteAttributeReferenceArgs = {
  input: DeleteAttributeReferenceInput;
};


export type MutationDeleteAttributeSwatchArgs = {
  input: DeleteAttributeSwatchInput;
};


export type MutationDeleteAttributeTextValueArgs = {
  input: DeleteAttributeTextValueInput;
};


export type MutationDeleteAttributeValueArgs = {
  input: DeleteAttributeValueInput;
};


export type MutationDeleteCategoryArgs = {
  input: DeleteCategoryInput;
};


export type MutationDeleteChannelArgs = {
  input: DeleteChannelInput;
};


export type MutationDeleteLocaleArgs = {
  input: DeleteLocaleInput;
};


export type MutationDeleteProductArgs = {
  input: DeleteProductInput;
};


export type MutationDeleteProductTypeArgs = {
  input: DeleteProductTypeInput;
};


export type MutationDeleteVariantArgs = {
  input: DeleteVariantInput;
};


export type MutationLinkVariantMediaArgs = {
  input: LinkVariantMediaInput;
};


export type MutationPlaceProductArgs = {
  input: PlaceProductInput;
};


export type MutationRejectListingArgs = {
  input: RejectListingInput;
};


export type MutationRejectTaxonomyRequestArgs = {
  input: RejectTaxonomyRequestInput;
};


export type MutationRemoveCategoryTranslationArgs = {
  input: RemoveCategoryTranslationInput;
};


export type MutationRemoveMediaArgs = {
  input: RemoveMediaInput;
};


export type MutationRemovePlacementArgs = {
  input: RemovePlacementInput;
};


export type MutationRemoveProductTranslationArgs = {
  input: RemoveProductTranslationInput;
};


export type MutationRemoveUserArgs = {
  input: RemoveUserInput;
};


export type MutationRemoveVariantTranslationArgs = {
  input: RemoveVariantTranslationInput;
};


export type MutationReorderAttributeReferencesArgs = {
  input: ReorderAttributeReferencesInput;
};


export type MutationReorderAttributeSwatchesArgs = {
  input: ReorderAttributeSwatchesInput;
};


export type MutationReorderAttributeValuesArgs = {
  input: ReorderAttributeValuesInput;
};


export type MutationResendInvitationArgs = {
  input: ResendInvitationInput;
};


export type MutationRevokeSessionArgs = {
  input: RevokeSessionInput;
};


export type MutationRevokeSessionsArgs = {
  input: RevokeSessionsInput;
};


export type MutationSetCategoryParentArgs = {
  input: SetCategoryParentInput;
};


export type MutationSetRoleArgs = {
  input: SetRoleInput;
};


export type MutationSetUserPasswordArgs = {
  input: SetUserPasswordInput;
};


export type MutationStartImpersonationArgs = {
  input: StartImpersonationInput;
};


export type MutationStopImpersonationArgs = {
  input: StopImpersonationInput;
};


export type MutationSuspendListingArgs = {
  input: SuspendListingInput;
};


export type MutationUnassignProductValueArgs = {
  input: UnassignProductValueInput;
};


export type MutationUnassignVariantValueArgs = {
  input: UnassignVariantValueInput;
};


export type MutationUnbanUserArgs = {
  input: UnbanUserInput;
};


export type MutationUndeclareAttributeArgs = {
  input: UndeclareAttributeInput;
};


export type MutationUnlinkVariantMediaArgs = {
  input: UnlinkVariantMediaInput;
};


export type MutationUpdateAttributeArgs = {
  input: UpdateAttributeInput;
};


export type MutationUpdateAttributeBooleanValueArgs = {
  input: UpdateAttributeBooleanValueInput;
};


export type MutationUpdateAttributeDateValueArgs = {
  input: UpdateAttributeDateValueInput;
};


export type MutationUpdateAttributeFileValueArgs = {
  input: UpdateAttributeFileValueInput;
};


export type MutationUpdateAttributeNumericValueArgs = {
  input: UpdateAttributeNumericValueInput;
};


export type MutationUpdateAttributeReferenceArgs = {
  input: UpdateAttributeReferenceInput;
};


export type MutationUpdateAttributeSwatchArgs = {
  input: UpdateAttributeSwatchInput;
};


export type MutationUpdateAttributeTextValueArgs = {
  input: UpdateAttributeTextValueInput;
};


export type MutationUpdateAttributeValueArgs = {
  input: UpdateAttributeValueInput;
};


export type MutationUpdateCategoryArgs = {
  input: UpdateCategoryInput;
};


export type MutationUpdateChannelArgs = {
  input: UpdateChannelInput;
};


export type MutationUpdateLocaleArgs = {
  input: UpdateLocaleInput;
};


export type MutationUpdateMediaArgs = {
  input: UpdateMediaInput;
};


export type MutationUpdateProductArgs = {
  input: UpdateProductInput;
};


export type MutationUpdateProductTypeArgs = {
  input: UpdateProductTypeInput;
};


export type MutationUpdateUserArgs = {
  input: UpdateUserInput;
};


export type MutationUpdateVariantArgs = {
  input: UpdateVariantInput;
};


export type MutationUpsertCategoryTranslationArgs = {
  input: UpsertCategoryTranslationInput;
};


export type MutationUpsertProductTranslationArgs = {
  input: UpsertProductTranslationInput;
};


export type MutationUpsertVariantTranslationArgs = {
  input: UpsertVariantTranslationInput;
};

export type Node = {
  id: Scalars['ID']['output'];
};

export type NotAMarketplaceChannelError = Error & {
  __typename?: 'NotAMarketplaceChannelError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type OptimisticLockError = Error & {
  __typename?: 'OptimisticLockError';
  actualVersion?: Maybe<Scalars['Int']['output']>;
  code: Scalars['String']['output'];
  entityId: Scalars['ID']['output'];
  expectedVersion: Scalars['Int']['output'];
  message: Scalars['String']['output'];
};

/** Direction in which results are sorted. */
export enum OrderDirection {
  /** Sort in ascending order. */
  Asc = 'ASC',
  /** Sort in descending order. */
  Desc = 'DESC'
}

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type PasswordHashFailedError = Error & {
  __typename?: 'PasswordHashFailedError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** A resource and the set of actions the user is permitted to perform on it, resolved from the user's roles. */
export type Permission = {
  __typename?: 'Permission';
  /** Actions the user may perform on this resource (e.g. "read", "create"). */
  actions: Array<Scalars['String']['output']>;
  /** The protected resource (e.g. "user", "session"). */
  resource: Scalars['String']['output'];
};

export type PlaceProductInput = {
  /** References the Category node the product is placed into. */
  categoryId: Scalars['ID']['input'];
  /** References an Organization node; when null the placement is a global base placement, otherwise it is an org-specific graft. */
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  /** The id of the product to place into the category. */
  productId: Scalars['Int']['input'];
};

export type PlaceProductPayload = {
  __typename?: 'PlaceProductPayload';
  /** The id of the category the product was placed into. */
  categoryId: Scalars['Int']['output'];
  /** The id of the product that was placed. */
  productId: Scalars['Int']['output'];
};

export type PlaceProductResult = CategoryNotFoundError | PlaceProductSuccess;

export type PlaceProductSuccess = {
  __typename?: 'PlaceProductSuccess';
  data: PlaceProductPayload;
};

/** A sellable product. Either global (platform-managed, organizationId null) or org-owned. An org adopts a global product, then grafts org-scoped overlays (attribute values, media, categories, channel listings, variants) onto the base; graft reads merge the base rows with the viewer org's rows. */
export type Product = Node & {
  __typename?: 'Product';
  /** A single assigned attribute by slug (PDP accessor). Same scoping as `assignedAttributes`. */
  assignedAttribute?: Maybe<AssignedAttribute>;
  /** The product's attributes with typed values resolved inline. Pass `channel` for the storefront (the org that published the product there) or `viewerOrg` for a specific org; omit for base. */
  assignedAttributes: Array<AssignedAttribute>;
  /** Categories this product is assigned to. Merges base assignments with the publishing/viewer organization's grafted assignments. Pass `channel` for the storefront or `viewerOrg` for a specific org. */
  categories: ProductCategoriesConnection;
  /** Sales-channel listings for this product, scoped via their channel. Excludes soft-deleted rows; no viewer-org overlay applies. */
  channelListings: ProductChannelListingsConnection;
  /** Collections that include this product. A global link table, not an org graft, so no viewer-org overlay applies. */
  collections: ProductCollectionsConnection;
  /** Timestamp when the product was created. */
  createdAt: Scalars['DateTime']['output'];
  /** Long-form description, overlaid with the requested locale's translation when available, falling back to the base value. */
  description?: Maybe<Scalars['String']['output']>;
  /** URL-friendly slug uniquely identifying the product within its scope. */
  handle: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** Whether the given viewer organization has adopted this global product. False when no viewer org is given, and false for org-owned products. */
  isAdopted: Scalars['Boolean']['output'];
  /** Media assets for this product, ordered by position. Merges base media with the publishing/viewer organization's grafted media; excludes soft-deleted rows. Pass `channel` for the storefront or `viewerOrg` for a specific org. */
  media: ProductMediaConnection;
  /** Display name, overlaid with the requested locale's translation when available, falling back to the base value. */
  name: Scalars['String']['output'];
  /** Owning organization; null for global, platform-managed products. */
  organizationId?: Maybe<Scalars['Int']['output']>;
  /** The product type this product belongs to. */
  productType: ProductType;
  /** URL of the product's thumbnail image, if set. */
  thumbnailUrl?: Maybe<Scalars['String']['output']>;
  /** Timestamp when the product was last updated. */
  updatedAt: Scalars['DateTime']['output'];
  /** Purchasable variants of this product (scoped via the product relation; excludes soft-deleted rows). */
  variants: ProductVariantsConnection;
  /** Optimistic-lock version, incremented on every update. */
  version: Scalars['Int']['output'];
};


/** A sellable product. Either global (platform-managed, organizationId null) or org-owned. An org adopts a global product, then grafts org-scoped overlays (attribute values, media, categories, channel listings, variants) onto the base; graft reads merge the base rows with the viewer org's rows. */
export type ProductAssignedAttributeArgs = {
  channel?: InputMaybe<Scalars['Int']['input']>;
  slug: Scalars['String']['input'];
  viewerOrg?: InputMaybe<Scalars['ID']['input']>;
};


/** A sellable product. Either global (platform-managed, organizationId null) or org-owned. An org adopts a global product, then grafts org-scoped overlays (attribute values, media, categories, channel listings, variants) onto the base; graft reads merge the base rows with the viewer org's rows. */
export type ProductAssignedAttributesArgs = {
  channel?: InputMaybe<Scalars['Int']['input']>;
  viewerOrg?: InputMaybe<Scalars['ID']['input']>;
};


/** A sellable product. Either global (platform-managed, organizationId null) or org-owned. An org adopts a global product, then grafts org-scoped overlays (attribute values, media, categories, channel listings, variants) onto the base; graft reads merge the base rows with the viewer org's rows. */
export type ProductCategoriesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  channel?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  viewerOrg?: InputMaybe<Scalars['ID']['input']>;
};


/** A sellable product. Either global (platform-managed, organizationId null) or org-owned. An org adopts a global product, then grafts org-scoped overlays (attribute values, media, categories, channel listings, variants) onto the base; graft reads merge the base rows with the viewer org's rows. */
export type ProductChannelListingsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


/** A sellable product. Either global (platform-managed, organizationId null) or org-owned. An org adopts a global product, then grafts org-scoped overlays (attribute values, media, categories, channel listings, variants) onto the base; graft reads merge the base rows with the viewer org's rows. */
export type ProductCollectionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


/** A sellable product. Either global (platform-managed, organizationId null) or org-owned. An org adopts a global product, then grafts org-scoped overlays (attribute values, media, categories, channel listings, variants) onto the base; graft reads merge the base rows with the viewer org's rows. */
export type ProductDescriptionArgs = {
  locale?: InputMaybe<Scalars['String']['input']>;
};


/** A sellable product. Either global (platform-managed, organizationId null) or org-owned. An org adopts a global product, then grafts org-scoped overlays (attribute values, media, categories, channel listings, variants) onto the base; graft reads merge the base rows with the viewer org's rows. */
export type ProductIsAdoptedArgs = {
  viewerOrg?: InputMaybe<Scalars['ID']['input']>;
};


/** A sellable product. Either global (platform-managed, organizationId null) or org-owned. An org adopts a global product, then grafts org-scoped overlays (attribute values, media, categories, channel listings, variants) onto the base; graft reads merge the base rows with the viewer org's rows. */
export type ProductMediaArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  channel?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  viewerOrg?: InputMaybe<Scalars['ID']['input']>;
};


/** A sellable product. Either global (platform-managed, organizationId null) or org-owned. An org adopts a global product, then grafts org-scoped overlays (attribute values, media, categories, channel listings, variants) onto the base; graft reads merge the base rows with the viewer org's rows. */
export type ProductNameArgs = {
  locale?: InputMaybe<Scalars['String']['input']>;
};


/** A sellable product. Either global (platform-managed, organizationId null) or org-owned. An org adopts a global product, then grafts org-scoped overlays (attribute values, media, categories, channel listings, variants) onto the base; graft reads merge the base rows with the viewer org's rows. */
export type ProductVariantsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};

/** Where an attribute is assigned on a product type: PRODUCT (one value per product) or VARIANT (selectable per variant). Attributes flagged for variant selection drive the variant matrix. */
export enum ProductAttributeAssignment {
  Product = 'PRODUCT',
  Variant = 'VARIANT'
}

/** A graft row binding a product to one of its attribute values; null organizationId is the base assignment, a set organizationId is a specific org's overlay. */
export type ProductAttributeValue = Node & {
  __typename?: 'ProductAttributeValue';
  /** The attribute (in the attribute module) this value belongs to. */
  attributeId: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  /** The owning organization of this graft, or null when it is the shared base assignment. */
  organizationId?: Maybe<Scalars['Int']['output']>;
  /** Ordering of this value among the product's attribute values. */
  position: Scalars['Int']['output'];
  /** The product this attribute value is assigned to. */
  productId: Scalars['Int']['output'];
  /** The specific attribute value assigned to the product. */
  valueId: Scalars['Int']['output'];
};

/** Typed predicate on an attribute value. Set one selector: `slug`/`name` (select & swatch values), `numeric`, `boolean`, `date`, or `reference`. */
export type ProductAttributeValueWhereInput = {
  /** Match a boolean value. */
  boolean?: InputMaybe<BooleanFilterInput>;
  /** Match a date/datetime value (supports ranges). */
  date?: InputMaybe<DateTimeFilterInput>;
  /** Match the value display label (select/swatch). */
  name?: InputMaybe<StringFilterInput>;
  /** Match a numeric value (supports ranges). */
  numeric?: InputMaybe<FloatFilterInput>;
  /** Match a reference value by its referenced entity id. */
  reference?: InputMaybe<IntFilterInput>;
  /** Match the value slug (select/swatch). */
  slug?: InputMaybe<StringFilterInput>;
};

/** One attribute facet. The attribute is identified by `slug`, `name`, or `ids`; `value` narrows by the attribute's value. Only filterable attributes match. Multiple facets on `attributes` are AND-ed. */
export type ProductAttributeWhereInput = {
  /** Match the attribute by relay id(s). */
  ids?: InputMaybe<IdFilterInput>;
  /** Match the attribute name. */
  name?: InputMaybe<StringFilterInput>;
  /** Match the attribute slug. */
  slug?: InputMaybe<StringFilterInput>;
  /** Predicate on the value the product carries for this attribute. */
  value?: InputMaybe<ProductAttributeValueWhereInput>;
};

export type ProductCategoriesConnection = {
  __typename?: 'ProductCategoriesConnection';
  edges: Array<ProductCategoriesConnectionEdge>;
  pageInfo: PageInfo;
};

export type ProductCategoriesConnectionEdge = {
  __typename?: 'ProductCategoriesConnectionEdge';
  cursor: Scalars['String']['output'];
  node: ProductCategory;
};

/** A graft row placing a product into a category; null organizationId is the base placement, a set organizationId is a specific org's overlay. */
export type ProductCategory = Node & {
  __typename?: 'ProductCategory';
  /** The category the product is placed in. */
  categoryId: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  /** The owning organization of this placement, or null when it is the shared base placement. */
  organizationId?: Maybe<Scalars['Int']['output']>;
  /** The product placed in the category. */
  productId: Scalars['Int']['output'];
};

/** A graft row publishing a product onto a sales channel, carrying that channel-specific publication state. */
export type ProductChannelListing = Node & {
  __typename?: 'ProductChannelListing';
  /** The moment the product becomes purchasable on this channel, or null if not set. */
  availableForPurchaseAt?: Maybe<Scalars['DateTime']['output']>;
  /** The sales channel (in the channel module) the product is listed on. */
  channelId: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  /** Whether the org has published this listing (the org gate). On a marketplace channel the product is live only once also approved. */
  isPublished: Scalars['Boolean']['output'];
  /** The organization that published this listing (null for legacy rows). */
  organizationId?: Maybe<Scalars['Int']['output']>;
  /** The product being listed on the channel. */
  productId: Scalars['Int']['output'];
  /** The moment the product was published on this channel, or null while unpublished. */
  publishedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Why the listing was rejected or suspended; null otherwise. */
  reviewReason?: Maybe<Scalars['String']['output']>;
  /** Admin moderation state on the marketplace channel. Always APPROVED for an org's own-channel listing. */
  reviewState: ProductListingReviewState;
  /** When an admin last set the review state, or null if never reviewed. */
  reviewedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Optimistic-locking version of the listing row. */
  version: Scalars['Int']['output'];
  /** Whether the product appears in browse and collection listings on this channel. */
  visibleInListings: Scalars['Boolean']['output'];
};

export type ProductChannelListingsConnection = {
  __typename?: 'ProductChannelListingsConnection';
  edges: Array<ProductChannelListingsConnectionEdge>;
  pageInfo: PageInfo;
};

export type ProductChannelListingsConnectionEdge = {
  __typename?: 'ProductChannelListingsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: ProductChannelListing;
};

export type ProductCollectionsConnection = {
  __typename?: 'ProductCollectionsConnection';
  edges: Array<ProductCollectionsConnectionEdge>;
  pageInfo: PageInfo;
};

export type ProductCollectionsConnectionEdge = {
  __typename?: 'ProductCollectionsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: CollectionProduct;
};

/** Admin moderation state of a product listing on the marketplace: PENDING (awaiting review), APPROVED (live-eligible), REJECTED, or SUSPENDED. */
export enum ProductListingReviewState {
  Approved = 'APPROVED',
  Pending = 'PENDING',
  Rejected = 'REJECTED',
  Suspended = 'SUSPENDED'
}

/** A media asset (image or video) attached to a product. Exists either as a global BASE row (no organization) or as an organization-specific graft, and may be linked to particular variants. */
export type ProductMedia = Node & {
  __typename?: 'ProductMedia';
  /** Alternative text describing the asset for accessibility. */
  alt?: Maybe<Scalars['String']['output']>;
  /** When the asset was created. */
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** The owning organization for a graft; null for a global base asset. */
  organizationId?: Maybe<Scalars['Int']['output']>;
  /** Sort order determining how this asset is sequenced among others. */
  position: Scalars['Int']['output'];
  /** Whether the asset is an image or a video. */
  type: Scalars['String']['output'];
  /** When the asset was last modified. */
  updatedAt: Scalars['DateTime']['output'];
  /** The source URL of the media asset. */
  url: Scalars['String']['output'];
  /** Optimistic-lock revision counter, incremented on each update. */
  version: Scalars['Int']['output'];
};

export type ProductMediaConnection = {
  __typename?: 'ProductMediaConnection';
  edges: Array<ProductMediaConnectionEdge>;
  pageInfo: PageInfo;
};

export type ProductMediaConnectionEdge = {
  __typename?: 'ProductMediaConnectionEdge';
  cursor: Scalars['String']['output'];
  node: ProductMedia;
};

/** The kind of a product/variant media asset: IMAGE or VIDEO. */
export enum ProductMediaType {
  Image = 'IMAGE',
  Video = 'VIDEO'
}

export type ProductNotAdoptedError = Error & {
  __typename?: 'ProductNotAdoptedError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type ProductNotFoundError = Error & {
  __typename?: 'ProductNotFoundError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** One ordering clause for the `products` connection (field + direction). Multiple clauses are applied in order. */
export type ProductOrderByInput = {
  /** Ascending or descending. */
  direction: ProductOrderDirection;
  /** The product field to sort by. */
  field: ProductOrderField;
};

/** Sort direction: ascending or descending. */
export enum ProductOrderDirection {
  Asc = 'ASC',
  Desc = 'DESC'
}

/** A field the `products` connection can be ordered by. */
export enum ProductOrderField {
  CreatedAt = 'CREATED_AT',
  Name = 'NAME'
}

export type ProductSkuTakenError = Error & {
  __typename?: 'ProductSkuTakenError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** A central pivot that declares which attributes apply to its products and variants. A type is global (organizationId null) or org-owned, and an org can extend a global type with its own attribute declarations. */
export type ProductType = Node & {
  __typename?: 'ProductType';
  /** Attribute declarations for this type, ordered by position, covering both base declarations and org grafts. */
  attributes: ProductTypeAttributesConnection;
  /** When the product type was created. */
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** Marks the type as physical goods that require shipping. */
  isShippingRequired: Scalars['Boolean']['output'];
  /** Human-readable name of the product type. */
  name: Scalars['String']['output'];
  /** Owning organization, or null when the type is global. */
  organizationId?: Maybe<Scalars['Int']['output']>;
  /** URL-friendly identifier for the product type. */
  slug: Scalars['String']['output'];
  /** When the product type was last updated. */
  updatedAt: Scalars['DateTime']['output'];
  /** Optimistic-lock version, incremented on each update. */
  version: Scalars['Int']['output'];
};


/** A central pivot that declares which attributes apply to its products and variants. A type is global (organizationId null) or org-owned, and an org can extend a global type with its own attribute declarations. */
export type ProductTypeAttributesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};

export type ProductTypeAlreadyGlobalError = Error & {
  __typename?: 'ProductTypeAlreadyGlobalError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** Declares that an attribute applies to a product type, either to its products or its variants. Base declarations belong to the type itself; org extensions graft additional declarations onto a (typically global) type. */
export type ProductTypeAttribute = Node & {
  __typename?: 'ProductTypeAttribute';
  /** Whether this attribute applies at the PRODUCT or VARIANT level. */
  assignment: Scalars['String']['output'];
  /** Cross-module reference to the @czo/attribute attribute being declared; resolved out-of-band by the client. */
  attributeId: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  /** Owning organization for an org graft, or null for a base declaration that ships with the type. */
  organizationId?: Maybe<Scalars['Int']['output']>;
  /** Ordering of this declaration within its product type. */
  position: Scalars['Int']['output'];
  /** When true, this attribute participates in the variant selection matrix used to generate variants. */
  variantSelection: Scalars['Boolean']['output'];
};

export type ProductTypeAttributesConnection = {
  __typename?: 'ProductTypeAttributesConnection';
  edges: Array<ProductTypeAttributesConnectionEdge>;
  pageInfo: PageInfo;
};

export type ProductTypeAttributesConnectionEdge = {
  __typename?: 'ProductTypeAttributesConnectionEdge';
  cursor: Scalars['String']['output'];
  node: ProductTypeAttribute;
};

export type ProductTypeNotFoundError = Error & {
  __typename?: 'ProductTypeNotFoundError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type ProductTypeNotGlobalError = Error & {
  __typename?: 'ProductTypeNotGlobalError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** One ordering clause for the `productTypes` connection (field + direction). Multiple clauses are applied in order. */
export type ProductTypeOrderByInput = {
  /** Ascending or descending. */
  direction: ProductTypeOrderDirection;
  /** The product-type field to sort by. */
  field: ProductTypeOrderField;
};

/** Sort direction: ascending or descending. */
export enum ProductTypeOrderDirection {
  Asc = 'ASC',
  Desc = 'DESC'
}

/** A field the `productTypes` connection can be ordered by. */
export enum ProductTypeOrderField {
  CreatedAt = 'CREATED_AT',
  Name = 'NAME'
}

export type ProductTypeSlugTakenError = Error & {
  __typename?: 'ProductTypeSlugTakenError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** Filter predicate for the `productTypes` connection. Field filters are AND-combined; use AND/OR/NOT to compose arbitrary boolean trees. */
export type ProductTypeWhereInput = {
  /** All sub-predicates must match. */
  AND?: InputMaybe<Array<ProductTypeWhereInput>>;
  /** The sub-predicate must not match. */
  NOT?: InputMaybe<ProductTypeWhereInput>;
  /** At least one sub-predicate must match. */
  OR?: InputMaybe<Array<ProductTypeWhereInput>>;
  /** Filter by the isShippingRequired flag. */
  isShippingRequired?: InputMaybe<BooleanFilterInput>;
};

/** A purchasable variant of a product, identified by a unique option selection (attribute/value pairs) among its siblings. Carries org-overlay graft connections for attribute values, price sets, and inventory links. */
export type ProductVariant = Node & {
  __typename?: 'ProductVariant';
  /** A single assigned attribute by slug (PDP accessor). Same scoping as `assignedAttributes`. */
  assignedAttribute?: Maybe<AssignedAttribute>;
  /** The variant's attributes with typed values resolved inline. Pass `channel` for the storefront (the org that published the product there) or `viewerOrg` for a specific org; omit for base. */
  assignedAttributes: Array<AssignedAttribute>;
  /** Timestamp when this variant was created. */
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** Inventory links for this variant scoped to the publishing/viewer organization; these are pure org grafts with no base rows, so resolving no org yields none. Pass `channel` for the storefront or `viewerOrg` for a specific org. */
  inventoryItems: ProductVariantInventoryItemsConnection;
  /** Media assets linked to this variant via the global link table; not org-scoped. */
  media: ProductVariantMediaConnection;
  /** Display name of the variant in the requested locale, or null when no translation exists. */
  name?: Maybe<Scalars['String']['output']>;
  /** Owning organization, or null for a base (org-null) variant. */
  organizationId?: Maybe<Scalars['Int']['output']>;
  /** Sort order of this variant among its siblings. */
  position: Scalars['Int']['output'];
  /** The viewer organization's price-set binding for this variant (unique per org), or null when no viewer org is given or no binding exists. */
  priceSet?: Maybe<VariantPriceSet>;
  /** The product this variant belongs to. */
  product: Product;
  /** Stock-keeping unit identifying this variant; null when unset. */
  sku?: Maybe<Scalars['String']['output']>;
  /** Timestamp when this variant was last updated. */
  updatedAt: Scalars['DateTime']['output'];
  /** Optimistic-lock version, incremented on each update. */
  version: Scalars['Int']['output'];
};


/** A purchasable variant of a product, identified by a unique option selection (attribute/value pairs) among its siblings. Carries org-overlay graft connections for attribute values, price sets, and inventory links. */
export type ProductVariantAssignedAttributeArgs = {
  channel?: InputMaybe<Scalars['Int']['input']>;
  slug: Scalars['String']['input'];
  viewerOrg?: InputMaybe<Scalars['ID']['input']>;
};


/** A purchasable variant of a product, identified by a unique option selection (attribute/value pairs) among its siblings. Carries org-overlay graft connections for attribute values, price sets, and inventory links. */
export type ProductVariantAssignedAttributesArgs = {
  channel?: InputMaybe<Scalars['Int']['input']>;
  viewerOrg?: InputMaybe<Scalars['ID']['input']>;
};


/** A purchasable variant of a product, identified by a unique option selection (attribute/value pairs) among its siblings. Carries org-overlay graft connections for attribute values, price sets, and inventory links. */
export type ProductVariantInventoryItemsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  channel?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  viewerOrg?: InputMaybe<Scalars['ID']['input']>;
};


/** A purchasable variant of a product, identified by a unique option selection (attribute/value pairs) among its siblings. Carries org-overlay graft connections for attribute values, price sets, and inventory links. */
export type ProductVariantMediaArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


/** A purchasable variant of a product, identified by a unique option selection (attribute/value pairs) among its siblings. Carries org-overlay graft connections for attribute values, price sets, and inventory links. */
export type ProductVariantNameArgs = {
  locale?: InputMaybe<Scalars['String']['input']>;
};


/** A purchasable variant of a product, identified by a unique option selection (attribute/value pairs) among its siblings. Carries org-overlay graft connections for attribute values, price sets, and inventory links. */
export type ProductVariantPriceSetArgs = {
  channel?: InputMaybe<Scalars['Int']['input']>;
  viewerOrg?: InputMaybe<Scalars['ID']['input']>;
};

export type ProductVariantInventoryItemsConnection = {
  __typename?: 'ProductVariantInventoryItemsConnection';
  edges: Array<ProductVariantInventoryItemsConnectionEdge>;
  pageInfo: PageInfo;
};

export type ProductVariantInventoryItemsConnectionEdge = {
  __typename?: 'ProductVariantInventoryItemsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: VariantInventoryItem;
};

export type ProductVariantMediaConnection = {
  __typename?: 'ProductVariantMediaConnection';
  edges: Array<ProductVariantMediaConnectionEdge>;
  pageInfo: PageInfo;
};

export type ProductVariantMediaConnectionEdge = {
  __typename?: 'ProductVariantMediaConnectionEdge';
  cursor: Scalars['String']['output'];
  node: VariantMedia;
};

export type ProductVariantsConnection = {
  __typename?: 'ProductVariantsConnection';
  edges: Array<ProductVariantsConnectionEdge>;
  pageInfo: PageInfo;
};

export type ProductVariantsConnectionEdge = {
  __typename?: 'ProductVariantsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: ProductVariant;
};

/** Filter predicate for the product connections. Field filters are AND-combined; use AND/OR/NOT to compose arbitrary boolean trees. */
export type ProductWhereInput = {
  /** All sub-predicates must match. */
  AND?: InputMaybe<Array<ProductWhereInput>>;
  /** The sub-predicate must not match. */
  NOT?: InputMaybe<ProductWhereInput>;
  /** At least one sub-predicate must match. */
  OR?: InputMaybe<Array<ProductWhereInput>>;
  /** Facet by attributes and their typed values. Each entry is one facet; entries are AND-ed. Only `isFilterable` attributes match. */
  attributes?: InputMaybe<Array<ProductAttributeWhereInput>>;
  /** Filter to products assigned to the given categories (relay ids). */
  categories?: InputMaybe<IdFilterInput>;
  /** Filter to products in the given collections (relay ids). */
  collections?: InputMaybe<IdFilterInput>;
  /** Filter by URL handle. */
  handle?: InputMaybe<StringFilterInput>;
  /** Filter by display name (base column; not locale-overlaid). */
  name?: InputMaybe<StringFilterInput>;
  /** Filter by the referenced product type (relay id). */
  productType?: InputMaybe<IdFilterInput>;
};

export type Query = {
  __typename?: 'Query';
  /** Paginated (relay) connection over the global products an org has adopted. Requires `product:read` in the given org. */
  adoptedProducts: QueryAdoptedProductsConnection;
  /** Fetch a single attribute by relay id or by slug. Access is gated on `attribute:read` for the looked-up row's own scope: a platform (org-null) attribute needs the global role, an org-owned one needs the role in its org. Returns null when no match is visible. */
  attribute?: Maybe<Attribute>;
  /** Paginated (relay) connection over platform attributes (owned by no organization). Requires the global attribute:read role. */
  attributes: QueryAttributesConnection;
  /** Paginated (relay) connection over the GLOBAL (platform) categories, for platform curation, with optional free-text search, filtering, and ordering. Requires the global `product:read` role. */
  categories: QueryCategoriesConnection;
  /** Fetch a single category by id (admin). A global category requires the global `product:read` role; an org-owned one requires `product:read` in its org. Returns null if not found or soft-deleted. */
  category?: Maybe<Category>;
  /** Fetch a single channel by id. Requires `channel:read` in the channel's owning organization. Returns null if not found or soft-deleted. */
  channel?: Maybe<Channel>;
  /** Fetch a single collection by id (admin). Collections are org-only; requires `product:read` in the owning org. Returns null if not found or soft-deleted. */
  collection?: Maybe<Collection>;
  /** Paginated (relay) connection over an org's collections (admin). Collections are org-only (no global tier), with optional free-text search and ordering. Requires `product:read` in the given org. */
  collections: QueryCollectionsConnection;
  /** The platform default locale, used as the fallback when a translation is missing. Null if none is configured. Public read. */
  defaultLocale?: Maybe<Locale>;
  /** Fetch a single locale by id. Public read; returns null if not found. */
  locale?: Maybe<Locale>;
  /** Paginated (relay) connection over the platform locale registry. Public read. */
  locales: QueryLocalesConnection;
  /** The currently authenticated user (viewer), or null when the request is anonymous. Reads the resolved session principal; any authenticated caller may read itself. */
  me?: Maybe<User>;
  node?: Maybe<Node>;
  nodes: Array<Maybe<Node>>;
  /** Lists platform-wide channels (no owning organization), with optional free-text search, filtering, and ordering. Requires the global `channel:read` role. */
  platformChannels: QueryPlatformChannelsConnection;
  /** Fetch a single product by id (admin). A global product requires the global `product:read` role; an org-owned one requires `product:read` in its org. Returns null if not found or soft-deleted. */
  product?: Maybe<Product>;
  /** Fetch a single product type by id (admin). A global type requires the global `product:read` role; an org-owned one requires `product:read` in its org. Returns null if not found or soft-deleted. */
  productType?: Maybe<ProductType>;
  /** Paginated (relay) connection over the GLOBAL (platform) product types, for platform curation, with optional free-text search, filtering, and ordering. Requires the global `product:read` role. */
  productTypes: QueryProductTypesConnection;
  /** Paginated (relay) connection over the GLOBAL (platform) products, for platform curation, with optional free-text search, filtering, and ordering. Requires the global `product:read` role. */
  products: QueryProductsConnection;
  /** Registered global platform-role hierarchies and their assignable tiers, for the admin role picker. Excludes the per-organization `organization` and the `api-key` hierarchies. */
  roleHierarchies: Array<RoleHierarchy>;
  /** Paginated (relay) connection over the taxonomy requests awaiting platform review, with optional filtering and ordering. Requires the global `product:read` role. */
  taxonomyRequests: QueryTaxonomyRequestsConnection;
  /** Fetches a single user by their global ID, returning null if no such user exists. */
  user?: Maybe<User>;
  /** Live user totals per admin filter bucket (all/admins/unverified/banned), independent of pagination, search, or the active tab. */
  userCounts: UserCounts;
  /** Returns a paginated connection of users, with optional full-text search, filtering, and ordering. */
  users: QueryUsersConnection;
};


export type QueryAdoptedProductsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProductOrderByInput>>;
  organization: Scalars['ID']['input'];
  search?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<ProductWhereInput>;
};


export type QueryAttributeArgs = {
  id?: InputMaybe<Scalars['ID']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
};


export type QueryAttributesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<AttributeOrderByInput>>;
  where?: InputMaybe<AttributeWhereInput>;
};


export type QueryCategoriesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<CategoryOrderByInput>>;
  search?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<CategoryWhereInput>;
};


export type QueryCategoryArgs = {
  id: Scalars['ID']['input'];
};


export type QueryChannelArgs = {
  id: Scalars['ID']['input'];
};


export type QueryCollectionArgs = {
  id: Scalars['ID']['input'];
};


export type QueryCollectionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<CollectionOrderByInput>>;
  organization: Scalars['ID']['input'];
  search?: InputMaybe<Scalars['String']['input']>;
};


export type QueryLocaleArgs = {
  id: Scalars['ID']['input'];
};


export type QueryLocalesArgs = {
  activeOnly?: InputMaybe<Scalars['Boolean']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryNodeArgs = {
  id: Scalars['ID']['input'];
};


export type QueryNodesArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type QueryPlatformChannelsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ChannelOrderByInput>>;
  search?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<ChannelWhereInput>;
};


export type QueryProductArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProductTypeArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProductTypesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProductTypeOrderByInput>>;
  search?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<ProductTypeWhereInput>;
};


export type QueryProductsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProductOrderByInput>>;
  search?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<ProductWhereInput>;
};


export type QueryTaxonomyRequestsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TaxonomyRequestOrderByInput>>;
  where?: InputMaybe<TaxonomyRequestWhereInput>;
};


export type QueryUserArgs = {
  id: Scalars['ID']['input'];
};


export type QueryUsersArgs = {
  admin?: InputMaybe<Scalars['Boolean']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<UserOrderByInput>>;
  search?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<UserWhereInput>;
};

export type QueryAdoptedProductsConnection = {
  __typename?: 'QueryAdoptedProductsConnection';
  edges: Array<QueryAdoptedProductsConnectionEdge>;
  pageInfo: PageInfo;
};

export type QueryAdoptedProductsConnectionEdge = {
  __typename?: 'QueryAdoptedProductsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: Product;
};

export type QueryAttributesConnection = {
  __typename?: 'QueryAttributesConnection';
  edges: Array<QueryAttributesConnectionEdge>;
  pageInfo: PageInfo;
};

export type QueryAttributesConnectionEdge = {
  __typename?: 'QueryAttributesConnectionEdge';
  cursor: Scalars['String']['output'];
  node: Attribute;
};

export type QueryCategoriesConnection = {
  __typename?: 'QueryCategoriesConnection';
  edges: Array<QueryCategoriesConnectionEdge>;
  pageInfo: PageInfo;
};

export type QueryCategoriesConnectionEdge = {
  __typename?: 'QueryCategoriesConnectionEdge';
  cursor: Scalars['String']['output'];
  node: Category;
};

export type QueryCollectionsConnection = {
  __typename?: 'QueryCollectionsConnection';
  edges: Array<QueryCollectionsConnectionEdge>;
  pageInfo: PageInfo;
};

export type QueryCollectionsConnectionEdge = {
  __typename?: 'QueryCollectionsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: Collection;
};

export type QueryLocalesConnection = {
  __typename?: 'QueryLocalesConnection';
  edges: Array<QueryLocalesConnectionEdge>;
  pageInfo: PageInfo;
};

export type QueryLocalesConnectionEdge = {
  __typename?: 'QueryLocalesConnectionEdge';
  cursor: Scalars['String']['output'];
  node: Locale;
};

export type QueryPlatformChannelsConnection = {
  __typename?: 'QueryPlatformChannelsConnection';
  edges: Array<QueryPlatformChannelsConnectionEdge>;
  pageInfo: PageInfo;
};

export type QueryPlatformChannelsConnectionEdge = {
  __typename?: 'QueryPlatformChannelsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: Channel;
};

export type QueryProductTypesConnection = {
  __typename?: 'QueryProductTypesConnection';
  edges: Array<QueryProductTypesConnectionEdge>;
  pageInfo: PageInfo;
};

export type QueryProductTypesConnectionEdge = {
  __typename?: 'QueryProductTypesConnectionEdge';
  cursor: Scalars['String']['output'];
  node: ProductType;
};

export type QueryProductsConnection = {
  __typename?: 'QueryProductsConnection';
  edges: Array<QueryProductsConnectionEdge>;
  pageInfo: PageInfo;
};

export type QueryProductsConnectionEdge = {
  __typename?: 'QueryProductsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: Product;
};

export type QueryTaxonomyRequestsConnection = {
  __typename?: 'QueryTaxonomyRequestsConnection';
  edges: Array<QueryTaxonomyRequestsConnectionEdge>;
  pageInfo: PageInfo;
};

export type QueryTaxonomyRequestsConnectionEdge = {
  __typename?: 'QueryTaxonomyRequestsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: TaxonomyRequest;
};

export type QueryUsersConnection = {
  __typename?: 'QueryUsersConnection';
  edges: Array<QueryUsersConnectionEdge>;
  pageInfo: PageInfo;
};

export type QueryUsersConnectionEdge = {
  __typename?: 'QueryUsersConnectionEdge';
  cursor: Scalars['String']['output'];
  node: User;
};

export type ReferenceEntityNotAllowedError = Error & {
  __typename?: 'ReferenceEntityNotAllowedError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type ReferenceEntityRequiredError = Error & {
  __typename?: 'ReferenceEntityRequiredError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type RejectListingInput = {
  /** Global ID of the ProductChannelListing to reject. */
  listingId: Scalars['ID']['input'];
  /** Why the listing is rejected; surfaced to the owning org. */
  reason: Scalars['String']['input'];
};

export type RejectListingPayload = {
  __typename?: 'RejectListingPayload';
  /** The rejected listing. */
  listing: ProductChannelListing;
};

export type RejectListingResult = ChannelListingNotFoundError | NotAMarketplaceChannelError | RejectListingSuccess;

export type RejectListingSuccess = {
  __typename?: 'RejectListingSuccess';
  data: RejectListingPayload;
};

export type RejectTaxonomyRequestInput = {
  /** Why the request is rejected; surfaced to the org. */
  reason: Scalars['String']['input'];
  /** Global ID of the request to reject. */
  requestId: Scalars['ID']['input'];
};

export type RejectTaxonomyRequestPayload = {
  __typename?: 'RejectTaxonomyRequestPayload';
  /** The rejected request. */
  request: TaxonomyRequest;
};

export type RejectTaxonomyRequestResult = RejectTaxonomyRequestSuccess | TaxonomyRequestNotFoundError | TaxonomyRequestNotPendingError;

export type RejectTaxonomyRequestSuccess = {
  __typename?: 'RejectTaxonomyRequestSuccess';
  data: RejectTaxonomyRequestPayload;
};

export type RemoveCategoryTranslationInput = {
  /** Global ID of the Category node whose translation is being removed. */
  categoryId: Scalars['ID']['input'];
  /** Registered locale code identifying which translation to delete. */
  localeCode: Scalars['String']['input'];
};

export type RemoveCategoryTranslationPayload = {
  __typename?: 'RemoveCategoryTranslationPayload';
  /** True when the translation operation completed successfully. */
  success: Scalars['Boolean']['output'];
};

export type RemoveCategoryTranslationResult = RemoveCategoryTranslationSuccess;

export type RemoveCategoryTranslationSuccess = {
  __typename?: 'RemoveCategoryTranslationSuccess';
  data: RemoveCategoryTranslationPayload;
};

export type RemoveMediaInput = {
  /** References the ProductMedia node to remove. */
  id: Scalars['ID']['input'];
  /** The expected current version for optimistic-locking; the removal fails if it does not match. */
  version: Scalars['Int']['input'];
};

export type RemoveMediaPayload = {
  __typename?: 'RemoveMediaPayload';
  /** The soft-deleted product media asset. */
  media: ProductMedia;
};

export type RemoveMediaResult = MediaNotFoundError | OptimisticLockError | RemoveMediaSuccess;

export type RemoveMediaSuccess = {
  __typename?: 'RemoveMediaSuccess';
  data: RemoveMediaPayload;
};

export type RemovePlacementInput = {
  /** References the Category node the product is removed from. */
  categoryId: Scalars['ID']['input'];
  /** References an Organization node; when null the global base placement is removed, otherwise the org-specific graft is removed. */
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  /** The id of the product whose placement is removed. */
  productId: Scalars['Int']['input'];
};

export type RemovePlacementPayload = {
  __typename?: 'RemovePlacementPayload';
  /** Whether the placement was removed. */
  success: Scalars['Boolean']['output'];
};

export type RemovePlacementResult = RemovePlacementSuccess;

export type RemovePlacementSuccess = {
  __typename?: 'RemovePlacementSuccess';
  data: RemovePlacementPayload;
};

export type RemoveProductTranslationInput = {
  /** Registered locale code identifying which translation to delete. */
  localeCode: Scalars['String']['input'];
  /** Global ID of the Product node whose translation is being removed. */
  productId: Scalars['ID']['input'];
};

export type RemoveProductTranslationPayload = {
  __typename?: 'RemoveProductTranslationPayload';
  /** True when the translation operation completed successfully. */
  success: Scalars['Boolean']['output'];
};

export type RemoveProductTranslationResult = RemoveProductTranslationSuccess;

export type RemoveProductTranslationSuccess = {
  __typename?: 'RemoveProductTranslationSuccess';
  data: RemoveProductTranslationPayload;
};

export type RemoveUserInput = {
  /** Global ID of the user to remove. */
  id: Scalars['ID']['input'];
};

export type RemoveUserPayload = {
  __typename?: 'RemoveUserPayload';
  /** Whether the user was successfully removed. */
  success: Scalars['Boolean']['output'];
};

export type RemoveUserResult = CannotRemoveSelfError | RemoveUserSuccess | UserNotFoundError;

export type RemoveUserSuccess = {
  __typename?: 'RemoveUserSuccess';
  data: RemoveUserPayload;
};

export type RemoveVariantTranslationInput = {
  /** Registered locale code identifying which translation to delete. */
  localeCode: Scalars['String']['input'];
  /** Global ID of the ProductVariant node whose translation is being removed. */
  variantId: Scalars['ID']['input'];
};

export type RemoveVariantTranslationPayload = {
  __typename?: 'RemoveVariantTranslationPayload';
  /** True when the translation operation completed successfully. */
  success: Scalars['Boolean']['output'];
};

export type RemoveVariantTranslationResult = RemoveVariantTranslationSuccess;

export type RemoveVariantTranslationSuccess = {
  __typename?: 'RemoveVariantTranslationSuccess';
  data: RemoveVariantTranslationPayload;
};

export type ReorderAttributeReferencesInput = {
  /** The attribute whose reference values are being reordered. */
  attributeId: Scalars['ID']['input'];
  /** The reference value ids in their desired display order. */
  orderedIds: Array<Scalars['ID']['input']>;
};

export type ReorderAttributeReferencesPayload = {
  __typename?: 'ReorderAttributeReferencesPayload';
  /** True when the references were reordered. */
  success: Scalars['Boolean']['output'];
};

export type ReorderAttributeSwatchesInput = {
  /** The attribute whose swatch values are being reordered. */
  attributeId: Scalars['ID']['input'];
  /** The swatch value ids in their desired display order. */
  orderedIds: Array<Scalars['ID']['input']>;
};

export type ReorderAttributeSwatchesPayload = {
  __typename?: 'ReorderAttributeSwatchesPayload';
  /** True when the swatches were reordered. */
  success: Scalars['Boolean']['output'];
};

export type ReorderAttributeValuesInput = {
  /** The attribute whose choice values are being reordered. */
  attributeId: Scalars['ID']['input'];
  /** The choice value ids in their desired display order. */
  orderedIds: Array<Scalars['ID']['input']>;
};

export type ReorderAttributeValuesPayload = {
  __typename?: 'ReorderAttributeValuesPayload';
  /** True when the values were reordered. */
  success: Scalars['Boolean']['output'];
};

export type ResendInvitationInput = {
  /** Global ID of the user to (re)invite. */
  id: Scalars['ID']['input'];
};

export type ResendInvitationPayload = {
  __typename?: 'ResendInvitationPayload';
  /** Whether the invitation was dispatched. */
  success: Scalars['Boolean']['output'];
};

export type ResendInvitationResult = ResendInvitationSuccess | UserNotFoundError;

export type ResendInvitationSuccess = {
  __typename?: 'ResendInvitationSuccess';
  data: ResendInvitationPayload;
};

export type RevokeSessionInput = {
  /** Token of the specific session to revoke. */
  sessionToken: Scalars['String']['input'];
};

export type RevokeSessionPayload = {
  __typename?: 'RevokeSessionPayload';
  /** Whether the session was successfully revoked. */
  success: Scalars['Boolean']['output'];
};

export type RevokeSessionsInput = {
  /** Global ID of the user whose sessions should all be revoked. */
  id: Scalars['ID']['input'];
};

export type RevokeSessionsPayload = {
  __typename?: 'RevokeSessionsPayload';
  success: Scalars['Boolean']['output'];
};

export type RoleAssignmentDeniedError = Error & {
  __typename?: 'RoleAssignmentDeniedError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  roles: Array<Scalars['String']['output']>;
};

/** A role hierarchy (domain) and its assignable tiers in cumulative order. A user may hold at most one tier per hierarchy. */
export type RoleHierarchy = {
  __typename?: 'RoleHierarchy';
  /** Hierarchy/domain name (e.g. "admin", "product"). */
  name: Scalars['String']['output'];
  /** Assignable tiers, lowest → highest. */
  tiers: Array<RoleTier>;
};

/** A single assignable role tier, e.g. "admin:manager". Tiers within a hierarchy are cumulative (higher tiers include lower ones). */
export type RoleTier = {
  __typename?: 'RoleTier';
  /** Full CSV role token stored on the user (e.g. "admin:manager"). */
  name: Scalars['String']['output'];
};

/** An authenticated session belonging to a user, viewed in an admin-scoped context. */
export type Session = {
  __typename?: 'Session';
  /** Type of actor that owns the session, distinguishing users from other principals. */
  actorType: Scalars['String']['output'];
  /** Timestamp at which the session was created. */
  createdAt: Scalars['DateTime']['output'];
  /** Timestamp at which the session expires and is no longer valid. */
  expiresAt: Scalars['DateTime']['output'];
  /** Unique identifier of the session. */
  id: Scalars['ID']['output'];
  /** Identifier of the admin user impersonating the session owner, if this is an impersonation session. */
  impersonatedBy?: Maybe<Scalars['String']['output']>;
  /** IP address from which the session was established. */
  ipAddress?: Maybe<Scalars['String']['output']>;
  /** User-agent string of the client that established the session. */
  userAgent?: Maybe<Scalars['String']['output']>;
  /** Identifier of the user that owns this session. */
  userId: Scalars['String']['output'];
};

export type SetCategoryParentInput = {
  /** References the Category node to re-parent. */
  id: Scalars['ID']['input'];
  /** The id of the new parent category; pass null to detach the category to the root. */
  parentId?: InputMaybe<Scalars['Int']['input']>;
  /** The expected current version for optimistic-lock checking; a stale value is rejected. */
  version: Scalars['Int']['input'];
};

export type SetCategoryParentPayload = {
  __typename?: 'SetCategoryParentPayload';
  /** The re-parented category. */
  category: Category;
};

export type SetCategoryParentResult = CategoryCycleError | CategoryNotFoundError | OptimisticLockError | SetCategoryParentSuccess;

export type SetCategoryParentSuccess = {
  __typename?: 'SetCategoryParentSuccess';
  data: SetCategoryParentPayload;
};

export type SetRoleInput = {
  /** Global ID of the user whose role is being set. */
  id: Scalars['ID']['input'];
  /** Global platform roles to assign to the user (at most one tier per hierarchy); replaces the user's current role set. */
  role: Array<Scalars['String']['input']>;
};

export type SetRolePayload = {
  __typename?: 'SetRolePayload';
  /** The user with their updated global role. */
  user: User;
};

export type SetRoleResult = CannotDemoteSelfError | ForbiddenError | InvalidRoleError | RoleAssignmentDeniedError | SetRoleSuccess | UserNotFoundError;

export type SetRoleSuccess = {
  __typename?: 'SetRoleSuccess';
  data: SetRolePayload;
};

export type SetUserPasswordInput = {
  /** Global ID of the user whose password is being set. */
  id: Scalars['ID']['input'];
  /** New password to set on the user's credential account. */
  newPassword: Scalars['String']['input'];
};

export type SetUserPasswordPayload = {
  __typename?: 'SetUserPasswordPayload';
  /** Whether the password was successfully set. */
  success: Scalars['Boolean']['output'];
};

export type SetUserPasswordResult = PasswordHashFailedError | SetUserPasswordSuccess | UserNotFoundError;

export type SetUserPasswordSuccess = {
  __typename?: 'SetUserPasswordSuccess';
  data: SetUserPasswordPayload;
};

export type StartImpersonationInput = {
  /** Optional human-readable reason recorded for audit purposes. */
  reason?: InputMaybe<Scalars['String']['input']>;
  /** The global ID of the user to impersonate. */
  targetUserId: Scalars['ID']['input'];
  /** Optional lifetime of the impersonation session, in seconds. */
  ttl?: InputMaybe<Scalars['Int']['input']>;
};

export type StartImpersonationPayload = {
  __typename?: 'StartImpersonationPayload';
  /** The newly minted child session that acts as the impersonated user. */
  session: Session;
  /** The target user now being impersonated. */
  user: User;
};

export type StartImpersonationResult = CannotChainImpersonationError | CannotImpersonateAdminError | CannotImpersonateBannedUserError | CannotImpersonateSelfError | ImpersonationTtlTooLongError | StartImpersonationSuccess | UserNotFoundError;

export type StartImpersonationSuccess = {
  __typename?: 'StartImpersonationSuccess';
  data: StartImpersonationPayload;
};

export type StopImpersonationInput = {
  /** Optional client-supplied identifier echoed back by the relay mutation. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
};

export type StopImpersonationPayload = {
  __typename?: 'StopImpersonationPayload';
  /** The restored parent (admin) session. */
  session: Session;
  /** The admin user the session reverts to. */
  user: User;
};

export type StopImpersonationResult = ImpersonationNotActiveError | StopImpersonationSuccess;

export type StopImpersonationSuccess = {
  __typename?: 'StopImpersonationSuccess';
  data: StopImpersonationPayload;
};

export type StringFilterInput = {
  AND?: InputMaybe<Array<StringFilterInput>>;
  NOT?: InputMaybe<StringFilterInput>;
  OR?: InputMaybe<Array<StringFilterInput>>;
  eq?: InputMaybe<Scalars['String']['input']>;
  ilike?: InputMaybe<Scalars['String']['input']>;
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  like?: InputMaybe<Scalars['String']['input']>;
  ne?: InputMaybe<Scalars['String']['input']>;
  notIlike?: InputMaybe<Scalars['String']['input']>;
  notIn?: InputMaybe<Array<Scalars['String']['input']>>;
  notLike?: InputMaybe<Scalars['String']['input']>;
};

export type SuspendListingInput = {
  /** Global ID of the ProductChannelListing to suspend. */
  listingId: Scalars['ID']['input'];
  /** Why the listing is suspended; surfaced to the owning org. */
  reason: Scalars['String']['input'];
};

export type SuspendListingPayload = {
  __typename?: 'SuspendListingPayload';
  /** The suspended listing. */
  listing: ProductChannelListing;
};

export type SuspendListingResult = ChannelListingNotFoundError | NotAMarketplaceChannelError | SuspendListingSuccess;

export type SuspendListingSuccess = {
  __typename?: 'SuspendListingSuccess';
  data: SuspendListingPayload;
};

export type SwatchRequiresColorOrFileError = Error & {
  __typename?: 'SwatchRequiresColorOrFileError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type SwatchVisualInvalidError = Error & {
  __typename?: 'SwatchVisualInvalidError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  reason: Scalars['String']['output'];
};

/** The taxonomy entity a request concerns. */
export enum TaxonomyEntityType {
  Category = 'CATEGORY',
  ProductType = 'PRODUCT_TYPE'
}

/** An org's request to create or promote a global taxonomy entity, awaiting platform review. */
export type TaxonomyRequest = Node & {
  __typename?: 'TaxonomyRequest';
  /** The taxonomy entity concerned. */
  entityType: TaxonomyEntityType;
  id: Scalars['ID']['output'];
  /** Create a new global entity, or promote an existing org one. */
  kind: TaxonomyRequestKind;
  /** The organization that submitted the request. */
  organizationId: Scalars['Int']['output'];
  /** For a creation: the proposed name. */
  proposedName?: Maybe<Scalars['String']['output']>;
  /** For a creation: the proposed slug. */
  proposedSlug?: Maybe<Scalars['String']['output']>;
  /** The resulting global entity id once approved. */
  resultId?: Maybe<Scalars['Int']['output']>;
  /** Why the request was rejected; null otherwise. */
  reviewReason?: Maybe<Scalars['String']['output']>;
  /** When an admin reviewed it, or null while pending. */
  reviewedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Pending, approved, or rejected. */
  state: TaxonomyRequestState;
  /** For a promotion: the org-tier entity id to promote. */
  targetId?: Maybe<Scalars['Int']['output']>;
};

/** Whether the request asks to CREATE a new global taxonomy or PROMOTE an existing org one. */
export enum TaxonomyRequestKind {
  Create = 'CREATE',
  Promote = 'PROMOTE'
}

export type TaxonomyRequestNotFoundError = Error & {
  __typename?: 'TaxonomyRequestNotFoundError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type TaxonomyRequestNotPendingError = Error & {
  __typename?: 'TaxonomyRequestNotPendingError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** One ordering clause for the taxonomy-request connections (field + direction). Multiple clauses are applied in order. */
export type TaxonomyRequestOrderByInput = {
  /** Ascending or descending. */
  direction: TaxonomyRequestOrderDirection;
  /** The taxonomy-request field to sort by. */
  field: TaxonomyRequestOrderField;
};

/** Sort direction: ascending or descending. */
export enum TaxonomyRequestOrderDirection {
  Asc = 'ASC',
  Desc = 'DESC'
}

/** A field the taxonomy-request connections can be ordered by. */
export enum TaxonomyRequestOrderField {
  CreatedAt = 'CREATED_AT',
  ReviewedAt = 'REVIEWED_AT'
}

/** Moderation state of a taxonomy request. */
export enum TaxonomyRequestState {
  Approved = 'APPROVED',
  Pending = 'PENDING',
  Rejected = 'REJECTED'
}

/** Filter predicate for taxonomy-request connections. Field filters are AND-combined; use AND/OR/NOT to compose. */
export type TaxonomyRequestWhereInput = {
  /** All sub-predicates must match. */
  AND?: InputMaybe<Array<TaxonomyRequestWhereInput>>;
  /** The sub-predicate must not match. */
  NOT?: InputMaybe<TaxonomyRequestWhereInput>;
  /** At least one sub-predicate must match. */
  OR?: InputMaybe<Array<TaxonomyRequestWhereInput>>;
  /** Filter by entity type (equals). */
  entityType?: InputMaybe<TaxonomyEntityType>;
  /** Filter by request kind (equals). */
  kind?: InputMaybe<TaxonomyRequestKind>;
  /** Filter by review state (equals). */
  state?: InputMaybe<TaxonomyRequestState>;
};

export type TypedValueNotFoundError = Error & {
  __typename?: 'TypedValueNotFoundError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type UnassignProductValueInput = {
  /** The id of the assignment pivot row to remove. Select-type values keep the shared catalog row; scalar-type values delete the minted value row. */
  pivotId: Scalars['Int']['input'];
  /** The id of the owning product, used only to resolve the authorization organization. */
  subjectId: Scalars['Int']['input'];
};

export type UnassignProductValuePayload = {
  __typename?: 'UnassignProductValuePayload';
  /** True when the assignment was removed. */
  success: Scalars['Boolean']['output'];
};

export type UnassignProductValueResult = AssignmentNotFoundError | UnassignProductValueSuccess;

export type UnassignProductValueSuccess = {
  __typename?: 'UnassignProductValueSuccess';
  data: UnassignProductValuePayload;
};

export type UnassignVariantValueInput = {
  /** The id of the assignment pivot row to remove. Select-type values keep the shared catalog row; scalar-type values delete the minted value row. */
  pivotId: Scalars['Int']['input'];
  /** The id of the owning variant, used only to resolve the authorization organization. */
  subjectId: Scalars['Int']['input'];
};

export type UnassignVariantValuePayload = {
  __typename?: 'UnassignVariantValuePayload';
  /** True when the assignment was removed. */
  success: Scalars['Boolean']['output'];
};

export type UnassignVariantValueResult = AssignmentNotFoundError | UnassignVariantValueSuccess;

export type UnassignVariantValueSuccess = {
  __typename?: 'UnassignVariantValueSuccess';
  data: UnassignVariantValuePayload;
};

export type UnbanUserInput = {
  /** Global ID of the user to unban. */
  id: Scalars['ID']['input'];
};

export type UnbanUserPayload = {
  __typename?: 'UnbanUserPayload';
  /** The unbanned user. */
  user: User;
};

export type UnbanUserResult = UnbanUserSuccess | UserNotBannedError | UserNotFoundError;

export type UnbanUserSuccess = {
  __typename?: 'UnbanUserSuccess';
  data: UnbanUserPayload;
};

export type UndeclareAttributeInput = {
  /** Identifier of the attribute declaration to detach from the type. */
  attributeAssignmentId: Scalars['Int']['input'];
  /** References the ProductType node the attribute declaration belongs to. */
  productTypeId: Scalars['ID']['input'];
};

export type UndeclareAttributePayload = {
  __typename?: 'UndeclareAttributePayload';
  /** True when the attribute declaration was detached. */
  success: Scalars['Boolean']['output'];
};

export type UndeclareAttributeResult = UndeclareAttributeSuccess;

export type UndeclareAttributeSuccess = {
  __typename?: 'UndeclareAttributeSuccess';
  data: UndeclareAttributePayload;
};

export type UnitNotAllowedError = Error & {
  __typename?: 'UnitNotAllowedError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type UnlinkVariantMediaInput = {
  /** References the ProductMedia node to detach from the variant. */
  mediaId: Scalars['ID']['input'];
  /** References the ProductVariant node to detach the media asset from. */
  variantId: Scalars['ID']['input'];
};

export type UnlinkVariantMediaPayload = {
  __typename?: 'UnlinkVariantMediaPayload';
  /** True when the media asset was successfully unlinked from the variant. */
  success: Scalars['Boolean']['output'];
};

export type UnlinkVariantMediaResult = UnlinkVariantMediaSuccess;

export type UnlinkVariantMediaSuccess = {
  __typename?: 'UnlinkVariantMediaSuccess';
  data: UnlinkVariantMediaPayload;
};

export type UpdateAttributeBooleanValueInput = {
  /** The boolean value to update. */
  id: Scalars['ID']['input'];
  /** New boolean value; omit to leave it unchanged. */
  value?: InputMaybe<Scalars['Boolean']['input']>;
};

export type UpdateAttributeBooleanValuePayload = {
  __typename?: 'UpdateAttributeBooleanValuePayload';
  /** The updated boolean value. */
  value: AttributeBooleanValue;
};

export type UpdateAttributeBooleanValueResult = TypedValueNotFoundError | UpdateAttributeBooleanValueSuccess;

export type UpdateAttributeBooleanValueSuccess = {
  __typename?: 'UpdateAttributeBooleanValueSuccess';
  data: UpdateAttributeBooleanValuePayload;
};

export type UpdateAttributeDateValueInput = {
  /** The date value to update. */
  id: Scalars['ID']['input'];
  /** New date/time value; omit to leave it unchanged. */
  value?: InputMaybe<Scalars['DateTime']['input']>;
};

export type UpdateAttributeDateValuePayload = {
  __typename?: 'UpdateAttributeDateValuePayload';
  /** The updated date value. */
  value: AttributeDateValue;
};

export type UpdateAttributeDateValueResult = TypedValueNotFoundError | UpdateAttributeDateValueSuccess;

export type UpdateAttributeDateValueSuccess = {
  __typename?: 'UpdateAttributeDateValueSuccess';
  data: UpdateAttributeDateValuePayload;
};

export type UpdateAttributeFileValueInput = {
  /** New file (URL and MIME type); omit to leave it unchanged. */
  file?: InputMaybe<FileInfoInput>;
  /** The file value to update. */
  id: Scalars['ID']['input'];
};

export type UpdateAttributeFileValuePayload = {
  __typename?: 'UpdateAttributeFileValuePayload';
  /** The updated file value. */
  value: AttributeFileValue;
};

export type UpdateAttributeFileValueResult = TypedValueNotFoundError | UpdateAttributeFileValueSuccess;

export type UpdateAttributeFileValueSuccess = {
  __typename?: 'UpdateAttributeFileValueSuccess';
  data: UpdateAttributeFileValuePayload;
};

export type UpdateAttributeInput = {
  /** New external source identifier; left unchanged when omitted. */
  externalId?: InputMaybe<Scalars['String']['input']>;
  /** New external source name; left unchanged when omitted. */
  externalSource?: InputMaybe<Scalars['String']['input']>;
  /** Global id of the attribute to update. */
  id: Scalars['ID']['input'];
  /** New filterable flag; left unchanged when omitted. */
  isFilterable?: InputMaybe<Scalars['Boolean']['input']>;
  /** New required flag; left unchanged when omitted. */
  isRequired?: InputMaybe<Scalars['Boolean']['input']>;
  /** Replacement freeform JSON metadata; left unchanged when omitted. */
  metadata?: InputMaybe<Scalars['JSONObject']['input']>;
  /** New display name; left unchanged when omitted. */
  name?: InputMaybe<Scalars['String']['input']>;
  /** New measurement unit, applicable only to NUMBER-typed attributes; left unchanged when omitted. */
  unit?: InputMaybe<AttributeUnit>;
  /** Expected current version for optimistic-lock concurrency control. */
  version: Scalars['Int']['input'];
};

export type UpdateAttributeNumericValueInput = {
  /** The numeric value to update. */
  id: Scalars['ID']['input'];
  /** New numeric value; omit to leave it unchanged. */
  value?: InputMaybe<Scalars['Float']['input']>;
};

export type UpdateAttributeNumericValuePayload = {
  __typename?: 'UpdateAttributeNumericValuePayload';
  /** The updated numeric value. */
  value: AttributeNumericValue;
};

export type UpdateAttributeNumericValueResult = TypedValueNotFoundError | UpdateAttributeNumericValueSuccess;

export type UpdateAttributeNumericValueSuccess = {
  __typename?: 'UpdateAttributeNumericValueSuccess';
  data: UpdateAttributeNumericValuePayload;
};

export type UpdateAttributePayload = {
  __typename?: 'UpdateAttributePayload';
  /** The updated attribute. */
  attribute: Attribute;
};

export type UpdateAttributeReferenceInput = {
  /** The reference value to update. */
  id: Scalars['ID']['input'];
  /** New sort position among siblings; leave unset to keep the current order. */
  position?: InputMaybe<Scalars['Int']['input']>;
  /** New target entity id; leave unset to keep the current reference. */
  referenceId?: InputMaybe<Scalars['Int']['input']>;
  /** New slug, unique within the attribute and scope; leave unset to keep the current slug. */
  slug?: InputMaybe<Scalars['String']['input']>;
  /** New displayed text; leave unset to keep the current value. */
  value?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateAttributeReferencePayload = {
  __typename?: 'UpdateAttributeReferencePayload';
  /** The updated reference value. */
  value: AttributeReferenceValue;
};

export type UpdateAttributeReferenceResult = AttributeValueNotFoundError | AttributeValueSlugTakenError | UpdateAttributeReferenceSuccess;

export type UpdateAttributeReferenceSuccess = {
  __typename?: 'UpdateAttributeReferenceSuccess';
  data: UpdateAttributeReferencePayload;
};

export type UpdateAttributeResult = AttributeNotFoundError | OptimisticLockError | UnitNotAllowedError | UpdateAttributeSuccess;

export type UpdateAttributeSuccess = {
  __typename?: 'UpdateAttributeSuccess';
  data: UpdateAttributePayload;
};

export type UpdateAttributeSwatchInput = {
  /** New hex color; pass null to clear it, leave unset to keep the current color. */
  color?: InputMaybe<Scalars['String']['input']>;
  /** New backing image; pass null to clear it, leave unset to keep the current file. */
  file?: InputMaybe<FileInfoInput>;
  /** The swatch value to update. */
  id: Scalars['ID']['input'];
  /** New sort position among siblings; leave unset to keep the current order. */
  position?: InputMaybe<Scalars['Int']['input']>;
  /** New slug, unique within the attribute and scope; leave unset to keep the current slug. */
  slug?: InputMaybe<Scalars['String']['input']>;
  /** New displayed text; leave unset to keep the current value. */
  value?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateAttributeSwatchPayload = {
  __typename?: 'UpdateAttributeSwatchPayload';
  /** The updated swatch value. */
  value: AttributeSwatchValue;
};

export type UpdateAttributeSwatchResult = AttributeValueNotFoundError | AttributeValueSlugTakenError | SwatchRequiresColorOrFileError | SwatchVisualInvalidError | UpdateAttributeSwatchSuccess;

export type UpdateAttributeSwatchSuccess = {
  __typename?: 'UpdateAttributeSwatchSuccess';
  data: UpdateAttributeSwatchPayload;
};

export type UpdateAttributeTextValueInput = {
  /** The text value to update. */
  id: Scalars['ID']['input'];
  /** New plain-text representation; omit to leave it unchanged. */
  plain?: InputMaybe<Scalars['String']['input']>;
  /** New rich-text JSON document; omit to leave it unchanged, pass null to clear it. */
  rich?: InputMaybe<Scalars['JSONObject']['input']>;
};

export type UpdateAttributeTextValuePayload = {
  __typename?: 'UpdateAttributeTextValuePayload';
  /** The updated text value. */
  value: AttributeTextValue;
};

export type UpdateAttributeTextValueResult = TypedValueNotFoundError | UpdateAttributeTextValueSuccess;

export type UpdateAttributeTextValueSuccess = {
  __typename?: 'UpdateAttributeTextValueSuccess';
  data: UpdateAttributeTextValuePayload;
};

export type UpdateAttributeValueInput = {
  /** The choice value to update. */
  id: Scalars['ID']['input'];
  /** New sort position among siblings; leave unset to keep the current order. */
  position?: InputMaybe<Scalars['Int']['input']>;
  /** New slug, unique within the attribute and scope; leave unset to keep the current slug. */
  slug?: InputMaybe<Scalars['String']['input']>;
  /** New displayed text; leave unset to keep the current value. */
  value?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateAttributeValuePayload = {
  __typename?: 'UpdateAttributeValuePayload';
  /** The updated choice value. */
  value: AttributeValue;
};

export type UpdateAttributeValueResult = AttributeValueNotFoundError | AttributeValueSlugTakenError | UpdateAttributeValueSuccess;

export type UpdateAttributeValueSuccess = {
  __typename?: 'UpdateAttributeValueSuccess';
  data: UpdateAttributeValuePayload;
};

export type UpdateCategoryInput = {
  /** A new long-form description for the category. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** References the Category node to update. */
  id: Scalars['ID']['input'];
  /** A new display name for the category. */
  name?: InputMaybe<Scalars['String']['input']>;
  /** A new ordering position among sibling categories. */
  position?: InputMaybe<Scalars['Int']['input']>;
  /** A new URL-friendly identifier, unique within the category's scope. */
  slug?: InputMaybe<Scalars['String']['input']>;
  /** The expected current version for optimistic-lock checking; a stale value is rejected. */
  version: Scalars['Int']['input'];
};

export type UpdateCategoryPayload = {
  __typename?: 'UpdateCategoryPayload';
  /** The updated category. */
  category: Category;
};

export type UpdateCategoryResult = CategoryNotFoundError | CategorySlugTakenError | OptimisticLockError | UpdateCategorySuccess;

export type UpdateCategorySuccess = {
  __typename?: 'UpdateCategorySuccess';
  data: UpdateCategoryPayload;
};

export type UpdateChannelInput = {
  /** New description; left unchanged when omitted. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** New URL-safe identifier, unique within the organization; left unchanged when omitted. */
  handle?: InputMaybe<Scalars['String']['input']>;
  /** Identifies the Channel node to update. */
  id: Scalars['ID']['input'];
  /** New availability state; left unchanged when omitted. */
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  /** New default-channel flag; left unchanged when omitted. */
  isDefault?: InputMaybe<Scalars['Boolean']['input']>;
  /** New freeform metadata; left unchanged when omitted. */
  metadata?: InputMaybe<Scalars['JSONObject']['input']>;
  /** New display name; left unchanged when omitted. */
  name?: InputMaybe<Scalars['String']['input']>;
  /** Expected current version for optimistic-lock concurrency control. */
  version: Scalars['Int']['input'];
};

export type UpdateChannelPayload = {
  __typename?: 'UpdateChannelPayload';
  /** The updated sales channel. */
  channel: Channel;
};

export type UpdateChannelResult = ChannelNotFoundError | OptimisticLockError | UpdateChannelSuccess | ValidationError;

export type UpdateChannelSuccess = {
  __typename?: 'UpdateChannelSuccess';
  data: UpdateChannelPayload;
};

export type UpdateLocaleInput = {
  /** The Locale to update. */
  id: Scalars['ID']['input'];
  /** New active state; omit to leave unchanged. */
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  /** New display name; omit to leave unchanged. */
  name?: InputMaybe<Scalars['String']['input']>;
  /** Optimistic-lock version; must match the current row or the update is rejected. */
  version: Scalars['Int']['input'];
};

export type UpdateLocalePayload = {
  __typename?: 'UpdateLocalePayload';
  /** The updated locale. */
  locale: Locale;
};

export type UpdateLocaleResult = LocaleNotFoundError | OptimisticLockError | UpdateLocaleSuccess | ValidationError;

export type UpdateLocaleSuccess = {
  __typename?: 'UpdateLocaleSuccess';
  data: UpdateLocalePayload;
};

export type UpdateMediaInput = {
  /** New accessibility alt text for the media asset; left unchanged when omitted. */
  alt?: InputMaybe<Scalars['String']['input']>;
  /** References the ProductMedia node to update. */
  id: Scalars['ID']['input'];
  /** A new ordering position within the product gallery; left unchanged when omitted. */
  position?: InputMaybe<Scalars['Int']['input']>;
  /** A new media kind, either IMAGE or VIDEO; left unchanged when omitted. */
  type?: InputMaybe<ProductMediaType>;
  /** A new URL for the media asset; left unchanged when omitted. */
  url?: InputMaybe<Scalars['String']['input']>;
  /** The expected current version for optimistic-locking; the update fails if it does not match. */
  version: Scalars['Int']['input'];
};

export type UpdateMediaPayload = {
  __typename?: 'UpdateMediaPayload';
  /** The updated product media asset. */
  media: ProductMedia;
};

export type UpdateMediaResult = MediaNotFoundError | OptimisticLockError | UpdateMediaSuccess;

export type UpdateMediaSuccess = {
  __typename?: 'UpdateMediaSuccess';
  data: UpdateMediaPayload;
};

export type UpdateProductInput = {
  /** The new long-form description; omit to leave it unchanged. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** The Product to update. */
  id: Scalars['ID']['input'];
  /** The new display name; omit to leave it unchanged. */
  name?: InputMaybe<Scalars['String']['input']>;
  /** The new thumbnail image URL; omit to leave it unchanged. */
  thumbnailUrl?: InputMaybe<Scalars['String']['input']>;
  /** The optimistic-lock version, which must match the current row or the update is rejected. */
  version: Scalars['Int']['input'];
};

export type UpdateProductPayload = {
  __typename?: 'UpdateProductPayload';
  /** The updated product. */
  product: Product;
};

export type UpdateProductResult = OptimisticLockError | ProductNotFoundError | UpdateProductSuccess;

export type UpdateProductSuccess = {
  __typename?: 'UpdateProductSuccess';
  data: UpdateProductPayload;
};

export type UpdateProductTypeInput = {
  /** References the ProductType node to update. */
  id: Scalars['ID']['input'];
  /** New shipping-required flag; omit to leave unchanged. */
  isShippingRequired?: InputMaybe<Scalars['Boolean']['input']>;
  /** New display name; omit to leave unchanged. */
  name?: InputMaybe<Scalars['String']['input']>;
  /** New URL-safe identifier; omit to leave unchanged. */
  slug?: InputMaybe<Scalars['String']['input']>;
  /** Expected current version for optimistic-lock concurrency control; the update fails if it no longer matches. */
  version: Scalars['Int']['input'];
};

export type UpdateProductTypePayload = {
  __typename?: 'UpdateProductTypePayload';
  /** The updated product type. */
  productType: ProductType;
};

export type UpdateProductTypeResult = OptimisticLockError | ProductTypeNotFoundError | UpdateProductTypeSuccess;

export type UpdateProductTypeSuccess = {
  __typename?: 'UpdateProductTypeSuccess';
  data: UpdateProductTypePayload;
};

export type UpdateUserInput = {
  /** Global ID of the user to update. */
  id: Scalars['ID']['input'];
  /** New display name for the user. */
  name?: InputMaybe<Scalars['String']['input']>;
  /** New set of global platform roles to assign to the user; requires the user:set-role permission. */
  role?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type UpdateUserPayload = {
  __typename?: 'UpdateUserPayload';
  /** The updated user. */
  user: User;
};

export type UpdateUserResult = CannotDemoteSelfError | ForbiddenError | InvalidRoleError | RoleAssignmentDeniedError | UpdateUserSuccess | UserNoChangesError | UserNotFoundError | ValidationError;

export type UpdateUserSuccess = {
  __typename?: 'UpdateUserSuccess';
  data: UpdateUserPayload;
};

export type UpdateVariantInput = {
  /** Global ID of the ProductVariant node to update. */
  id: Scalars['ID']['input'];
  /** New sort position ordering the variant among its siblings. */
  position?: InputMaybe<Scalars['Int']['input']>;
  /** New stock-keeping unit. Must be unique when provided. */
  sku?: InputMaybe<Scalars['String']['input']>;
  /** Expected current version for optimistic locking; a mismatch raises OptimisticLockError. */
  version: Scalars['Int']['input'];
};

export type UpdateVariantPayload = {
  __typename?: 'UpdateVariantPayload';
  /** The updated variant. */
  variant: ProductVariant;
};

export type UpdateVariantResult = OptimisticLockError | UpdateVariantSuccess | VariantNotFoundError;

export type UpdateVariantSuccess = {
  __typename?: 'UpdateVariantSuccess';
  data: UpdateVariantPayload;
};

export type UpsertCategoryTranslationInput = {
  /** Global ID of the Category node whose translation is being written. */
  categoryId: Scalars['ID']['input'];
  /** Optional localized category description for this locale. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** Registered locale code identifying which language this translation targets. */
  localeCode: Scalars['String']['input'];
  /** Localized category name for this locale. */
  name: Scalars['String']['input'];
};

export type UpsertCategoryTranslationPayload = {
  __typename?: 'UpsertCategoryTranslationPayload';
  /** True when the translation operation completed successfully. */
  success: Scalars['Boolean']['output'];
};

export type UpsertCategoryTranslationResult = UpsertCategoryTranslationSuccess;

export type UpsertCategoryTranslationSuccess = {
  __typename?: 'UpsertCategoryTranslationSuccess';
  data: UpsertCategoryTranslationPayload;
};

export type UpsertProductTranslationInput = {
  /** Optional localized product description for this locale. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** Registered locale code identifying which language this translation targets. */
  localeCode: Scalars['String']['input'];
  /** Localized product name for this locale. */
  name: Scalars['String']['input'];
  /** Global ID of the Product node whose translation is being written. */
  productId: Scalars['ID']['input'];
};

export type UpsertProductTranslationPayload = {
  __typename?: 'UpsertProductTranslationPayload';
  /** True when the translation operation completed successfully. */
  success: Scalars['Boolean']['output'];
};

export type UpsertProductTranslationResult = UpsertProductTranslationSuccess;

export type UpsertProductTranslationSuccess = {
  __typename?: 'UpsertProductTranslationSuccess';
  data: UpsertProductTranslationPayload;
};

export type UpsertVariantTranslationInput = {
  /** Registered locale code identifying which language this translation targets. */
  localeCode: Scalars['String']['input'];
  /** Localized variant name for this locale. */
  name: Scalars['String']['input'];
  /** Global ID of the ProductVariant node whose translation is being written. */
  variantId: Scalars['ID']['input'];
};

export type UpsertVariantTranslationPayload = {
  __typename?: 'UpsertVariantTranslationPayload';
  /** True when the translation operation completed successfully. */
  success: Scalars['Boolean']['output'];
};

export type UpsertVariantTranslationResult = UpsertVariantTranslationSuccess;

export type UpsertVariantTranslationSuccess = {
  __typename?: 'UpsertVariantTranslationSuccess';
  data: UpsertVariantTranslationPayload;
};

/** A platform account, identified globally and distinct from per-organization memberships. */
export type User = Node & {
  __typename?: 'User';
  /** Provider IDs of the user's linked login accounts (e.g. "credential" once a password is set, or an OAuth provider). Empty for an invited user who has not yet accepted the invitation. */
  accounts: Array<Scalars['String']['output']>;
  /** Timestamp at which the user's ban expires, or null for a permanent ban. */
  banExpires?: Maybe<Scalars['DateTime']['output']>;
  /** Reason recorded for the user's ban. */
  banReason?: Maybe<Scalars['String']['output']>;
  /** Whether the user is currently banned from the platform. */
  banned?: Maybe<Scalars['Boolean']['output']>;
  /** Timestamp at which the user account was created. */
  createdAt: Scalars['DateTime']['output'];
  /** Email address used to identify and contact the user. */
  email: Scalars['String']['output'];
  /** Whether the user has confirmed ownership of their email address. */
  emailVerified: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  /** URL of the user's avatar image. */
  image?: Maybe<Scalars['String']['output']>;
  /** Display name of the user. */
  name: Scalars['String']['output'];
  /** Effective permissions resolved from the user's CSV roles via the access-control hierarchies (cumulative). The authoritative source for client-side RBAC gating; the server remains the security boundary. */
  permissions: Array<Permission>;
  /** Platform-level global role of the user, distinct from per-organization membership roles; defaults to "user". */
  role: Scalars['String']['output'];
  /** Whether two-factor authentication is enabled for the user. */
  twoFactorEnabled?: Maybe<Scalars['Boolean']['output']>;
  /** Timestamp at which the user account was last updated. */
  updatedAt: Scalars['DateTime']['output'];
};

export type UserAlreadyBannedError = Error & {
  __typename?: 'UserAlreadyBannedError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type UserAlreadyExistsError = Error & {
  __typename?: 'UserAlreadyExistsError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** Live (non-deleted) user totals per admin filter bucket, used to badge the user-management tabs. */
export type UserCounts = {
  __typename?: 'UserCounts';
  /** Number of live users with the global "admin" role. */
  admins: Scalars['Int']['output'];
  /** Total number of live users. */
  all: Scalars['Int']['output'];
  /** Number of live users that are currently banned. */
  banned: Scalars['Int']['output'];
  /** Number of live users whose email is not yet verified. */
  unverified: Scalars['Int']['output'];
};

export type UserNoChangesError = Error & {
  __typename?: 'UserNoChangesError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type UserNotBannedError = Error & {
  __typename?: 'UserNotBannedError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type UserNotFoundError = Error & {
  __typename?: 'UserNotFoundError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** Specifies a field and direction by which to order a list of users. */
export type UserOrderByInput = {
  /** Direction in which to sort the chosen field. */
  direction: OrderDirection;
  /** Field to order users by. */
  field: UserOrderField;
};

/** Fields by which a list of users can be ordered. */
export enum UserOrderField {
  /** Order by account creation timestamp. */
  CreatedAt = 'CREATED_AT',
  /** Order by email address. */
  Email = 'EMAIL',
  /** Order by display name. */
  Name = 'NAME'
}

/** Filter conditions for selecting users, combinable via the AND, OR, and NOT operators. */
export type UserWhereInput = {
  /** Match users satisfying all of the given sub-filters. */
  AND?: InputMaybe<Array<UserWhereInput>>;
  /** Match users that do not satisfy the given sub-filter. */
  NOT?: InputMaybe<UserWhereInput>;
  /** Match users satisfying any of the given sub-filters. */
  OR?: InputMaybe<Array<UserWhereInput>>;
  /** Filter users by ban expiry timestamp. */
  banExpires?: InputMaybe<DateTimeFilterInput>;
  /** Filter users by the recorded ban reason. */
  banReason?: InputMaybe<StringFilterInput>;
  /** Filter users by whether they are currently banned. */
  banned?: InputMaybe<BooleanFilterInput>;
  /** Filter users by account creation timestamp. */
  createdAt?: InputMaybe<DateTimeFilterInput>;
  /** Filter users by email address. */
  email?: InputMaybe<StringFilterInput>;
  /** Filter users by whether their email is verified. */
  emailVerified?: InputMaybe<BooleanFilterInput>;
  /** Filter users by display name. */
  name?: InputMaybe<StringFilterInput>;
  /** Filter users by their global platform role (e.g. "admin"). */
  role?: InputMaybe<StringFilterInput>;
  /** Filter users by whether two-factor authentication is enabled. */
  twoFactorEnabled?: InputMaybe<BooleanFilterInput>;
};

export type ValidationError = Error & {
  __typename?: 'ValidationError';
  code: Scalars['String']['output'];
  fields: Array<FieldError>;
  message: Scalars['String']['output'];
};

export type ValueKindMismatchError = Error & {
  __typename?: 'ValueKindMismatchError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** A graft row binding a variant to one of its selection attribute values; null organizationId is the base assignment, a set organizationId is a specific org's overlay. */
export type VariantAttributeValue = Node & {
  __typename?: 'VariantAttributeValue';
  /** The attribute (in the attribute module) this value belongs to. */
  attributeId: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  /** The owning organization of this graft, or null when it is the shared base assignment. */
  organizationId?: Maybe<Scalars['Int']['output']>;
  /** Ordering of this value among the variant's attribute values. */
  position: Scalars['Int']['output'];
  /** The specific attribute value selected for the variant. */
  valueId: Scalars['Int']['output'];
  /** The variant this selection value is assigned to. */
  variantId: Scalars['Int']['output'];
};

/** A graft row linking a variant to an inventory item it draws stock from, with the quantity each unit requires. */
export type VariantInventoryItem = Node & {
  __typename?: 'VariantInventoryItem';
  id: Scalars['ID']['output'];
  /** The inventory item (in the inventory module) the variant draws from. */
  inventoryItemId: Scalars['Int']['output'];
  /** The owning organization of this inventory link. */
  organizationId: Scalars['Int']['output'];
  /** How many units of the inventory item one variant unit consumes. */
  requiredQuantity: Scalars['Int']['output'];
  /** The variant that consumes the inventory item. */
  variantId: Scalars['Int']['output'];
};

/** A link row associating a variant with a media asset. */
export type VariantMedia = Node & {
  __typename?: 'VariantMedia';
  id: Scalars['ID']['output'];
  /** The media asset linked to the variant. */
  mediaId: Scalars['Int']['output'];
  /** The variant the media asset is attached to. */
  variantId: Scalars['Int']['output'];
};

export type VariantNotFoundError = Error & {
  __typename?: 'VariantNotFoundError';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** The binding between a variant and a price set for a single viewer organization. The price set itself lives in @czo/price and is resolved out-of-band via priceSetId (no foreign key). */
export type VariantPriceSet = {
  __typename?: 'VariantPriceSet';
  /** Unique identifier of this variant-to-price-set binding. */
  id: Scalars['Int']['output'];
  /** Identifier of the organization that owns this binding. */
  organizationId: Scalars['Int']['output'];
  /** Cross-module reference to the bound PriceSet in @czo/price; resolve the node separately. */
  priceSetId: Scalars['Int']['output'];
};

/** One (attribute, value) pair of a variant's option selection. The full set of pairs defines the variant's position in the product's option matrix and must be unique among siblings. */
export type VariantSelectionPairInput = {
  /** Raw id of a variant-selection attribute declared on the product's type. */
  attributeId: Scalars['Int']['input'];
  /** Raw id of the chosen catalog value for that attribute. */
  valueId: Scalars['Int']['input'];
};

export type MeProbeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeProbeQuery = { __typename?: 'Query', me?: { __typename?: 'User', id: string, name: string, email: string, role: string } | null };

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { __typename?: 'Query', me?: { __typename?: 'User', id: string, name: string, email: string, role: string, permissions: Array<{ __typename?: 'Permission', resource: string, actions: Array<string> }> } | null };

export type AdminProductQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type AdminProductQuery = { __typename?: 'Query', product?: { __typename?: 'Product', id: string, name: string, handle: string, createdAt: string } | null };

export type AdminProductsQueryVariables = Exact<{
  first: Scalars['Int']['input'];
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type AdminProductsQuery = { __typename?: 'Query', products: { __typename?: 'QueryProductsConnection', edges: Array<{ __typename?: 'QueryProductsConnectionEdge', node: { __typename?: 'Product', id: string, name: string, handle: string } }>, pageInfo: { __typename?: 'PageInfo', endCursor?: string | null, hasNextPage: boolean } } };

export type AdminUsersQueryVariables = Exact<{
  first: Scalars['Int']['input'];
  after?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<UserWhereInput>;
  orderBy?: InputMaybe<Array<UserOrderByInput> | UserOrderByInput>;
  admin?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type AdminUsersQuery = { __typename?: 'Query', users: { __typename?: 'QueryUsersConnection', edges: Array<{ __typename?: 'QueryUsersConnectionEdge', node: { __typename?: 'User', id: string, name: string, email: string, role: string, banned?: boolean | null, emailVerified: boolean, createdAt: string, accounts: Array<string> } }>, pageInfo: { __typename?: 'PageInfo', endCursor?: string | null, hasNextPage: boolean } } };

export type AdminUserCountsQueryVariables = Exact<{ [key: string]: never; }>;


export type AdminUserCountsQuery = { __typename?: 'Query', userCounts: { __typename?: 'UserCounts', all: number, admins: number, unverified: number, banned: number } };

export type AdminCreateUserMutationVariables = Exact<{
  input: CreateUserInput;
}>;


export type AdminCreateUserMutation = { __typename?: 'Mutation', createUser: { __typename: 'CreateUserSuccess', data: { __typename?: 'CreateUserPayload', user: { __typename?: 'User', id: string } } } | { __typename: 'CredentialLinkFailedError', message: string } | { __typename: 'InvalidRoleError', message: string } | { __typename: 'PasswordHashFailedError', message: string } | { __typename: 'RoleAssignmentDeniedError', message: string } | { __typename: 'UserAlreadyExistsError', message: string } | { __typename: 'ValidationError', message: string } };

export type AdminSetRoleMutationVariables = Exact<{
  input: SetRoleInput;
}>;


export type AdminSetRoleMutation = { __typename?: 'Mutation', setRole: { __typename: 'CannotDemoteSelfError', message: string } | { __typename: 'ForbiddenError', message: string } | { __typename: 'InvalidRoleError', message: string } | { __typename: 'RoleAssignmentDeniedError', message: string } | { __typename: 'SetRoleSuccess', data: { __typename?: 'SetRolePayload', user: { __typename?: 'User', id: string } } } | { __typename: 'UserNotFoundError', message: string } };

export type AdminBanUserMutationVariables = Exact<{
  input: BanUserInput;
}>;


export type AdminBanUserMutation = { __typename?: 'Mutation', banUser: { __typename: 'BanUserSuccess', data: { __typename?: 'BanUserPayload', user: { __typename?: 'User', id: string } } } | { __typename: 'CannotBanSelfError', message: string } | { __typename: 'ForbiddenError', message: string } | { __typename: 'UserAlreadyBannedError', message: string } | { __typename: 'UserNotFoundError', message: string } };

export type AdminUnbanUserMutationVariables = Exact<{
  input: UnbanUserInput;
}>;


export type AdminUnbanUserMutation = { __typename?: 'Mutation', unbanUser: { __typename: 'UnbanUserSuccess', data: { __typename?: 'UnbanUserPayload', user: { __typename?: 'User', id: string } } } | { __typename: 'UserNotBannedError', message: string } | { __typename: 'UserNotFoundError', message: string } };

export type AdminResendInvitationMutationVariables = Exact<{
  input: ResendInvitationInput;
}>;


export type AdminResendInvitationMutation = { __typename?: 'Mutation', resendInvitation: { __typename: 'ResendInvitationSuccess', data: { __typename?: 'ResendInvitationPayload', success: boolean } } | { __typename: 'UserNotFoundError', message: string } };

export type AdminRoleHierarchiesQueryVariables = Exact<{ [key: string]: never; }>;


export type AdminRoleHierarchiesQuery = { __typename?: 'Query', roleHierarchies: Array<{ __typename?: 'RoleHierarchy', name: string, tiers: Array<{ __typename?: 'RoleTier', name: string }> }> };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}

export const MeProbeDocument = new TypedDocumentString(`
    query MeProbe {
  me {
    id
    name
    email
    role
  }
}
    `) as unknown as TypedDocumentString<MeProbeQuery, MeProbeQueryVariables>;
export const MeDocument = new TypedDocumentString(`
    query Me {
  me {
    id
    name
    email
    role
    permissions {
      resource
      actions
    }
  }
}
    `) as unknown as TypedDocumentString<MeQuery, MeQueryVariables>;
export const AdminProductDocument = new TypedDocumentString(`
    query AdminProduct($id: ID!) {
  product(id: $id) {
    id
    name
    handle
    createdAt
  }
}
    `) as unknown as TypedDocumentString<AdminProductQuery, AdminProductQueryVariables>;
export const AdminProductsDocument = new TypedDocumentString(`
    query AdminProducts($first: Int!, $after: String) {
  products(first: $first, after: $after) {
    edges {
      node {
        id
        name
        handle
      }
    }
    pageInfo {
      endCursor
      hasNextPage
    }
  }
}
    `) as unknown as TypedDocumentString<AdminProductsQuery, AdminProductsQueryVariables>;
export const AdminUsersDocument = new TypedDocumentString(`
    query AdminUsers($first: Int!, $after: String, $search: String, $where: UserWhereInput, $orderBy: [UserOrderByInput!], $admin: Boolean) {
  users(
    first: $first
    after: $after
    search: $search
    where: $where
    orderBy: $orderBy
    admin: $admin
  ) {
    edges {
      node {
        id
        name
        email
        role
        banned
        emailVerified
        createdAt
        accounts
      }
    }
    pageInfo {
      endCursor
      hasNextPage
    }
  }
}
    `) as unknown as TypedDocumentString<AdminUsersQuery, AdminUsersQueryVariables>;
export const AdminUserCountsDocument = new TypedDocumentString(`
    query AdminUserCounts {
  userCounts {
    all
    admins
    unverified
    banned
  }
}
    `) as unknown as TypedDocumentString<AdminUserCountsQuery, AdminUserCountsQueryVariables>;
export const AdminCreateUserDocument = new TypedDocumentString(`
    mutation AdminCreateUser($input: CreateUserInput!) {
  createUser(input: $input) {
    __typename
    ... on CreateUserSuccess {
      data {
        user {
          id
        }
      }
    }
    ... on ValidationError {
      message
    }
    ... on UserAlreadyExistsError {
      message
    }
    ... on InvalidRoleError {
      message
    }
    ... on RoleAssignmentDeniedError {
      message
    }
    ... on CredentialLinkFailedError {
      message
    }
    ... on PasswordHashFailedError {
      message
    }
  }
}
    `) as unknown as TypedDocumentString<AdminCreateUserMutation, AdminCreateUserMutationVariables>;
export const AdminSetRoleDocument = new TypedDocumentString(`
    mutation AdminSetRole($input: SetRoleInput!) {
  setRole(input: $input) {
    __typename
    ... on SetRoleSuccess {
      data {
        user {
          id
        }
      }
    }
    ... on ForbiddenError {
      message
    }
    ... on UserNotFoundError {
      message
    }
    ... on InvalidRoleError {
      message
    }
    ... on CannotDemoteSelfError {
      message
    }
    ... on RoleAssignmentDeniedError {
      message
    }
  }
}
    `) as unknown as TypedDocumentString<AdminSetRoleMutation, AdminSetRoleMutationVariables>;
export const AdminBanUserDocument = new TypedDocumentString(`
    mutation AdminBanUser($input: BanUserInput!) {
  banUser(input: $input) {
    __typename
    ... on BanUserSuccess {
      data {
        user {
          id
        }
      }
    }
    ... on ForbiddenError {
      message
    }
    ... on UserNotFoundError {
      message
    }
    ... on CannotBanSelfError {
      message
    }
    ... on UserAlreadyBannedError {
      message
    }
  }
}
    `) as unknown as TypedDocumentString<AdminBanUserMutation, AdminBanUserMutationVariables>;
export const AdminUnbanUserDocument = new TypedDocumentString(`
    mutation AdminUnbanUser($input: UnbanUserInput!) {
  unbanUser(input: $input) {
    __typename
    ... on UnbanUserSuccess {
      data {
        user {
          id
        }
      }
    }
    ... on UserNotFoundError {
      message
    }
    ... on UserNotBannedError {
      message
    }
  }
}
    `) as unknown as TypedDocumentString<AdminUnbanUserMutation, AdminUnbanUserMutationVariables>;
export const AdminResendInvitationDocument = new TypedDocumentString(`
    mutation AdminResendInvitation($input: ResendInvitationInput!) {
  resendInvitation(input: $input) {
    __typename
    ... on ResendInvitationSuccess {
      data {
        success
      }
    }
    ... on UserNotFoundError {
      message
    }
  }
}
    `) as unknown as TypedDocumentString<AdminResendInvitationMutation, AdminResendInvitationMutationVariables>;
export const AdminRoleHierarchiesDocument = new TypedDocumentString(`
    query AdminRoleHierarchies {
  roleHierarchies {
    name
    tiers {
      name
    }
  }
}
    `) as unknown as TypedDocumentString<AdminRoleHierarchiesQuery, AdminRoleHierarchiesQueryVariables>;