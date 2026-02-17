import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { GraphQLContext } from '../../types';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  DateTime: { input: Date | string; output: Date | string; }
  EmailAddress: { input: string; output: string; }
};

export type AdminUser = {
  __typename?: 'AdminUser';
  banExpires?: Maybe<Scalars['DateTime']['output']>;
  banReason?: Maybe<Scalars['String']['output']>;
  banned: Scalars['Boolean']['output'];
  createdAt: Scalars['DateTime']['output'];
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  role: Scalars['String']['output'];
};

export type AdminUserList = {
  __typename?: 'AdminUserList';
  total: Scalars['Int']['output'];
  users: Array<AdminUser>;
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

export type AuthConfig = {
  __typename?: 'AuthConfig';
  actorTypes: Array<Scalars['String']['output']>;
  allowImpersonation: Scalars['Boolean']['output'];
  allowedMethods: Array<Scalars['String']['output']>;
  dominantActorType: Scalars['String']['output'];
  require2FA: Scalars['Boolean']['output'];
  sessionDuration: Scalars['Int']['output'];
};

export type CreateOrganizationInput = {
  name: Scalars['String']['input'];
  slug?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};

export type CreateUserInput = {
  email: Scalars['EmailAddress']['input'];
  name: Scalars['String']['input'];
  password?: InputMaybe<Scalars['String']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
};

export type Invitation = {
  __typename?: 'Invitation';
  email: Scalars['EmailAddress']['output'];
  expiresAt?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  role: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  _empty?: Maybe<Scalars['String']['output']>;
  acceptInvitation: OrgMember;
  adminBanUser: Scalars['Boolean']['output'];
  adminCreateUser: AdminUser;
  adminImpersonateUser: Scalars['Boolean']['output'];
  adminRemoveUser: Scalars['Boolean']['output'];
  adminRevokeSession: Scalars['Boolean']['output'];
  adminRevokeSessions: Scalars['Boolean']['output'];
  adminSetRole: Scalars['Boolean']['output'];
  adminStopImpersonation: Scalars['Boolean']['output'];
  adminUnbanUser: Scalars['Boolean']['output'];
  adminUpdateUser: AdminUser;
  createOrganization: Organization;
  inviteMember: Invitation;
  removeMember: Scalars['Boolean']['output'];
  setActiveOrganization?: Maybe<Organization>;
};


export type MutationAcceptInvitationArgs = {
  invitationId: Scalars['ID']['input'];
};


export type MutationAdminBanUserArgs = {
  expiresIn?: InputMaybe<Scalars['Int']['input']>;
  reason?: InputMaybe<Scalars['String']['input']>;
  userId: Scalars['ID']['input'];
};


export type MutationAdminCreateUserArgs = {
  input: CreateUserInput;
};


export type MutationAdminImpersonateUserArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationAdminRemoveUserArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationAdminRevokeSessionArgs = {
  sessionToken: Scalars['String']['input'];
};


export type MutationAdminRevokeSessionsArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationAdminSetRoleArgs = {
  role: Scalars['String']['input'];
  userId: Scalars['ID']['input'];
};


export type MutationAdminUnbanUserArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationAdminUpdateUserArgs = {
  input: UpdateUserInput;
  userId: Scalars['ID']['input'];
};


export type MutationCreateOrganizationArgs = {
  input: CreateOrganizationInput;
};


export type MutationInviteMemberArgs = {
  email: Scalars['String']['input'];
  organizationId: Scalars['ID']['input'];
  role: Scalars['String']['input'];
};


export type MutationRemoveMemberArgs = {
  memberIdToRemove: Scalars['ID']['input'];
  organizationId: Scalars['ID']['input'];
};


export type MutationSetActiveOrganizationArgs = {
  organizationId?: InputMaybe<Scalars['ID']['input']>;
};

export type OrgMember = {
  __typename?: 'OrgMember';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  role: Scalars['String']['output'];
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
  adminUser: AdminUser;
  adminUserSessions: Array<UserSession>;
  adminUsers: AdminUserList;
  myApiKeys: Array<ApiKey>;
  myAuthConfig: AuthConfig;
  myOrganizations: Array<Organization>;
  organization?: Maybe<Organization>;
};


export type QueryAdminUserArgs = {
  userId: Scalars['ID']['input'];
};


export type QueryAdminUserSessionsArgs = {
  userId: Scalars['ID']['input'];
};


export type QueryAdminUsersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};


export type QueryOrganizationArgs = {
  id: Scalars['ID']['input'];
};

export type UpdateUserInput = {
  email?: InputMaybe<Scalars['EmailAddress']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};

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

export type WithIndex<TObject> = TObject & Record<string, any>;
export type ResolversObject<TObject> = WithIndex<TObject>;

export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

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

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = ResolversObject<{
  AdminUser: ResolverTypeWrapper<AdminUser>;
  AdminUserList: ResolverTypeWrapper<AdminUserList>;
  ApiKey: ResolverTypeWrapper<ApiKey>;
  AuthConfig: ResolverTypeWrapper<AuthConfig>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  CreateOrganizationInput: CreateOrganizationInput;
  CreateUserInput: CreateUserInput;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  EmailAddress: ResolverTypeWrapper<Scalars['EmailAddress']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  Invitation: ResolverTypeWrapper<Invitation>;
  Mutation: ResolverTypeWrapper<{}>;
  OrgMember: ResolverTypeWrapper<OrgMember>;
  Organization: ResolverTypeWrapper<Organization>;
  Query: ResolverTypeWrapper<{}>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  UpdateUserInput: UpdateUserInput;
  UserSession: ResolverTypeWrapper<UserSession>;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  AdminUser: AdminUser;
  AdminUserList: AdminUserList;
  ApiKey: ApiKey;
  AuthConfig: AuthConfig;
  Boolean: Scalars['Boolean']['output'];
  CreateOrganizationInput: CreateOrganizationInput;
  CreateUserInput: CreateUserInput;
  DateTime: Scalars['DateTime']['output'];
  EmailAddress: Scalars['EmailAddress']['output'];
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  Invitation: Invitation;
  Mutation: {};
  OrgMember: OrgMember;
  Organization: Organization;
  Query: {};
  String: Scalars['String']['output'];
  UpdateUserInput: UpdateUserInput;
  UserSession: UserSession;
}>;

export type AdminUserResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['AdminUser'] = ResolversParentTypes['AdminUser']> = ResolversObject<{
  banExpires?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  banReason?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  banned?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  role?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AdminUserListResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['AdminUserList'] = ResolversParentTypes['AdminUserList']> = ResolversObject<{
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  users?: Resolver<Array<ResolversTypes['AdminUser']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
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
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AuthConfigResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['AuthConfig'] = ResolversParentTypes['AuthConfig']> = ResolversObject<{
  actorTypes?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  allowImpersonation?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  allowedMethods?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  dominantActorType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  require2FA?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  sessionDuration?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export interface EmailAddressScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['EmailAddress'], any> {
  name: 'EmailAddress';
}

export type InvitationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Invitation'] = ResolversParentTypes['Invitation']> = ResolversObject<{
  email?: Resolver<ResolversTypes['EmailAddress'], ParentType, ContextType>;
  expiresAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  role?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type MutationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = ResolversObject<{
  _empty?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  acceptInvitation?: Resolver<ResolversTypes['OrgMember'], ParentType, ContextType, RequireFields<MutationAcceptInvitationArgs, 'invitationId'>>;
  adminBanUser?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationAdminBanUserArgs, 'userId'>>;
  adminCreateUser?: Resolver<ResolversTypes['AdminUser'], ParentType, ContextType, RequireFields<MutationAdminCreateUserArgs, 'input'>>;
  adminImpersonateUser?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationAdminImpersonateUserArgs, 'userId'>>;
  adminRemoveUser?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationAdminRemoveUserArgs, 'userId'>>;
  adminRevokeSession?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationAdminRevokeSessionArgs, 'sessionToken'>>;
  adminRevokeSessions?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationAdminRevokeSessionsArgs, 'userId'>>;
  adminSetRole?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationAdminSetRoleArgs, 'role' | 'userId'>>;
  adminStopImpersonation?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  adminUnbanUser?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationAdminUnbanUserArgs, 'userId'>>;
  adminUpdateUser?: Resolver<ResolversTypes['AdminUser'], ParentType, ContextType, RequireFields<MutationAdminUpdateUserArgs, 'input' | 'userId'>>;
  createOrganization?: Resolver<ResolversTypes['Organization'], ParentType, ContextType, RequireFields<MutationCreateOrganizationArgs, 'input'>>;
  inviteMember?: Resolver<ResolversTypes['Invitation'], ParentType, ContextType, RequireFields<MutationInviteMemberArgs, 'email' | 'organizationId' | 'role'>>;
  removeMember?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationRemoveMemberArgs, 'memberIdToRemove' | 'organizationId'>>;
  setActiveOrganization?: Resolver<Maybe<ResolversTypes['Organization']>, ParentType, ContextType, Partial<MutationSetActiveOrganizationArgs>>;
}>;

export type OrgMemberResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['OrgMember'] = ResolversParentTypes['OrgMember']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  role?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type OrganizationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Organization'] = ResolversParentTypes['Organization']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  logo?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  type?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type QueryResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = ResolversObject<{
  _empty?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  adminUser?: Resolver<ResolversTypes['AdminUser'], ParentType, ContextType, RequireFields<QueryAdminUserArgs, 'userId'>>;
  adminUserSessions?: Resolver<Array<ResolversTypes['UserSession']>, ParentType, ContextType, RequireFields<QueryAdminUserSessionsArgs, 'userId'>>;
  adminUsers?: Resolver<ResolversTypes['AdminUserList'], ParentType, ContextType, Partial<QueryAdminUsersArgs>>;
  myApiKeys?: Resolver<Array<ResolversTypes['ApiKey']>, ParentType, ContextType>;
  myAuthConfig?: Resolver<ResolversTypes['AuthConfig'], ParentType, ContextType>;
  myOrganizations?: Resolver<Array<ResolversTypes['Organization']>, ParentType, ContextType>;
  organization?: Resolver<Maybe<ResolversTypes['Organization']>, ParentType, ContextType, RequireFields<QueryOrganizationArgs, 'id'>>;
}>;

export type UserSessionResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['UserSession'] = ResolversParentTypes['UserSession']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  impersonatedBy?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  ipAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  userAgent?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resolvers<ContextType = GraphQLContext> = ResolversObject<{
  AdminUser?: AdminUserResolvers<ContextType>;
  AdminUserList?: AdminUserListResolvers<ContextType>;
  ApiKey?: ApiKeyResolvers<ContextType>;
  AuthConfig?: AuthConfigResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  EmailAddress?: GraphQLScalarType;
  Invitation?: InvitationResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  OrgMember?: OrgMemberResolvers<ContextType>;
  Organization?: OrganizationResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  UserSession?: UserSessionResolvers<ContextType>;
}>;

