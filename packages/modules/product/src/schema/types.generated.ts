import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
export type Maybe<T> = T | null | undefined;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
export type EnumResolverSignature<T, AllowedValues = any> = { [key in keyof T]?: AllowedValues };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string | number; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** Custom scalar for DateTime values (ISO 8601 format) */
  DateTime: { input: any; output: any; }
  /** Custom scalar for JSON data */
  JSON: { input: any; output: any; }
};

/** Generic boolean response payload */
export type BooleanPayload = {
  __typename?: 'BooleanPayload';
  /** Optional message */
  message?: Maybe<Scalars['String']['output']>;
  /** Operation success status */
  success: Scalars['Boolean']['output'];
};

/** Category tree node with nested children */
export type CategoryNode = {
  __typename?: 'CategoryNode';
  category: ProductCategory;
  children: Array<CategoryNode>;
  depth: Scalars['Int']['output'];
};

/** Category mutation response payload */
export type CategoryPayload = {
  __typename?: 'CategoryPayload';
  category?: Maybe<ProductCategory>;
  errors?: Maybe<Array<Error>>;
};

export type CollectionPayload = {
  __typename?: 'CollectionPayload';
  collection?: Maybe<ProductCollection>;
  errors?: Maybe<Array<Error>>;
};

/** Input for creating a new category */
export type CreateCategoryInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  handle?: InputMaybe<Scalars['String']['input']>;
  imageId?: InputMaybe<Scalars['String']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  isInternal?: InputMaybe<Scalars['Boolean']['input']>;
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  name: Scalars['String']['input'];
  parentId?: InputMaybe<Scalars['ID']['input']>;
  rank?: InputMaybe<Scalars['Int']['input']>;
  thumbnail?: InputMaybe<Scalars['String']['input']>;
};

export type CreateCollectionInput = {
  handle?: InputMaybe<Scalars['String']['input']>;
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  title: Scalars['String']['input'];
};

/** Input for creating a new product */
export type CreateProductInput = {
  collectionId?: InputMaybe<Scalars['ID']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  discountable?: InputMaybe<Scalars['Boolean']['input']>;
  externalId?: InputMaybe<Scalars['String']['input']>;
  handle?: InputMaybe<Scalars['String']['input']>;
  height?: InputMaybe<Scalars['String']['input']>;
  hsCode?: InputMaybe<Scalars['String']['input']>;
  isGiftcard?: InputMaybe<Scalars['Boolean']['input']>;
  length?: InputMaybe<Scalars['String']['input']>;
  material?: InputMaybe<Scalars['String']['input']>;
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  midCode?: InputMaybe<Scalars['String']['input']>;
  originCountry?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<ProductStatus>;
  subtitle?: InputMaybe<Scalars['String']['input']>;
  thumbnail?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
  typeId?: InputMaybe<Scalars['ID']['input']>;
  weight?: InputMaybe<Scalars['String']['input']>;
  width?: InputMaybe<Scalars['String']['input']>;
};

export type CreateProductOptionInput = {
  title: Scalars['String']['input'];
  values: Array<Scalars['String']['input']>;
};

/** Input for creating a new variant */
export type CreateVariantInput = {
  allowBackorder?: InputMaybe<Scalars['Boolean']['input']>;
  barcode?: InputMaybe<Scalars['String']['input']>;
  ean?: InputMaybe<Scalars['String']['input']>;
  height?: InputMaybe<Scalars['Int']['input']>;
  hsCode?: InputMaybe<Scalars['String']['input']>;
  length?: InputMaybe<Scalars['Int']['input']>;
  manageInventory?: InputMaybe<Scalars['Boolean']['input']>;
  material?: InputMaybe<Scalars['String']['input']>;
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  midCode?: InputMaybe<Scalars['String']['input']>;
  originCountry?: InputMaybe<Scalars['String']['input']>;
  sku?: InputMaybe<Scalars['String']['input']>;
  thumbnail?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
  upc?: InputMaybe<Scalars['String']['input']>;
  variantRank?: InputMaybe<Scalars['Int']['input']>;
  weight?: InputMaybe<Scalars['Int']['input']>;
  width?: InputMaybe<Scalars['Int']['input']>;
};

/** Generic delete response payload */
export type DeletePayload = {
  __typename?: 'DeletePayload';
  /** Timestamp when the record was deleted */
  deletedAt: Scalars['DateTime']['output'];
  /** Optional message */
  message?: Maybe<Scalars['String']['output']>;
  /** Whether the deletion was successful */
  success: Scalars['Boolean']['output'];
};

/** Error type for mutation responses */
export type Error = {
  __typename?: 'Error';
  /** Machine-readable error code */
  code: Scalars['String']['output'];
  /** Field that caused the error (if applicable) */
  field?: Maybe<Scalars['String']['output']>;
  /** Human-readable error message */
  message: Scalars['String']['output'];
};

export type ImagePayload = {
  __typename?: 'ImagePayload';
  errors?: Maybe<Array<Error>>;
  image?: Maybe<ProductImage>;
};

export type Mutation = {
  __typename?: 'Mutation';
  addOptionValue: OptionValuePayload;
  /** Assign a product to multiple categories */
  assignProductToCategories: ProductPayload;
  assignTagsToProduct: ProductPayload;
  associateImageWithVariant: BooleanPayload;
  associateVariantOptions: VariantPayload;
  /** Create a new category */
  createCategory: CategoryPayload;
  createCollection: CollectionPayload;
  /** Create a new product */
  createProduct: ProductPayload;
  createProductOption: OptionPayload;
  createProductType: TypePayload;
  /** Create a new product variant */
  createProductVariant: VariantPayload;
  createTag: TagPayload;
  /** Soft-delete a category */
  deleteCategory: DeletePayload;
  deleteCollection: DeletePayload;
  deleteOptionValue: DeletePayload;
  /** Soft-delete a product */
  deleteProduct: DeletePayload;
  deleteProductImage: DeletePayload;
  deleteProductType: DeletePayload;
  /** Soft-delete a variant */
  deleteProductVariant: DeletePayload;
  deleteTag: DeletePayload;
  /** Update an existing category */
  updateCategory: CategoryPayload;
  updateCollection: CollectionPayload;
  /** Update an existing product */
  updateProduct: ProductPayload;
  updateProductType: TypePayload;
  /** Update an existing variant */
  updateProductVariant: VariantPayload;
  uploadProductImage: ImagePayload;
};


export type MutationaddOptionValueArgs = {
  optionId: Scalars['ID']['input'];
  value: Scalars['String']['input'];
};


export type MutationassignProductToCategoriesArgs = {
  categoryIds: Array<Scalars['ID']['input']>;
  productId: Scalars['ID']['input'];
};


export type MutationassignTagsToProductArgs = {
  productId: Scalars['ID']['input'];
  tagIds: Array<Scalars['ID']['input']>;
};


export type MutationassociateImageWithVariantArgs = {
  imageId: Scalars['ID']['input'];
  variantId: Scalars['ID']['input'];
};


export type MutationassociateVariantOptionsArgs = {
  optionValueIds: Array<Scalars['ID']['input']>;
  variantId: Scalars['ID']['input'];
};


export type MutationcreateCategoryArgs = {
  input: CreateCategoryInput;
};


export type MutationcreateCollectionArgs = {
  input: CreateCollectionInput;
};


export type MutationcreateProductArgs = {
  input: CreateProductInput;
};


export type MutationcreateProductOptionArgs = {
  productId: Scalars['ID']['input'];
  title: Scalars['String']['input'];
  values: Array<Scalars['String']['input']>;
};


export type MutationcreateProductTypeArgs = {
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  value: Scalars['String']['input'];
};


export type MutationcreateProductVariantArgs = {
  input: CreateVariantInput;
  productId: Scalars['ID']['input'];
};


export type MutationcreateTagArgs = {
  value: Scalars['String']['input'];
};


export type MutationdeleteCategoryArgs = {
  id: Scalars['ID']['input'];
};


export type MutationdeleteCollectionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationdeleteOptionValueArgs = {
  id: Scalars['ID']['input'];
};


export type MutationdeleteProductArgs = {
  id: Scalars['ID']['input'];
};


export type MutationdeleteProductImageArgs = {
  id: Scalars['ID']['input'];
};


export type MutationdeleteProductTypeArgs = {
  id: Scalars['ID']['input'];
};


export type MutationdeleteProductVariantArgs = {
  id: Scalars['ID']['input'];
};


export type MutationdeleteTagArgs = {
  id: Scalars['ID']['input'];
};


export type MutationupdateCategoryArgs = {
  id: Scalars['ID']['input'];
  input: UpdateCategoryInput;
};


export type MutationupdateCollectionArgs = {
  id: Scalars['ID']['input'];
  input: UpdateCollectionInput;
};


export type MutationupdateProductArgs = {
  id: Scalars['ID']['input'];
  input: UpdateProductInput;
};


export type MutationupdateProductTypeArgs = {
  id: Scalars['ID']['input'];
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  value?: InputMaybe<Scalars['String']['input']>;
};


export type MutationupdateProductVariantArgs = {
  id: Scalars['ID']['input'];
  input: UpdateVariantInput;
};


export type MutationuploadProductImageArgs = {
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  productId: Scalars['ID']['input'];
  rank?: InputMaybe<Scalars['Int']['input']>;
  url: Scalars['String']['input'];
};

export type OptionPayload = {
  __typename?: 'OptionPayload';
  errors?: Maybe<Array<Error>>;
  option?: Maybe<ProductOption>;
  values?: Maybe<Array<ProductOptionValue>>;
};

export type OptionValuePayload = {
  __typename?: 'OptionValuePayload';
  errors?: Maybe<Array<Error>>;
  optionValue?: Maybe<ProductOptionValue>;
};

/** Page information for cursor-based pagination */
export type PageInfo = {
  __typename?: 'PageInfo';
  /** Cursor for the last item in this page */
  endCursor?: Maybe<Scalars['String']['output']>;
  /** Whether there are more items after this page */
  hasNextPage: Scalars['Boolean']['output'];
  /** Whether there are items before this page */
  hasPreviousPage: Scalars['Boolean']['output'];
  /** Cursor for the first item in this page */
  startCursor?: Maybe<Scalars['String']['output']>;
};

/** Pagination input for list queries */
export type PaginationInput = {
  /** Cursor for cursor-based pagination */
  cursor?: InputMaybe<Scalars['String']['input']>;
  /** Number of items to return (max 100) */
  limit?: InputMaybe<Scalars['Int']['input']>;
  /** Number of items to skip */
  offset?: InputMaybe<Scalars['Int']['input']>;
};

/** Core product entity representing a marketplace item */
export type Product = {
  __typename?: 'Product';
  categories: Array<ProductCategory>;
  collection?: Maybe<ProductCollection>;
  createdAt: Scalars['DateTime']['output'];
  description?: Maybe<Scalars['String']['output']>;
  discountable: Scalars['Boolean']['output'];
  externalId?: Maybe<Scalars['String']['output']>;
  handle: Scalars['String']['output'];
  height?: Maybe<Scalars['String']['output']>;
  hsCode?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  images: Array<ProductImage>;
  isGiftcard: Scalars['Boolean']['output'];
  length?: Maybe<Scalars['String']['output']>;
  material?: Maybe<Scalars['String']['output']>;
  metadata?: Maybe<Scalars['JSON']['output']>;
  midCode?: Maybe<Scalars['String']['output']>;
  options: Array<ProductOption>;
  originCountry?: Maybe<Scalars['String']['output']>;
  status: ProductStatus;
  subtitle?: Maybe<Scalars['String']['output']>;
  tags: Array<ProductTag>;
  thumbnail?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  type?: Maybe<ProductType>;
  updatedAt: Scalars['DateTime']['output'];
  variants: Array<ProductVariant>;
  weight?: Maybe<Scalars['String']['output']>;
  width?: Maybe<Scalars['String']['output']>;
};

/** Hierarchical product category using adjacency list pattern */
export type ProductCategory = {
  __typename?: 'ProductCategory';
  children: Array<ProductCategory>;
  createdAt: Scalars['DateTime']['output'];
  description: Scalars['String']['output'];
  handle: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  image?: Maybe<ProductImage>;
  isActive: Scalars['Boolean']['output'];
  isInternal: Scalars['Boolean']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  name: Scalars['String']['output'];
  parent?: Maybe<ProductCategory>;
  products: Array<Product>;
  rank: Scalars['Int']['output'];
  thumbnail?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type ProductCollection = {
  __typename?: 'ProductCollection';
  createdAt: Scalars['DateTime']['output'];
  handle: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  products: Array<Product>;
  title: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

/** Product connection for pagination */
export type ProductConnection = {
  __typename?: 'ProductConnection';
  nodes: Array<Product>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

/** Product filter input for list queries */
export type ProductFilter = {
  collectionId?: InputMaybe<Scalars['ID']['input']>;
  discountable?: InputMaybe<Scalars['Boolean']['input']>;
  isGiftcard?: InputMaybe<Scalars['Boolean']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<ProductStatus>;
  typeId?: InputMaybe<Scalars['ID']['input']>;
};

export type ProductImage = {
  __typename?: 'ProductImage';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  product: Product;
  rank: Scalars['Int']['output'];
  updatedAt: Scalars['DateTime']['output'];
  url: Scalars['String']['output'];
  variants: Array<ProductVariant>;
};

/** Product option defining a variant dimension (e.g., Color, Size) */
export type ProductOption = {
  __typename?: 'ProductOption';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  product: Product;
  title: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  values: Array<ProductOptionValue>;
};

/** Specific value for a product option (e.g., "Red" for Color) */
export type ProductOptionValue = {
  __typename?: 'ProductOptionValue';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  option: ProductOption;
  updatedAt: Scalars['DateTime']['output'];
  value: Scalars['String']['output'];
  variants: Array<ProductVariant>;
};

/** Product mutation response payload */
export type ProductPayload = {
  __typename?: 'ProductPayload';
  errors?: Maybe<Array<Error>>;
  product?: Maybe<Product>;
};

/** Product sort options */
export type ProductSort = {
  direction?: InputMaybe<SortDirection>;
  field: ProductSortField;
};

export type ProductSortField =
  | 'CREATED_AT'
  | 'STATUS'
  | 'TITLE'
  | 'UPDATED_AT';

/** Product status enum */
export type ProductStatus =
  | 'DRAFT'
  | 'PROPOSED'
  | 'PUBLISHED'
  | 'REJECTED';

export type ProductTag = {
  __typename?: 'ProductTag';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  products: Array<Product>;
  updatedAt: Scalars['DateTime']['output'];
  value: Scalars['String']['output'];
};

export type ProductType = {
  __typename?: 'ProductType';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  products: Array<Product>;
  updatedAt: Scalars['DateTime']['output'];
  value: Scalars['String']['output'];
};

/** Product variant representing a specific variation of a product */
export type ProductVariant = {
  __typename?: 'ProductVariant';
  allowBackorder: Scalars['Boolean']['output'];
  barcode?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  ean?: Maybe<Scalars['String']['output']>;
  height?: Maybe<Scalars['Int']['output']>;
  hsCode?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  images: Array<ProductImage>;
  length?: Maybe<Scalars['Int']['output']>;
  manageInventory: Scalars['Boolean']['output'];
  material?: Maybe<Scalars['String']['output']>;
  metadata?: Maybe<Scalars['JSON']['output']>;
  midCode?: Maybe<Scalars['String']['output']>;
  optionValues: Array<ProductOptionValue>;
  originCountry?: Maybe<Scalars['String']['output']>;
  product: Product;
  sku?: Maybe<Scalars['String']['output']>;
  thumbnail?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  upc?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
  variantRank: Scalars['Int']['output'];
  weight?: Maybe<Scalars['Int']['output']>;
  width?: Maybe<Scalars['Int']['output']>;
};

export type Query = {
  __typename?: 'Query';
  /** Get a single category by ID */
  category?: Maybe<ProductCategory>;
  /** Get category tree starting from a root (or all roots if not specified) */
  categoryTree: Array<CategoryNode>;
  collection?: Maybe<ProductCollection>;
  /** Get a single product by ID */
  product?: Maybe<Product>;
  productOptions: Array<ProductOption>;
  productType?: Maybe<ProductType>;
  productTypes: Array<ProductType>;
  /** List products with filtering and pagination */
  products: ProductConnection;
  productsByCollection: ProductConnection;
  tag?: Maybe<ProductTag>;
  tags: Array<ProductTag>;
  /** Get a single variant by ID */
  variant?: Maybe<ProductVariant>;
};


export type QuerycategoryArgs = {
  id: Scalars['ID']['input'];
};


export type QuerycategoryTreeArgs = {
  rootCategoryId?: InputMaybe<Scalars['ID']['input']>;
};


export type QuerycollectionArgs = {
  id: Scalars['ID']['input'];
};


export type QueryproductArgs = {
  id: Scalars['ID']['input'];
};


export type QueryproductOptionsArgs = {
  productId: Scalars['ID']['input'];
};


export type QueryproductTypeArgs = {
  id: Scalars['ID']['input'];
};


export type QueryproductsArgs = {
  filter?: InputMaybe<ProductFilter>;
  pagination?: InputMaybe<PaginationInput>;
  sort?: InputMaybe<ProductSort>;
};


export type QueryproductsByCollectionArgs = {
  collectionId: Scalars['ID']['input'];
  pagination?: InputMaybe<PaginationInput>;
};


export type QuerytagArgs = {
  id: Scalars['ID']['input'];
};


export type QuerytagsArgs = {
  filter?: InputMaybe<TagFilter>;
};


export type QueryvariantArgs = {
  id: Scalars['ID']['input'];
};

/** Sort direction enum */
export type SortDirection =
  | 'ASC'
  | 'DESC';

export type TagFilter = {
  search?: InputMaybe<Scalars['String']['input']>;
  value?: InputMaybe<Scalars['String']['input']>;
};

export type TagPayload = {
  __typename?: 'TagPayload';
  errors?: Maybe<Array<Error>>;
  tag?: Maybe<ProductTag>;
};

export type TypePayload = {
  __typename?: 'TypePayload';
  errors?: Maybe<Array<Error>>;
  type?: Maybe<ProductType>;
};

/** Input for updating an existing category */
export type UpdateCategoryInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  expectedUpdatedAt: Scalars['DateTime']['input'];
  handle?: InputMaybe<Scalars['String']['input']>;
  imageId?: InputMaybe<Scalars['String']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  isInternal?: InputMaybe<Scalars['Boolean']['input']>;
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  parentId?: InputMaybe<Scalars['ID']['input']>;
  rank?: InputMaybe<Scalars['Int']['input']>;
  thumbnail?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCollectionInput = {
  expectedUpdatedAt: Scalars['DateTime']['input'];
  handle?: InputMaybe<Scalars['String']['input']>;
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};

/** Input for updating an existing product */
export type UpdateProductInput = {
  collectionId?: InputMaybe<Scalars['ID']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  discountable?: InputMaybe<Scalars['Boolean']['input']>;
  expectedUpdatedAt: Scalars['DateTime']['input'];
  externalId?: InputMaybe<Scalars['String']['input']>;
  height?: InputMaybe<Scalars['String']['input']>;
  hsCode?: InputMaybe<Scalars['String']['input']>;
  length?: InputMaybe<Scalars['String']['input']>;
  material?: InputMaybe<Scalars['String']['input']>;
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  midCode?: InputMaybe<Scalars['String']['input']>;
  originCountry?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<ProductStatus>;
  subtitle?: InputMaybe<Scalars['String']['input']>;
  thumbnail?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  typeId?: InputMaybe<Scalars['ID']['input']>;
  weight?: InputMaybe<Scalars['String']['input']>;
  width?: InputMaybe<Scalars['String']['input']>;
};

/** Input for updating an existing variant */
export type UpdateVariantInput = {
  allowBackorder?: InputMaybe<Scalars['Boolean']['input']>;
  barcode?: InputMaybe<Scalars['String']['input']>;
  ean?: InputMaybe<Scalars['String']['input']>;
  expectedUpdatedAt: Scalars['DateTime']['input'];
  height?: InputMaybe<Scalars['Int']['input']>;
  hsCode?: InputMaybe<Scalars['String']['input']>;
  length?: InputMaybe<Scalars['Int']['input']>;
  manageInventory?: InputMaybe<Scalars['Boolean']['input']>;
  material?: InputMaybe<Scalars['String']['input']>;
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  midCode?: InputMaybe<Scalars['String']['input']>;
  originCountry?: InputMaybe<Scalars['String']['input']>;
  sku?: InputMaybe<Scalars['String']['input']>;
  thumbnail?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  upc?: InputMaybe<Scalars['String']['input']>;
  variantRank?: InputMaybe<Scalars['Int']['input']>;
  weight?: InputMaybe<Scalars['Int']['input']>;
  width?: InputMaybe<Scalars['Int']['input']>;
};

/** Variant mutation response payload */
export type VariantPayload = {
  __typename?: 'VariantPayload';
  errors?: Maybe<Array<Error>>;
  variant?: Maybe<ProductVariant>;
};



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;





/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  BooleanPayload: ResolverTypeWrapper<BooleanPayload>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  CategoryNode: ResolverTypeWrapper<Omit<CategoryNode, 'category' | 'children'> & { category: ResolversTypes['ProductCategory'], children: Array<ResolversTypes['CategoryNode']> }>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  CategoryPayload: ResolverTypeWrapper<Omit<CategoryPayload, 'category'> & { category?: Maybe<ResolversTypes['ProductCategory']> }>;
  CollectionPayload: ResolverTypeWrapper<Omit<CollectionPayload, 'collection'> & { collection?: Maybe<ResolversTypes['ProductCollection']> }>;
  CreateCategoryInput: CreateCategoryInput;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  CreateCollectionInput: CreateCollectionInput;
  CreateProductInput: CreateProductInput;
  CreateProductOptionInput: CreateProductOptionInput;
  CreateVariantInput: CreateVariantInput;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  DeletePayload: ResolverTypeWrapper<DeletePayload>;
  Error: ResolverTypeWrapper<Error>;
  ImagePayload: ResolverTypeWrapper<Omit<ImagePayload, 'image'> & { image?: Maybe<ResolversTypes['ProductImage']> }>;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  OptionPayload: ResolverTypeWrapper<Omit<OptionPayload, 'option' | 'values'> & { option?: Maybe<ResolversTypes['ProductOption']>, values?: Maybe<Array<ResolversTypes['ProductOptionValue']>> }>;
  OptionValuePayload: ResolverTypeWrapper<Omit<OptionValuePayload, 'optionValue'> & { optionValue?: Maybe<ResolversTypes['ProductOptionValue']> }>;
  PageInfo: ResolverTypeWrapper<PageInfo>;
  PaginationInput: PaginationInput;
  Product: ResolverTypeWrapper<Omit<Product, 'categories' | 'collection' | 'images' | 'options' | 'status' | 'tags' | 'type' | 'variants'> & { categories: Array<ResolversTypes['ProductCategory']>, collection?: Maybe<ResolversTypes['ProductCollection']>, images: Array<ResolversTypes['ProductImage']>, options: Array<ResolversTypes['ProductOption']>, status: ResolversTypes['ProductStatus'], tags: Array<ResolversTypes['ProductTag']>, type?: Maybe<ResolversTypes['ProductType']>, variants: Array<ResolversTypes['ProductVariant']> }>;
  ProductCategory: ResolverTypeWrapper<Omit<ProductCategory, 'children' | 'image' | 'parent' | 'products'> & { children: Array<ResolversTypes['ProductCategory']>, image?: Maybe<ResolversTypes['ProductImage']>, parent?: Maybe<ResolversTypes['ProductCategory']>, products: Array<ResolversTypes['Product']> }>;
  ProductCollection: ResolverTypeWrapper<Omit<ProductCollection, 'products'> & { products: Array<ResolversTypes['Product']> }>;
  ProductConnection: ResolverTypeWrapper<Omit<ProductConnection, 'nodes'> & { nodes: Array<ResolversTypes['Product']> }>;
  ProductFilter: ProductFilter;
  ProductImage: ResolverTypeWrapper<Omit<ProductImage, 'product' | 'variants'> & { product: ResolversTypes['Product'], variants: Array<ResolversTypes['ProductVariant']> }>;
  ProductOption: ResolverTypeWrapper<Omit<ProductOption, 'product' | 'values'> & { product: ResolversTypes['Product'], values: Array<ResolversTypes['ProductOptionValue']> }>;
  ProductOptionValue: ResolverTypeWrapper<Omit<ProductOptionValue, 'option' | 'variants'> & { option: ResolversTypes['ProductOption'], variants: Array<ResolversTypes['ProductVariant']> }>;
  ProductPayload: ResolverTypeWrapper<Omit<ProductPayload, 'product'> & { product?: Maybe<ResolversTypes['Product']> }>;
  ProductSort: ProductSort;
  ProductSortField: ResolverTypeWrapper<'CREATED_AT' | 'STATUS' | 'TITLE' | 'UPDATED_AT'>;
  ProductStatus: ResolverTypeWrapper<'DRAFT' | 'PROPOSED' | 'PUBLISHED' | 'REJECTED'>;
  ProductTag: ResolverTypeWrapper<Omit<ProductTag, 'products'> & { products: Array<ResolversTypes['Product']> }>;
  ProductType: ResolverTypeWrapper<Omit<ProductType, 'products'> & { products: Array<ResolversTypes['Product']> }>;
  ProductVariant: ResolverTypeWrapper<Omit<ProductVariant, 'images' | 'optionValues' | 'product'> & { images: Array<ResolversTypes['ProductImage']>, optionValues: Array<ResolversTypes['ProductOptionValue']>, product: ResolversTypes['Product'] }>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  SortDirection: ResolverTypeWrapper<'ASC' | 'DESC'>;
  TagFilter: TagFilter;
  TagPayload: ResolverTypeWrapper<Omit<TagPayload, 'tag'> & { tag?: Maybe<ResolversTypes['ProductTag']> }>;
  TypePayload: ResolverTypeWrapper<Omit<TypePayload, 'type'> & { type?: Maybe<ResolversTypes['ProductType']> }>;
  UpdateCategoryInput: UpdateCategoryInput;
  UpdateCollectionInput: UpdateCollectionInput;
  UpdateProductInput: UpdateProductInput;
  UpdateVariantInput: UpdateVariantInput;
  VariantPayload: ResolverTypeWrapper<Omit<VariantPayload, 'variant'> & { variant?: Maybe<ResolversTypes['ProductVariant']> }>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  BooleanPayload: BooleanPayload;
  String: Scalars['String']['output'];
  Boolean: Scalars['Boolean']['output'];
  CategoryNode: Omit<CategoryNode, 'category' | 'children'> & { category: ResolversParentTypes['ProductCategory'], children: Array<ResolversParentTypes['CategoryNode']> };
  Int: Scalars['Int']['output'];
  CategoryPayload: Omit<CategoryPayload, 'category'> & { category?: Maybe<ResolversParentTypes['ProductCategory']> };
  CollectionPayload: Omit<CollectionPayload, 'collection'> & { collection?: Maybe<ResolversParentTypes['ProductCollection']> };
  CreateCategoryInput: CreateCategoryInput;
  ID: Scalars['ID']['output'];
  CreateCollectionInput: CreateCollectionInput;
  CreateProductInput: CreateProductInput;
  CreateProductOptionInput: CreateProductOptionInput;
  CreateVariantInput: CreateVariantInput;
  DateTime: Scalars['DateTime']['output'];
  DeletePayload: DeletePayload;
  Error: Error;
  ImagePayload: Omit<ImagePayload, 'image'> & { image?: Maybe<ResolversParentTypes['ProductImage']> };
  JSON: Scalars['JSON']['output'];
  Mutation: Record<PropertyKey, never>;
  OptionPayload: Omit<OptionPayload, 'option' | 'values'> & { option?: Maybe<ResolversParentTypes['ProductOption']>, values?: Maybe<Array<ResolversParentTypes['ProductOptionValue']>> };
  OptionValuePayload: Omit<OptionValuePayload, 'optionValue'> & { optionValue?: Maybe<ResolversParentTypes['ProductOptionValue']> };
  PageInfo: PageInfo;
  PaginationInput: PaginationInput;
  Product: Omit<Product, 'categories' | 'collection' | 'images' | 'options' | 'tags' | 'type' | 'variants'> & { categories: Array<ResolversParentTypes['ProductCategory']>, collection?: Maybe<ResolversParentTypes['ProductCollection']>, images: Array<ResolversParentTypes['ProductImage']>, options: Array<ResolversParentTypes['ProductOption']>, tags: Array<ResolversParentTypes['ProductTag']>, type?: Maybe<ResolversParentTypes['ProductType']>, variants: Array<ResolversParentTypes['ProductVariant']> };
  ProductCategory: Omit<ProductCategory, 'children' | 'image' | 'parent' | 'products'> & { children: Array<ResolversParentTypes['ProductCategory']>, image?: Maybe<ResolversParentTypes['ProductImage']>, parent?: Maybe<ResolversParentTypes['ProductCategory']>, products: Array<ResolversParentTypes['Product']> };
  ProductCollection: Omit<ProductCollection, 'products'> & { products: Array<ResolversParentTypes['Product']> };
  ProductConnection: Omit<ProductConnection, 'nodes'> & { nodes: Array<ResolversParentTypes['Product']> };
  ProductFilter: ProductFilter;
  ProductImage: Omit<ProductImage, 'product' | 'variants'> & { product: ResolversParentTypes['Product'], variants: Array<ResolversParentTypes['ProductVariant']> };
  ProductOption: Omit<ProductOption, 'product' | 'values'> & { product: ResolversParentTypes['Product'], values: Array<ResolversParentTypes['ProductOptionValue']> };
  ProductOptionValue: Omit<ProductOptionValue, 'option' | 'variants'> & { option: ResolversParentTypes['ProductOption'], variants: Array<ResolversParentTypes['ProductVariant']> };
  ProductPayload: Omit<ProductPayload, 'product'> & { product?: Maybe<ResolversParentTypes['Product']> };
  ProductSort: ProductSort;
  ProductTag: Omit<ProductTag, 'products'> & { products: Array<ResolversParentTypes['Product']> };
  ProductType: Omit<ProductType, 'products'> & { products: Array<ResolversParentTypes['Product']> };
  ProductVariant: Omit<ProductVariant, 'images' | 'optionValues' | 'product'> & { images: Array<ResolversParentTypes['ProductImage']>, optionValues: Array<ResolversParentTypes['ProductOptionValue']>, product: ResolversParentTypes['Product'] };
  Query: Record<PropertyKey, never>;
  TagFilter: TagFilter;
  TagPayload: Omit<TagPayload, 'tag'> & { tag?: Maybe<ResolversParentTypes['ProductTag']> };
  TypePayload: Omit<TypePayload, 'type'> & { type?: Maybe<ResolversParentTypes['ProductType']> };
  UpdateCategoryInput: UpdateCategoryInput;
  UpdateCollectionInput: UpdateCollectionInput;
  UpdateProductInput: UpdateProductInput;
  UpdateVariantInput: UpdateVariantInput;
  VariantPayload: Omit<VariantPayload, 'variant'> & { variant?: Maybe<ResolversParentTypes['ProductVariant']> };
};

export type BooleanPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['BooleanPayload'] = ResolversParentTypes['BooleanPayload']> = {
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
};

export type CategoryNodeResolvers<ContextType = any, ParentType extends ResolversParentTypes['CategoryNode'] = ResolversParentTypes['CategoryNode']> = {
  category?: Resolver<ResolversTypes['ProductCategory'], ParentType, ContextType>;
  children?: Resolver<Array<ResolversTypes['CategoryNode']>, ParentType, ContextType>;
  depth?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type CategoryPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['CategoryPayload'] = ResolversParentTypes['CategoryPayload']> = {
  category?: Resolver<Maybe<ResolversTypes['ProductCategory']>, ParentType, ContextType>;
  errors?: Resolver<Maybe<Array<ResolversTypes['Error']>>, ParentType, ContextType>;
};

export type CollectionPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['CollectionPayload'] = ResolversParentTypes['CollectionPayload']> = {
  collection?: Resolver<Maybe<ResolversTypes['ProductCollection']>, ParentType, ContextType>;
  errors?: Resolver<Maybe<Array<ResolversTypes['Error']>>, ParentType, ContextType>;
};

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export type DeletePayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['DeletePayload'] = ResolversParentTypes['DeletePayload']> = {
  deletedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
};

export type ErrorResolvers<ContextType = any, ParentType extends ResolversParentTypes['Error'] = ResolversParentTypes['Error']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  field?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ImagePayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['ImagePayload'] = ResolversParentTypes['ImagePayload']> = {
  errors?: Resolver<Maybe<Array<ResolversTypes['Error']>>, ParentType, ContextType>;
  image?: Resolver<Maybe<ResolversTypes['ProductImage']>, ParentType, ContextType>;
};

export interface JSONScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type MutationResolvers<ContextType = any, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  addOptionValue?: Resolver<ResolversTypes['OptionValuePayload'], ParentType, ContextType, RequireFields<MutationaddOptionValueArgs, 'optionId' | 'value'>>;
  assignProductToCategories?: Resolver<ResolversTypes['ProductPayload'], ParentType, ContextType, RequireFields<MutationassignProductToCategoriesArgs, 'categoryIds' | 'productId'>>;
  assignTagsToProduct?: Resolver<ResolversTypes['ProductPayload'], ParentType, ContextType, RequireFields<MutationassignTagsToProductArgs, 'productId' | 'tagIds'>>;
  associateImageWithVariant?: Resolver<ResolversTypes['BooleanPayload'], ParentType, ContextType, RequireFields<MutationassociateImageWithVariantArgs, 'imageId' | 'variantId'>>;
  associateVariantOptions?: Resolver<ResolversTypes['VariantPayload'], ParentType, ContextType, RequireFields<MutationassociateVariantOptionsArgs, 'optionValueIds' | 'variantId'>>;
  createCategory?: Resolver<ResolversTypes['CategoryPayload'], ParentType, ContextType, RequireFields<MutationcreateCategoryArgs, 'input'>>;
  createCollection?: Resolver<ResolversTypes['CollectionPayload'], ParentType, ContextType, RequireFields<MutationcreateCollectionArgs, 'input'>>;
  createProduct?: Resolver<ResolversTypes['ProductPayload'], ParentType, ContextType, RequireFields<MutationcreateProductArgs, 'input'>>;
  createProductOption?: Resolver<ResolversTypes['OptionPayload'], ParentType, ContextType, RequireFields<MutationcreateProductOptionArgs, 'productId' | 'title' | 'values'>>;
  createProductType?: Resolver<ResolversTypes['TypePayload'], ParentType, ContextType, RequireFields<MutationcreateProductTypeArgs, 'value'>>;
  createProductVariant?: Resolver<ResolversTypes['VariantPayload'], ParentType, ContextType, RequireFields<MutationcreateProductVariantArgs, 'input' | 'productId'>>;
  createTag?: Resolver<ResolversTypes['TagPayload'], ParentType, ContextType, RequireFields<MutationcreateTagArgs, 'value'>>;
  deleteCategory?: Resolver<ResolversTypes['DeletePayload'], ParentType, ContextType, RequireFields<MutationdeleteCategoryArgs, 'id'>>;
  deleteCollection?: Resolver<ResolversTypes['DeletePayload'], ParentType, ContextType, RequireFields<MutationdeleteCollectionArgs, 'id'>>;
  deleteOptionValue?: Resolver<ResolversTypes['DeletePayload'], ParentType, ContextType, RequireFields<MutationdeleteOptionValueArgs, 'id'>>;
  deleteProduct?: Resolver<ResolversTypes['DeletePayload'], ParentType, ContextType, RequireFields<MutationdeleteProductArgs, 'id'>>;
  deleteProductImage?: Resolver<ResolversTypes['DeletePayload'], ParentType, ContextType, RequireFields<MutationdeleteProductImageArgs, 'id'>>;
  deleteProductType?: Resolver<ResolversTypes['DeletePayload'], ParentType, ContextType, RequireFields<MutationdeleteProductTypeArgs, 'id'>>;
  deleteProductVariant?: Resolver<ResolversTypes['DeletePayload'], ParentType, ContextType, RequireFields<MutationdeleteProductVariantArgs, 'id'>>;
  deleteTag?: Resolver<ResolversTypes['DeletePayload'], ParentType, ContextType, RequireFields<MutationdeleteTagArgs, 'id'>>;
  updateCategory?: Resolver<ResolversTypes['CategoryPayload'], ParentType, ContextType, RequireFields<MutationupdateCategoryArgs, 'id' | 'input'>>;
  updateCollection?: Resolver<ResolversTypes['CollectionPayload'], ParentType, ContextType, RequireFields<MutationupdateCollectionArgs, 'id' | 'input'>>;
  updateProduct?: Resolver<ResolversTypes['ProductPayload'], ParentType, ContextType, RequireFields<MutationupdateProductArgs, 'id' | 'input'>>;
  updateProductType?: Resolver<ResolversTypes['TypePayload'], ParentType, ContextType, RequireFields<MutationupdateProductTypeArgs, 'id'>>;
  updateProductVariant?: Resolver<ResolversTypes['VariantPayload'], ParentType, ContextType, RequireFields<MutationupdateProductVariantArgs, 'id' | 'input'>>;
  uploadProductImage?: Resolver<ResolversTypes['ImagePayload'], ParentType, ContextType, RequireFields<MutationuploadProductImageArgs, 'productId' | 'url'>>;
};

export type OptionPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['OptionPayload'] = ResolversParentTypes['OptionPayload']> = {
  errors?: Resolver<Maybe<Array<ResolversTypes['Error']>>, ParentType, ContextType>;
  option?: Resolver<Maybe<ResolversTypes['ProductOption']>, ParentType, ContextType>;
  values?: Resolver<Maybe<Array<ResolversTypes['ProductOptionValue']>>, ParentType, ContextType>;
};

export type OptionValuePayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['OptionValuePayload'] = ResolversParentTypes['OptionValuePayload']> = {
  errors?: Resolver<Maybe<Array<ResolversTypes['Error']>>, ParentType, ContextType>;
  optionValue?: Resolver<Maybe<ResolversTypes['ProductOptionValue']>, ParentType, ContextType>;
};

export type PageInfoResolvers<ContextType = any, ParentType extends ResolversParentTypes['PageInfo'] = ResolversParentTypes['PageInfo']> = {
  endCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  hasPreviousPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  startCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type ProductResolvers<ContextType = any, ParentType extends ResolversParentTypes['Product'] = ResolversParentTypes['Product']> = {
  categories?: Resolver<Array<ResolversTypes['ProductCategory']>, ParentType, ContextType>;
  collection?: Resolver<Maybe<ResolversTypes['ProductCollection']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  discountable?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  externalId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  handle?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  height?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hsCode?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  images?: Resolver<Array<ResolversTypes['ProductImage']>, ParentType, ContextType>;
  isGiftcard?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  length?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  material?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  midCode?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  options?: Resolver<Array<ResolversTypes['ProductOption']>, ParentType, ContextType>;
  originCountry?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['ProductStatus'], ParentType, ContextType>;
  subtitle?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  tags?: Resolver<Array<ResolversTypes['ProductTag']>, ParentType, ContextType>;
  thumbnail?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  type?: Resolver<Maybe<ResolversTypes['ProductType']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  variants?: Resolver<Array<ResolversTypes['ProductVariant']>, ParentType, ContextType>;
  weight?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  width?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type ProductCategoryResolvers<ContextType = any, ParentType extends ResolversParentTypes['ProductCategory'] = ResolversParentTypes['ProductCategory']> = {
  children?: Resolver<Array<ResolversTypes['ProductCategory']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  handle?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  image?: Resolver<Maybe<ResolversTypes['ProductImage']>, ParentType, ContextType>;
  isActive?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  isInternal?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  parent?: Resolver<Maybe<ResolversTypes['ProductCategory']>, ParentType, ContextType>;
  products?: Resolver<Array<ResolversTypes['Product']>, ParentType, ContextType>;
  rank?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  thumbnail?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type ProductCollectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['ProductCollection'] = ResolversParentTypes['ProductCollection']> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  handle?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  products?: Resolver<Array<ResolversTypes['Product']>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type ProductConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['ProductConnection'] = ResolversParentTypes['ProductConnection']> = {
  nodes?: Resolver<Array<ResolversTypes['Product']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  totalCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type ProductImageResolvers<ContextType = any, ParentType extends ResolversParentTypes['ProductImage'] = ResolversParentTypes['ProductImage']> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  product?: Resolver<ResolversTypes['Product'], ParentType, ContextType>;
  rank?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  variants?: Resolver<Array<ResolversTypes['ProductVariant']>, ParentType, ContextType>;
};

export type ProductOptionResolvers<ContextType = any, ParentType extends ResolversParentTypes['ProductOption'] = ResolversParentTypes['ProductOption']> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  product?: Resolver<ResolversTypes['Product'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  values?: Resolver<Array<ResolversTypes['ProductOptionValue']>, ParentType, ContextType>;
};

export type ProductOptionValueResolvers<ContextType = any, ParentType extends ResolversParentTypes['ProductOptionValue'] = ResolversParentTypes['ProductOptionValue']> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  option?: Resolver<ResolversTypes['ProductOption'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  value?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  variants?: Resolver<Array<ResolversTypes['ProductVariant']>, ParentType, ContextType>;
};

export type ProductPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['ProductPayload'] = ResolversParentTypes['ProductPayload']> = {
  errors?: Resolver<Maybe<Array<ResolversTypes['Error']>>, ParentType, ContextType>;
  product?: Resolver<Maybe<ResolversTypes['Product']>, ParentType, ContextType>;
};

export type ProductSortFieldResolvers = EnumResolverSignature<{ CREATED_AT?: any, STATUS?: any, TITLE?: any, UPDATED_AT?: any }, ResolversTypes['ProductSortField']>;

export type ProductStatusResolvers = EnumResolverSignature<{ DRAFT?: any, PROPOSED?: any, PUBLISHED?: any, REJECTED?: any }, ResolversTypes['ProductStatus']>;

export type ProductTagResolvers<ContextType = any, ParentType extends ResolversParentTypes['ProductTag'] = ResolversParentTypes['ProductTag']> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  products?: Resolver<Array<ResolversTypes['Product']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  value?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ProductTypeResolvers<ContextType = any, ParentType extends ResolversParentTypes['ProductType'] = ResolversParentTypes['ProductType']> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  products?: Resolver<Array<ResolversTypes['Product']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  value?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ProductVariantResolvers<ContextType = any, ParentType extends ResolversParentTypes['ProductVariant'] = ResolversParentTypes['ProductVariant']> = {
  allowBackorder?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  barcode?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  ean?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  height?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  hsCode?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  images?: Resolver<Array<ResolversTypes['ProductImage']>, ParentType, ContextType>;
  length?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  manageInventory?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  material?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  midCode?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  optionValues?: Resolver<Array<ResolversTypes['ProductOptionValue']>, ParentType, ContextType>;
  originCountry?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  product?: Resolver<ResolversTypes['Product'], ParentType, ContextType>;
  sku?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  thumbnail?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  upc?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  variantRank?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  weight?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  width?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  category?: Resolver<Maybe<ResolversTypes['ProductCategory']>, ParentType, ContextType, RequireFields<QuerycategoryArgs, 'id'>>;
  categoryTree?: Resolver<Array<ResolversTypes['CategoryNode']>, ParentType, ContextType, Partial<QuerycategoryTreeArgs>>;
  collection?: Resolver<Maybe<ResolversTypes['ProductCollection']>, ParentType, ContextType, RequireFields<QuerycollectionArgs, 'id'>>;
  product?: Resolver<Maybe<ResolversTypes['Product']>, ParentType, ContextType, RequireFields<QueryproductArgs, 'id'>>;
  productOptions?: Resolver<Array<ResolversTypes['ProductOption']>, ParentType, ContextType, RequireFields<QueryproductOptionsArgs, 'productId'>>;
  productType?: Resolver<Maybe<ResolversTypes['ProductType']>, ParentType, ContextType, RequireFields<QueryproductTypeArgs, 'id'>>;
  productTypes?: Resolver<Array<ResolversTypes['ProductType']>, ParentType, ContextType>;
  products?: Resolver<ResolversTypes['ProductConnection'], ParentType, ContextType, Partial<QueryproductsArgs>>;
  productsByCollection?: Resolver<ResolversTypes['ProductConnection'], ParentType, ContextType, RequireFields<QueryproductsByCollectionArgs, 'collectionId'>>;
  tag?: Resolver<Maybe<ResolversTypes['ProductTag']>, ParentType, ContextType, RequireFields<QuerytagArgs, 'id'>>;
  tags?: Resolver<Array<ResolversTypes['ProductTag']>, ParentType, ContextType, Partial<QuerytagsArgs>>;
  variant?: Resolver<Maybe<ResolversTypes['ProductVariant']>, ParentType, ContextType, RequireFields<QueryvariantArgs, 'id'>>;
};

export type SortDirectionResolvers = EnumResolverSignature<{ ASC?: any, DESC?: any }, ResolversTypes['SortDirection']>;

export type TagPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['TagPayload'] = ResolversParentTypes['TagPayload']> = {
  errors?: Resolver<Maybe<Array<ResolversTypes['Error']>>, ParentType, ContextType>;
  tag?: Resolver<Maybe<ResolversTypes['ProductTag']>, ParentType, ContextType>;
};

export type TypePayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['TypePayload'] = ResolversParentTypes['TypePayload']> = {
  errors?: Resolver<Maybe<Array<ResolversTypes['Error']>>, ParentType, ContextType>;
  type?: Resolver<Maybe<ResolversTypes['ProductType']>, ParentType, ContextType>;
};

export type VariantPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['VariantPayload'] = ResolversParentTypes['VariantPayload']> = {
  errors?: Resolver<Maybe<Array<ResolversTypes['Error']>>, ParentType, ContextType>;
  variant?: Resolver<Maybe<ResolversTypes['ProductVariant']>, ParentType, ContextType>;
};

export type Resolvers<ContextType = any> = {
  BooleanPayload?: BooleanPayloadResolvers<ContextType>;
  CategoryNode?: CategoryNodeResolvers<ContextType>;
  CategoryPayload?: CategoryPayloadResolvers<ContextType>;
  CollectionPayload?: CollectionPayloadResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  DeletePayload?: DeletePayloadResolvers<ContextType>;
  Error?: ErrorResolvers<ContextType>;
  ImagePayload?: ImagePayloadResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  Mutation?: MutationResolvers<ContextType>;
  OptionPayload?: OptionPayloadResolvers<ContextType>;
  OptionValuePayload?: OptionValuePayloadResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  Product?: ProductResolvers<ContextType>;
  ProductCategory?: ProductCategoryResolvers<ContextType>;
  ProductCollection?: ProductCollectionResolvers<ContextType>;
  ProductConnection?: ProductConnectionResolvers<ContextType>;
  ProductImage?: ProductImageResolvers<ContextType>;
  ProductOption?: ProductOptionResolvers<ContextType>;
  ProductOptionValue?: ProductOptionValueResolvers<ContextType>;
  ProductPayload?: ProductPayloadResolvers<ContextType>;
  ProductSortField?: ProductSortFieldResolvers;
  ProductStatus?: ProductStatusResolvers;
  ProductTag?: ProductTagResolvers<ContextType>;
  ProductType?: ProductTypeResolvers<ContextType>;
  ProductVariant?: ProductVariantResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  SortDirection?: SortDirectionResolvers;
  TagPayload?: TagPayloadResolvers<ContextType>;
  TypePayload?: TypePayloadResolvers<ContextType>;
  VariantPayload?: VariantPayloadResolvers<ContextType>;
};

