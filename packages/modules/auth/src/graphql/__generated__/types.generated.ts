import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { UserWithRole } from 'better-auth/plugins';
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
export type EnumResolverSignature<T, AllowedValues = any> = { [key in keyof T]?: AllowedValues };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string | number; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  DateTime: { input: Date | string; output: Date | string; }
  EmailAddress: { input: string; output: string; }
  JSON: { input: Record<string, unknown> | null; output: Record<string, unknown> | null; }
};

export type ApiKey = {
  __typename?: 'ApiKey';
  createdAt: Scalars['DateTime']['output'];
  enabled: Scalars['Boolean']['output'];
  expiresAt?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  lastRequest?: Maybe<Scalars['DateTime']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  prefix?: Maybe<Scalars['String']['output']>;
  start?: Maybe<Scalars['String']['output']>;
};

export type BooleanFilterInput = {
  eq?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CreateApiKeyInput = {
  expiresIn?: InputMaybe<Scalars['Int']['input']>;
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  name: Scalars['String']['input'];
  prefix?: InputMaybe<Scalars['String']['input']>;
  rateLimitEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  rateLimitMax?: InputMaybe<Scalars['Int']['input']>;
  rateLimitTimeWindow?: InputMaybe<Scalars['Int']['input']>;
  refillAmount?: InputMaybe<Scalars['Int']['input']>;
  refillInterval?: InputMaybe<Scalars['Int']['input']>;
  remaining?: InputMaybe<Scalars['Int']['input']>;
};

export type CreateOrganizationInput = {
  keepCurrentActiveOrganization?: InputMaybe<Scalars['Boolean']['input']>;
  logo?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  slug: Scalars['String']['input'];
  type?: InputMaybe<Scalars['String']['input']>;
};

export type CreateUserInput = {
  email: Scalars['EmailAddress']['input'];
  name: Scalars['String']['input'];
  password?: InputMaybe<Scalars['String']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
};

export type DateTimeFilterInput = {
  eq?: InputMaybe<Scalars['DateTime']['input']>;
  gt?: InputMaybe<Scalars['DateTime']['input']>;
  gte?: InputMaybe<Scalars['DateTime']['input']>;
  lt?: InputMaybe<Scalars['DateTime']['input']>;
  lte?: InputMaybe<Scalars['DateTime']['input']>;
  ne?: InputMaybe<Scalars['DateTime']['input']>;
};

export type FullOrganization = {
  __typename?: 'FullOrganization';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  invitations: Array<Invitation>;
  logo?: Maybe<Scalars['String']['output']>;
  members: Array<OrgMember>;
  metadata?: Maybe<Scalars['JSON']['output']>;
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  type?: Maybe<Scalars['String']['output']>;
};

export type Invitation = {
  __typename?: 'Invitation';
  createdAt: Scalars['DateTime']['output'];
  email: Scalars['EmailAddress']['output'];
  expiresAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  inviterId: Scalars['String']['output'];
  organizationId: Scalars['String']['output'];
  role: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type InviteMemberInput = {
  email: Scalars['EmailAddress']['input'];
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  resend?: InputMaybe<Scalars['Boolean']['input']>;
  role: Scalars['String']['input'];
};

export type MemberRole = {
  __typename?: 'MemberRole';
  role: Scalars['String']['output'];
};

export type MemberUser = {
  __typename?: 'MemberUser';
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  image?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  _empty?: Maybe<Scalars['String']['output']>;
  acceptInvitation: OrgMember;
  banUser: Scalars['Boolean']['output'];
  cancelInvitation: Scalars['Boolean']['output'];
  createApiKey: ApiKey;
  createOrganization: Organization;
  createUser: User;
  deleteApiKey: Scalars['Boolean']['output'];
  deleteOrganization: Scalars['Boolean']['output'];
  impersonateUser: Scalars['Boolean']['output'];
  inviteMember: Invitation;
  leaveOrganization: Scalars['Boolean']['output'];
  rejectInvitation: Scalars['Boolean']['output'];
  removeMember: Scalars['Boolean']['output'];
  removeUser: Scalars['Boolean']['output'];
  revokeSession: Scalars['Boolean']['output'];
  revokeSessions: Scalars['Boolean']['output'];
  setActiveOrganization?: Maybe<Organization>;
  setRole: Scalars['Boolean']['output'];
  stopImpersonation: Scalars['Boolean']['output'];
  unbanUser: Scalars['Boolean']['output'];
  updateApiKey: ApiKey;
  updateMemberRole: Scalars['Boolean']['output'];
  updateOrganization: Organization;
  updateUser: User;
};


export type MutationacceptInvitationArgs = {
  invitationId: Scalars['ID']['input'];
};


export type MutationbanUserArgs = {
  expiresIn?: InputMaybe<Scalars['Int']['input']>;
  reason?: InputMaybe<Scalars['String']['input']>;
  userId: Scalars['ID']['input'];
};


export type MutationcancelInvitationArgs = {
  invitationId: Scalars['ID']['input'];
};


export type MutationcreateApiKeyArgs = {
  input: CreateApiKeyInput;
};


export type MutationcreateOrganizationArgs = {
  input: CreateOrganizationInput;
};


export type MutationcreateUserArgs = {
  input: CreateUserInput;
};


export type MutationdeleteApiKeyArgs = {
  keyId: Scalars['ID']['input'];
};


export type MutationdeleteOrganizationArgs = {
  organizationId: Scalars['ID']['input'];
};


export type MutationimpersonateUserArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationinviteMemberArgs = {
  input: InviteMemberInput;
};


export type MutationleaveOrganizationArgs = {
  organizationId: Scalars['ID']['input'];
};


export type MutationrejectInvitationArgs = {
  invitationId: Scalars['ID']['input'];
};


export type MutationremoveMemberArgs = {
  memberIdOrEmail: Scalars['String']['input'];
  organizationId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationremoveUserArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationrevokeSessionArgs = {
  sessionToken: Scalars['String']['input'];
};


export type MutationrevokeSessionsArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationsetActiveOrganizationArgs = {
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  organizationSlug?: InputMaybe<Scalars['String']['input']>;
};


export type MutationsetRoleArgs = {
  role: Scalars['String']['input'];
  userId: Scalars['ID']['input'];
};


export type MutationunbanUserArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationupdateApiKeyArgs = {
  input: UpdateApiKeyInput;
  keyId: Scalars['ID']['input'];
};


export type MutationupdateMemberRoleArgs = {
  memberId: Scalars['ID']['input'];
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  role: Scalars['String']['input'];
};


export type MutationupdateOrganizationArgs = {
  input: UpdateOrganizationInput;
  organizationId: Scalars['ID']['input'];
};


export type MutationupdateUserArgs = {
  input: UpdateUserInput;
  userId: Scalars['ID']['input'];
};

export type OrderDirection =
  | 'ASC'
  | 'DESC';

export type OrgMember = {
  __typename?: 'OrgMember';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  organizationId: Scalars['String']['output'];
  role: Scalars['String']['output'];
  user?: Maybe<MemberUser>;
  userId: Scalars['String']['output'];
};

export type Organization = {
  __typename?: 'Organization';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  logo?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  type?: Maybe<Scalars['String']['output']>;
};

export type Query = {
  __typename?: 'Query';
  _empty?: Maybe<Scalars['String']['output']>;
  activeMember?: Maybe<OrgMember>;
  activeMemberRole?: Maybe<MemberRole>;
  apiKey?: Maybe<ApiKey>;
  checkSlug: SlugCheckResult;
  invitation?: Maybe<Invitation>;
  invitations: Array<Invitation>;
  members: Array<OrgMember>;
  myApiKeys: Array<ApiKey>;
  organization?: Maybe<FullOrganization>;
  organizations: Array<Organization>;
  user: User;
  userSessions: Array<UserSession>;
  users: UserList;
};


export type QueryactiveMemberRoleArgs = {
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  organizationSlug?: InputMaybe<Scalars['String']['input']>;
  userId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryapiKeyArgs = {
  keyId: Scalars['ID']['input'];
};


export type QuerycheckSlugArgs = {
  slug: Scalars['String']['input'];
};


export type QueryinvitationArgs = {
  invitationId: Scalars['ID']['input'];
};


export type QueryinvitationsArgs = {
  organizationId?: InputMaybe<Scalars['ID']['input']>;
};


export type QuerymembersArgs = {
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  organizationSlug?: InputMaybe<Scalars['String']['input']>;
};


export type QueryorganizationArgs = {
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  organizationSlug?: InputMaybe<Scalars['String']['input']>;
};


export type QueryuserArgs = {
  userId: Scalars['ID']['input'];
};


export type QueryuserSessionsArgs = {
  userId: Scalars['ID']['input'];
};


export type QueryusersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<UserOrderByInput>;
  search?: InputMaybe<Scalars['String']['input']>;
  where?: InputMaybe<UserWhereInput>;
};

export type SlugCheckResult = {
  __typename?: 'SlugCheckResult';
  available: Scalars['Boolean']['output'];
};

export type StringFilterInput = {
  contains?: InputMaybe<Scalars['String']['input']>;
  endsWith?: InputMaybe<Scalars['String']['input']>;
  eq?: InputMaybe<Scalars['String']['input']>;
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  ne?: InputMaybe<Scalars['String']['input']>;
  startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateApiKeyInput = {
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  expiresIn?: InputMaybe<Scalars['Int']['input']>;
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  rateLimitEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  rateLimitMax?: InputMaybe<Scalars['Int']['input']>;
  rateLimitTimeWindow?: InputMaybe<Scalars['Int']['input']>;
  refillAmount?: InputMaybe<Scalars['Int']['input']>;
  refillInterval?: InputMaybe<Scalars['Int']['input']>;
  remaining?: InputMaybe<Scalars['Int']['input']>;
};

export type UpdateOrganizationInput = {
  logo?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateUserInput = {
  email?: InputMaybe<Scalars['EmailAddress']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type User = {
  __typename?: 'User';
  banExpires?: Maybe<Scalars['DateTime']['output']>;
  banReason?: Maybe<Scalars['String']['output']>;
  banned: Scalars['Boolean']['output'];
  createdAt: Scalars['DateTime']['output'];
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  role: Scalars['String']['output'];
};

export type UserList = {
  __typename?: 'UserList';
  total: Scalars['Int']['output'];
  users: Array<User>;
};

export type UserOrderByInput = {
  direction: OrderDirection;
  field: UserOrderField;
};

export type UserOrderField =
  | 'createdAt'
  | 'email'
  | 'name';

export type UserSession = {
  __typename?: 'UserSession';
  createdAt: Scalars['DateTime']['output'];
  expiresAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  impersonatedBy?: Maybe<Scalars['String']['output']>;
  ipAddress?: Maybe<Scalars['String']['output']>;
  userAgent?: Maybe<Scalars['String']['output']>;
  userId: Scalars['ID']['output'];
};

export type UserWhereInput = {
  AND?: InputMaybe<Array<UserWhereInput>>;
  NOT?: InputMaybe<UserWhereInput>;
  OR?: InputMaybe<Array<UserWhereInput>>;
  createdAt?: InputMaybe<DateTimeFilterInput>;
  emailVerified?: InputMaybe<BooleanFilterInput>;
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





/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = ResolversObject<{
  ApiKey: ResolverTypeWrapper<ApiKey>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  BooleanFilterInput: BooleanFilterInput;
  CreateApiKeyInput: CreateApiKeyInput;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  CreateOrganizationInput: CreateOrganizationInput;
  CreateUserInput: CreateUserInput;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  DateTimeFilterInput: DateTimeFilterInput;
  EmailAddress: ResolverTypeWrapper<Scalars['EmailAddress']['output']>;
  FullOrganization: ResolverTypeWrapper<FullOrganization>;
  Invitation: ResolverTypeWrapper<Invitation>;
  InviteMemberInput: InviteMemberInput;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  MemberRole: ResolverTypeWrapper<MemberRole>;
  MemberUser: ResolverTypeWrapper<MemberUser>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  OrderDirection: ResolverTypeWrapper<'ASC' | 'DESC'>;
  OrgMember: ResolverTypeWrapper<OrgMember>;
  Organization: ResolverTypeWrapper<Organization>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  SlugCheckResult: ResolverTypeWrapper<SlugCheckResult>;
  StringFilterInput: StringFilterInput;
  UpdateApiKeyInput: UpdateApiKeyInput;
  UpdateOrganizationInput: UpdateOrganizationInput;
  UpdateUserInput: UpdateUserInput;
  User: ResolverTypeWrapper<UserWithRole>;
  UserList: ResolverTypeWrapper<Omit<UserList, 'users'> & { users: Array<ResolversTypes['User']> }>;
  UserOrderByInput: UserOrderByInput;
  UserOrderField: ResolverTypeWrapper<'name' | 'email' | 'createdAt'>;
  UserSession: ResolverTypeWrapper<UserSession>;
  UserWhereInput: UserWhereInput;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  ApiKey: ApiKey;
  Boolean: Scalars['Boolean']['output'];
  ID: Scalars['ID']['output'];
  String: Scalars['String']['output'];
  BooleanFilterInput: BooleanFilterInput;
  CreateApiKeyInput: CreateApiKeyInput;
  Int: Scalars['Int']['output'];
  CreateOrganizationInput: CreateOrganizationInput;
  CreateUserInput: CreateUserInput;
  DateTime: Scalars['DateTime']['output'];
  DateTimeFilterInput: DateTimeFilterInput;
  EmailAddress: Scalars['EmailAddress']['output'];
  FullOrganization: FullOrganization;
  Invitation: Invitation;
  InviteMemberInput: InviteMemberInput;
  JSON: Scalars['JSON']['output'];
  MemberRole: MemberRole;
  MemberUser: MemberUser;
  Mutation: Record<PropertyKey, never>;
  OrgMember: OrgMember;
  Organization: Organization;
  Query: Record<PropertyKey, never>;
  SlugCheckResult: SlugCheckResult;
  StringFilterInput: StringFilterInput;
  UpdateApiKeyInput: UpdateApiKeyInput;
  UpdateOrganizationInput: UpdateOrganizationInput;
  UpdateUserInput: UpdateUserInput;
  User: UserWithRole;
  UserList: Omit<UserList, 'users'> & { users: Array<ResolversParentTypes['User']> };
  UserOrderByInput: UserOrderByInput;
  UserSession: UserSession;
  UserWhereInput: UserWhereInput;
}>;

export type ApiKeyResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ApiKey'] = ResolversParentTypes['ApiKey']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  enabled?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  expiresAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lastRequest?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  prefix?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  start?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export interface EmailAddressScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['EmailAddress'], any> {
  name: 'EmailAddress';
}

export type FullOrganizationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['FullOrganization'] = ResolversParentTypes['FullOrganization']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  invitations?: Resolver<Array<ResolversTypes['Invitation']>, ParentType, ContextType>;
  logo?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  members?: Resolver<Array<ResolversTypes['OrgMember']>, ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  type?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export type InvitationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Invitation'] = ResolversParentTypes['Invitation']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  email?: Resolver<ResolversTypes['EmailAddress'], ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  inviterId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  organizationId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  role?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

export interface JSONScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type MemberRoleResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['MemberRole'] = ResolversParentTypes['MemberRole']> = ResolversObject<{
  role?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

export type MemberUserResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['MemberUser'] = ResolversParentTypes['MemberUser']> = ResolversObject<{
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  image?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

export type MutationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = ResolversObject<{
  _empty?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  acceptInvitation?: Resolver<ResolversTypes['OrgMember'], ParentType, ContextType, RequireFields<MutationacceptInvitationArgs, 'invitationId'>>;
  banUser?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationbanUserArgs, 'userId'>>;
  cancelInvitation?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationcancelInvitationArgs, 'invitationId'>>;
  createApiKey?: Resolver<ResolversTypes['ApiKey'], ParentType, ContextType, RequireFields<MutationcreateApiKeyArgs, 'input'>>;
  createOrganization?: Resolver<ResolversTypes['Organization'], ParentType, ContextType, RequireFields<MutationcreateOrganizationArgs, 'input'>>;
  createUser?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationcreateUserArgs, 'input'>>;
  deleteApiKey?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationdeleteApiKeyArgs, 'keyId'>>;
  deleteOrganization?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationdeleteOrganizationArgs, 'organizationId'>>;
  impersonateUser?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationimpersonateUserArgs, 'userId'>>;
  inviteMember?: Resolver<ResolversTypes['Invitation'], ParentType, ContextType, RequireFields<MutationinviteMemberArgs, 'input'>>;
  leaveOrganization?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationleaveOrganizationArgs, 'organizationId'>>;
  rejectInvitation?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationrejectInvitationArgs, 'invitationId'>>;
  removeMember?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationremoveMemberArgs, 'memberIdOrEmail'>>;
  removeUser?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationremoveUserArgs, 'userId'>>;
  revokeSession?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationrevokeSessionArgs, 'sessionToken'>>;
  revokeSessions?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationrevokeSessionsArgs, 'userId'>>;
  setActiveOrganization?: Resolver<Maybe<ResolversTypes['Organization']>, ParentType, ContextType, Partial<MutationsetActiveOrganizationArgs>>;
  setRole?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationsetRoleArgs, 'role' | 'userId'>>;
  stopImpersonation?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  unbanUser?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationunbanUserArgs, 'userId'>>;
  updateApiKey?: Resolver<ResolversTypes['ApiKey'], ParentType, ContextType, RequireFields<MutationupdateApiKeyArgs, 'input' | 'keyId'>>;
  updateMemberRole?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationupdateMemberRoleArgs, 'memberId' | 'role'>>;
  updateOrganization?: Resolver<ResolversTypes['Organization'], ParentType, ContextType, RequireFields<MutationupdateOrganizationArgs, 'input' | 'organizationId'>>;
  updateUser?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationupdateUserArgs, 'input' | 'userId'>>;
}>;

export type OrderDirectionResolvers = EnumResolverSignature<{ ASC?: any, DESC?: any }, ResolversTypes['OrderDirection']>;

export type OrgMemberResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['OrgMember'] = ResolversParentTypes['OrgMember']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  organizationId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  role?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  user?: Resolver<Maybe<ResolversTypes['MemberUser']>, ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

export type OrganizationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Organization'] = ResolversParentTypes['Organization']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  logo?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  type?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export type QueryResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = ResolversObject<{
  _empty?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  activeMember?: Resolver<Maybe<ResolversTypes['OrgMember']>, ParentType, ContextType>;
  activeMemberRole?: Resolver<Maybe<ResolversTypes['MemberRole']>, ParentType, ContextType, Partial<QueryactiveMemberRoleArgs>>;
  apiKey?: Resolver<Maybe<ResolversTypes['ApiKey']>, ParentType, ContextType, RequireFields<QueryapiKeyArgs, 'keyId'>>;
  checkSlug?: Resolver<ResolversTypes['SlugCheckResult'], ParentType, ContextType, RequireFields<QuerycheckSlugArgs, 'slug'>>;
  invitation?: Resolver<Maybe<ResolversTypes['Invitation']>, ParentType, ContextType, RequireFields<QueryinvitationArgs, 'invitationId'>>;
  invitations?: Resolver<Array<ResolversTypes['Invitation']>, ParentType, ContextType, Partial<QueryinvitationsArgs>>;
  members?: Resolver<Array<ResolversTypes['OrgMember']>, ParentType, ContextType, Partial<QuerymembersArgs>>;
  myApiKeys?: Resolver<Array<ResolversTypes['ApiKey']>, ParentType, ContextType>;
  organization?: Resolver<Maybe<ResolversTypes['FullOrganization']>, ParentType, ContextType, Partial<QueryorganizationArgs>>;
  organizations?: Resolver<Array<ResolversTypes['Organization']>, ParentType, ContextType>;
  user?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<QueryuserArgs, 'userId'>>;
  userSessions?: Resolver<Array<ResolversTypes['UserSession']>, ParentType, ContextType, RequireFields<QueryuserSessionsArgs, 'userId'>>;
  users?: Resolver<ResolversTypes['UserList'], ParentType, ContextType, Partial<QueryusersArgs>>;
}>;

export type SlugCheckResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['SlugCheckResult'] = ResolversParentTypes['SlugCheckResult']> = ResolversObject<{
  available?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
}>;

export type UserResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = ResolversObject<{
  banExpires?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  banReason?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  banned?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  role?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

export type UserListResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['UserList'] = ResolversParentTypes['UserList']> = ResolversObject<{
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  users?: Resolver<Array<ResolversTypes['User']>, ParentType, ContextType>;
}>;

export type UserOrderFieldResolvers = EnumResolverSignature<{ createdAt?: any, email?: any, name?: any }, ResolversTypes['UserOrderField']>;

export type UserSessionResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['UserSession'] = ResolversParentTypes['UserSession']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  impersonatedBy?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  ipAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  userAgent?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
}>;

export type Resolvers<ContextType = GraphQLContext> = ResolversObject<{
  ApiKey?: ApiKeyResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  EmailAddress?: GraphQLScalarType;
  FullOrganization?: FullOrganizationResolvers<ContextType>;
  Invitation?: InvitationResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  MemberRole?: MemberRoleResolvers<ContextType>;
  MemberUser?: MemberUserResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  OrderDirection?: OrderDirectionResolvers;
  OrgMember?: OrgMemberResolvers<ContextType>;
  Organization?: OrganizationResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  SlugCheckResult?: SlugCheckResultResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
  UserList?: UserListResolvers<ContextType>;
  UserOrderField?: UserOrderFieldResolvers;
  UserSession?: UserSessionResolvers<ContextType>;
}>;

