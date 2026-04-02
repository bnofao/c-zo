import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { StockLocationRow, StockLocationAddressRow } from '../../services/stock-location.service';
import { GraphQLContext } from '../../types';
export type Maybe<T> = T | null | undefined;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string | number; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  CountryCode: { input: string; output: string; }
  DateTime: { input: Date | string; output: Date | string; }
  JSONObject: { input: Record<string, any>; output: Record<string, any>; }
  PhoneNumber: { input: string; output: string; }
};

export type CreateStockLocationAddressInput = {
  addressLine1: Scalars['String']['input'];
  addressLine2?: InputMaybe<Scalars['String']['input']>;
  city: Scalars['String']['input'];
  countryCode: Scalars['CountryCode']['input'];
  phone?: InputMaybe<Scalars['PhoneNumber']['input']>;
  postalCode?: InputMaybe<Scalars['String']['input']>;
  province?: InputMaybe<Scalars['String']['input']>;
};

export type CreateStockLocationInput = {
  address?: InputMaybe<CreateStockLocationAddressInput>;
  handle?: InputMaybe<Scalars['String']['input']>;
  metadata?: InputMaybe<Scalars['JSONObject']['input']>;
  name: Scalars['String']['input'];
  organization: Scalars['ID']['input'];
};

export type CreateStockLocationPayload = {
  __typename?: 'CreateStockLocationPayload';
  app?: Maybe<StockLocation>;
  userErrors: Array<UserError>;
};

export type Mutation = {
  __typename?: 'Mutation';
  createStockLocation: CreateStockLocationPayload;
};


export type MutationcreateStockLocationArgs = {
  input: CreateStockLocationInput;
};

export type Node = {
  id: Scalars['ID']['output'];
};

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type StockLocation = Node & {
  __typename?: 'StockLocation';
  address?: Maybe<StockLocationAddress>;
  createdAt: Scalars['DateTime']['output'];
  handle: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  isDefault: Scalars['Boolean']['output'];
  metadata?: Maybe<Scalars['JSONObject']['output']>;
  name: Scalars['String']['output'];
  organizationId: Scalars['ID']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type StockLocationAddress = Node & {
  __typename?: 'StockLocationAddress';
  addressLine1: Scalars['String']['output'];
  addressLine2?: Maybe<Scalars['String']['output']>;
  city: Scalars['String']['output'];
  countryCode: Scalars['CountryCode']['output'];
  id: Scalars['ID']['output'];
  phone?: Maybe<Scalars['PhoneNumber']['output']>;
  postalCode?: Maybe<Scalars['String']['output']>;
  province?: Maybe<Scalars['String']['output']>;
};

export type UserError = {
  __typename?: 'UserError';
  code: Scalars['String']['output'];
  field?: Maybe<Array<Scalars['String']['output']>>;
  message: Scalars['String']['output'];
};

export type WithIndex<TObject> = TObject & Record<string, any>;
export type ResolversObject<TObject> = WithIndex<TObject>;

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




/** Mapping of interface types */
export type ResolversInterfaceTypes<_RefType extends Record<string, unknown>> = ResolversObject<{
  Node:
    | ( StockLocationRow & { __typename: 'StockLocation' } )
    | ( StockLocationAddressRow & { __typename: 'StockLocationAddress' } )
  ;
}>;

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = ResolversObject<{
  CountryCode: ResolverTypeWrapper<Scalars['CountryCode']['output']>;
  CreateStockLocationAddressInput: CreateStockLocationAddressInput;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  CreateStockLocationInput: CreateStockLocationInput;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  CreateStockLocationPayload: ResolverTypeWrapper<Omit<CreateStockLocationPayload, 'app'> & { app?: Maybe<ResolversTypes['StockLocation']> }>;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  JSONObject: ResolverTypeWrapper<Scalars['JSONObject']['output']>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Node: ResolverTypeWrapper<ResolversInterfaceTypes<ResolversTypes>['Node']>;
  PageInfo: ResolverTypeWrapper<PageInfo>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  PhoneNumber: ResolverTypeWrapper<Scalars['PhoneNumber']['output']>;
  StockLocation: ResolverTypeWrapper<StockLocationRow>;
  StockLocationAddress: ResolverTypeWrapper<StockLocationAddressRow>;
  UserError: ResolverTypeWrapper<UserError>;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  CountryCode: Scalars['CountryCode']['output'];
  CreateStockLocationAddressInput: CreateStockLocationAddressInput;
  String: Scalars['String']['output'];
  CreateStockLocationInput: CreateStockLocationInput;
  ID: Scalars['ID']['output'];
  CreateStockLocationPayload: Omit<CreateStockLocationPayload, 'app'> & { app?: Maybe<ResolversParentTypes['StockLocation']> };
  DateTime: Scalars['DateTime']['output'];
  JSONObject: Scalars['JSONObject']['output'];
  Mutation: Record<PropertyKey, never>;
  Node: ResolversInterfaceTypes<ResolversParentTypes>['Node'];
  PageInfo: PageInfo;
  Boolean: Scalars['Boolean']['output'];
  PhoneNumber: Scalars['PhoneNumber']['output'];
  StockLocation: StockLocationRow;
  StockLocationAddress: StockLocationAddressRow;
  UserError: UserError;
}>;

export interface CountryCodeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['CountryCode'], any> {
  name: 'CountryCode';
}

export type CreateStockLocationPayloadResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['CreateStockLocationPayload'] = ResolversParentTypes['CreateStockLocationPayload']> = ResolversObject<{
  app?: Resolver<Maybe<ResolversTypes['StockLocation']>, ParentType, ContextType>;
  userErrors?: Resolver<Array<ResolversTypes['UserError']>, ParentType, ContextType>;
}>;

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export interface JSONObjectScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSONObject'], any> {
  name: 'JSONObject';
}

export type MutationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = ResolversObject<{
  createStockLocation?: Resolver<ResolversTypes['CreateStockLocationPayload'], ParentType, ContextType, RequireFields<MutationcreateStockLocationArgs, 'input'>>;
}>;

export type NodeResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Node'] = ResolversParentTypes['Node']> = ResolversObject<{
  __resolveType?: TypeResolveFn<'StockLocation' | 'StockLocationAddress', ParentType, ContextType>;
}>;

export type PageInfoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['PageInfo'] = ResolversParentTypes['PageInfo']> = ResolversObject<{
  endCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  hasPreviousPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  startCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export interface PhoneNumberScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['PhoneNumber'], any> {
  name: 'PhoneNumber';
}

export type StockLocationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['StockLocation'] = ResolversParentTypes['StockLocation']> = ResolversObject<{
  address?: Resolver<Maybe<ResolversTypes['StockLocationAddress']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  handle?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isActive?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  isDefault?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSONObject']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  organizationId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type StockLocationAddressResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['StockLocationAddress'] = ResolversParentTypes['StockLocationAddress']> = ResolversObject<{
  addressLine1?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  addressLine2?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  city?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  countryCode?: Resolver<ResolversTypes['CountryCode'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  phone?: Resolver<Maybe<ResolversTypes['PhoneNumber']>, ParentType, ContextType>;
  postalCode?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  province?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type UserErrorResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['UserError'] = ResolversParentTypes['UserError']> = ResolversObject<{
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  field?: Resolver<Maybe<Array<ResolversTypes['String']>>, ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

export type Resolvers<ContextType = GraphQLContext> = ResolversObject<{
  CountryCode?: GraphQLScalarType;
  CreateStockLocationPayload?: CreateStockLocationPayloadResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  JSONObject?: GraphQLScalarType;
  Mutation?: MutationResolvers<ContextType>;
  Node?: NodeResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  PhoneNumber?: GraphQLScalarType;
  StockLocation?: StockLocationResolvers<ContextType>;
  StockLocationAddress?: StockLocationAddressResolvers<ContextType>;
  UserError?: UserErrorResolvers<ContextType>;
}>;

