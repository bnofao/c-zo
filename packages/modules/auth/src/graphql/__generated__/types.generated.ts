import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { UserWithRole } from 'better-auth/plugins';
import { AppRow } from '../../services/app.service';
import { GraphQLContext } from '../../types';
export type Maybe<T> = T | null | undefined;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type EnumResolverSignature<T, AllowedValues = any> = { [key in keyof T]?: AllowedValues };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
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

export type AccountInfo = {
  __typename?: 'AccountInfo';
  data?: Maybe<Scalars['JSON']['output']>;
  user: AccountInfoUser;
};

export type AccountInfoUser = {
  __typename?: 'AccountInfoUser';
  email?: Maybe<Scalars['String']['output']>;
  emailVerified: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  image?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
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

export type App = Node & {
  __typename?: 'App';
  appId: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  installedBy: Scalars['String']['output'];
  manifest: Scalars['JSON']['output'];
  organizationId?: Maybe<Scalars['ID']['output']>;
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type AppConnection = {
  __typename?: 'AppConnection';
  edges: Array<AppEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type AppEdge = {
  __typename?: 'AppEdge';
  cursor: Scalars['String']['output'];
  node: App;
};

export type AppOrderByInput = {
  direction: OrderDirection;
  field: AppOrderField;
};

export type AppOrderField =
  | 'APP_ID'
  | 'CREATED_AT'
  | 'STATUS';

export type BackupCodesResult = {
  __typename?: 'BackupCodesResult';
  backupCodes: Array<Scalars['String']['output']>;
  status: Scalars['Boolean']['output'];
};

export type BooleanFilterInput = {
  eq?: InputMaybe<Scalars['Boolean']['input']>;
};

export type ChangeEmailInput = {
  callbackURL?: InputMaybe<Scalars['String']['input']>;
  newEmail: Scalars['EmailAddress']['input'];
};

export type ChangePasswordInput = {
  currentPassword: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
  revokeOtherSessions?: InputMaybe<Scalars['Boolean']['input']>;
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

export type DeleteAccountInput = {
  callbackURL?: InputMaybe<Scalars['String']['input']>;
  password?: InputMaybe<Scalars['String']['input']>;
};

export type EnableTwoFactorResult = {
  __typename?: 'EnableTwoFactorResult';
  backupCodes: Array<Scalars['String']['output']>;
  totpURI: Scalars['String']['output'];
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

export type InstallAppInput = {
  manifestUrl: Scalars['String']['input'];
  organizationId?: InputMaybe<Scalars['ID']['input']>;
};

export type InstallAppManifestInput = {
  installedBy: Scalars['String']['input'];
  manifest: Scalars['JSON']['input'];
  organizationId?: InputMaybe<Scalars['ID']['input']>;
};

export type InstallAppPayload = {
  __typename?: 'InstallAppPayload';
  app?: Maybe<App>;
  userErrors: Array<UserError>;
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

export type LinkedAccount = {
  __typename?: 'LinkedAccount';
  accountId: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  providerId: Scalars['String']['output'];
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
  changeEmail: Scalars['Boolean']['output'];
  changePassword: Scalars['Boolean']['output'];
  createApiKey: ApiKey;
  createOrganization: Organization;
  createUser: User;
  deleteAccount: Scalars['Boolean']['output'];
  deleteApiKey: Scalars['Boolean']['output'];
  deleteOrganization: Scalars['Boolean']['output'];
  disableTwoFactor: Scalars['Boolean']['output'];
  enableTwoFactor: EnableTwoFactorResult;
  generateBackupCodes: BackupCodesResult;
  impersonateUser: Scalars['Boolean']['output'];
  installApp: InstallAppPayload;
  inviteMember: Invitation;
  leaveOrganization: Scalars['Boolean']['output'];
  rejectInvitation: Scalars['Boolean']['output'];
  removeMember: Scalars['Boolean']['output'];
  removeUser: Scalars['Boolean']['output'];
  revokeMySession: Scalars['Boolean']['output'];
  revokeOtherSessions: Scalars['Boolean']['output'];
  revokeSession: Scalars['Boolean']['output'];
  revokeSessions: Scalars['Boolean']['output'];
  sendOtp: Scalars['Boolean']['output'];
  setActiveOrganization?: Maybe<Organization>;
  setAppStatus: SetAppStatusPayload;
  setRole: Scalars['Boolean']['output'];
  setUserPassword: Scalars['Boolean']['output'];
  stopImpersonation: Scalars['Boolean']['output'];
  unbanUser: Scalars['Boolean']['output'];
  uninstallApp: UninstallAppPayload;
  unlinkAccount: Scalars['Boolean']['output'];
  updateApiKey: ApiKey;
  updateAppManifest: UpdateAppManifestPayload;
  updateMemberRole: Scalars['Boolean']['output'];
  updateOrganization: Organization;
  updateProfile: User;
  updateUser: User;
  verifyBackupCode: TwoFactorVerifyResult;
  verifyOtp: TwoFactorVerifyResult;
  verifyTotp: TwoFactorVerifyResult;
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


export type MutationchangeEmailArgs = {
  input: ChangeEmailInput;
};


export type MutationchangePasswordArgs = {
  input: ChangePasswordInput;
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


export type MutationdeleteAccountArgs = {
  input?: InputMaybe<DeleteAccountInput>;
};


export type MutationdeleteApiKeyArgs = {
  keyId: Scalars['ID']['input'];
};


export type MutationdeleteOrganizationArgs = {
  organizationId: Scalars['ID']['input'];
};


export type MutationdisableTwoFactorArgs = {
  password: Scalars['String']['input'];
};


export type MutationenableTwoFactorArgs = {
  issuer?: InputMaybe<Scalars['String']['input']>;
  password: Scalars['String']['input'];
};


export type MutationgenerateBackupCodesArgs = {
  password: Scalars['String']['input'];
};


export type MutationimpersonateUserArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationinstallAppArgs = {
  input: InstallAppInput;
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


export type MutationrevokeMySessionArgs = {
  token: Scalars['String']['input'];
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


export type MutationsetAppStatusArgs = {
  input: SetAppStatusInput;
};


export type MutationsetRoleArgs = {
  role: Scalars['String']['input'];
  userId: Scalars['ID']['input'];
};


export type MutationsetUserPasswordArgs = {
  newPassword: Scalars['String']['input'];
  userId: Scalars['ID']['input'];
};


export type MutationunbanUserArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationuninstallAppArgs = {
  appId: Scalars['String']['input'];
};


export type MutationunlinkAccountArgs = {
  accountId?: InputMaybe<Scalars['String']['input']>;
  providerId: Scalars['String']['input'];
};


export type MutationupdateApiKeyArgs = {
  input: UpdateApiKeyInput;
  keyId: Scalars['ID']['input'];
};


export type MutationupdateAppManifestArgs = {
  input: UpdateAppManifestInput;
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


export type MutationupdateProfileArgs = {
  input: UpdateProfileInput;
};


export type MutationupdateUserArgs = {
  input: UpdateUserInput;
  userId: Scalars['ID']['input'];
};


export type MutationverifyBackupCodeArgs = {
  input: VerifyBackupCodeInput;
};


export type MutationverifyOtpArgs = {
  input: VerifyOtpInput;
};


export type MutationverifyTotpArgs = {
  input: VerifyTotpInput;
};

export type MySession = {
  __typename?: 'MySession';
  createdAt: Scalars['DateTime']['output'];
  expiresAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  ipAddress?: Maybe<Scalars['String']['output']>;
  token: Scalars['String']['output'];
  userAgent?: Maybe<Scalars['String']['output']>;
  userId: Scalars['ID']['output'];
};

export type Node = {
  id: Scalars['ID']['output'];
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

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type Query = {
  __typename?: 'Query';
  _empty?: Maybe<Scalars['String']['output']>;
  accountInfo: AccountInfo;
  activeMember?: Maybe<OrgMember>;
  activeMemberRole?: Maybe<MemberRole>;
  apiKey?: Maybe<ApiKey>;
  /** Fetch an app by its Relay global ID (primary key). */
  app?: Maybe<App>;
  /** Fetch an app by its manifest slug (e.g. "my-cool-app"). */
  appBySlug?: Maybe<App>;
  /** List apps with cursor-based pagination. */
  apps: AppConnection;
  checkSlug: SlugCheckResult;
  invitation?: Maybe<Invitation>;
  invitations: Array<Invitation>;
  me: User;
  members: Array<OrgMember>;
  myAccounts: Array<LinkedAccount>;
  myApiKeys: Array<ApiKey>;
  myInvitations: Array<UserInvitation>;
  mySessions: Array<MySession>;
  node?: Maybe<Node>;
  organization?: Maybe<FullOrganization>;
  organizations: Array<Organization>;
  totpUri: TotpUri;
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


export type QueryappArgs = {
  id: Scalars['ID']['input'];
};


export type QueryappBySlugArgs = {
  appId: Scalars['String']['input'];
};


export type QueryappsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<AppOrderByInput>;
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


export type QuerynodeArgs = {
  id: Scalars['ID']['input'];
};


export type QueryorganizationArgs = {
  organizationId?: InputMaybe<Scalars['ID']['input']>;
  organizationSlug?: InputMaybe<Scalars['String']['input']>;
};


export type QuerytotpUriArgs = {
  password: Scalars['String']['input'];
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

export type SetAppStatusInput = {
  appId: Scalars['String']['input'];
  status: Scalars['String']['input'];
};

export type SetAppStatusPayload = {
  __typename?: 'SetAppStatusPayload';
  app?: Maybe<App>;
  userErrors: Array<UserError>;
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

export type TotpUri = {
  __typename?: 'TotpUri';
  totpURI: Scalars['String']['output'];
};

export type TwoFactorVerifyResult = {
  __typename?: 'TwoFactorVerifyResult';
  token: Scalars['String']['output'];
};

export type UninstallAppPayload = {
  __typename?: 'UninstallAppPayload';
  app?: Maybe<App>;
  userErrors: Array<UserError>;
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

export type UpdateAppManifestInput = {
  appId: Scalars['String']['input'];
  manifest: Scalars['JSON']['input'];
};

export type UpdateAppManifestPayload = {
  __typename?: 'UpdateAppManifestPayload';
  app?: Maybe<App>;
  userErrors: Array<UserError>;
};

export type UpdateOrganizationInput = {
  logo?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateProfileInput = {
  image?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
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

export type UserError = {
  __typename?: 'UserError';
  code: Scalars['String']['output'];
  field?: Maybe<Array<Scalars['String']['output']>>;
  message: Scalars['String']['output'];
};

export type UserInvitation = {
  __typename?: 'UserInvitation';
  createdAt: Scalars['DateTime']['output'];
  email: Scalars['EmailAddress']['output'];
  expiresAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  inviterId: Scalars['String']['output'];
  organizationId: Scalars['String']['output'];
  organizationName?: Maybe<Scalars['String']['output']>;
  role: Scalars['String']['output'];
  status: Scalars['String']['output'];
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

export type VerifyBackupCodeInput = {
  code: Scalars['String']['input'];
  disableSession?: InputMaybe<Scalars['Boolean']['input']>;
  trustDevice?: InputMaybe<Scalars['Boolean']['input']>;
};

export type VerifyOtpInput = {
  code: Scalars['String']['input'];
  trustDevice?: InputMaybe<Scalars['Boolean']['input']>;
};

export type VerifyTotpInput = {
  code: Scalars['String']['input'];
  trustDevice?: InputMaybe<Scalars['Boolean']['input']>;
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
  Node: ( AppRow & { __typename: 'App' } );
}>;

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = ResolversObject<{
  AccountInfo: ResolverTypeWrapper<AccountInfo>;
  AccountInfoUser: ResolverTypeWrapper<AccountInfoUser>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  ApiKey: ResolverTypeWrapper<ApiKey>;
  App: ResolverTypeWrapper<AppRow>;
  AppConnection: ResolverTypeWrapper<Omit<AppConnection, 'edges'> & { edges: Array<ResolversTypes['AppEdge']> }>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  AppEdge: ResolverTypeWrapper<Omit<AppEdge, 'node'> & { node: ResolversTypes['App'] }>;
  AppOrderByInput: AppOrderByInput;
  AppOrderField: ResolverTypeWrapper<'CREATED_AT' | 'APP_ID' | 'STATUS'>;
  BackupCodesResult: ResolverTypeWrapper<BackupCodesResult>;
  BooleanFilterInput: BooleanFilterInput;
  ChangeEmailInput: ChangeEmailInput;
  ChangePasswordInput: ChangePasswordInput;
  CreateApiKeyInput: CreateApiKeyInput;
  CreateOrganizationInput: CreateOrganizationInput;
  CreateUserInput: CreateUserInput;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  DateTimeFilterInput: DateTimeFilterInput;
  DeleteAccountInput: DeleteAccountInput;
  EmailAddress: ResolverTypeWrapper<Scalars['EmailAddress']['output']>;
  EnableTwoFactorResult: ResolverTypeWrapper<EnableTwoFactorResult>;
  FullOrganization: ResolverTypeWrapper<FullOrganization>;
  InstallAppInput: InstallAppInput;
  InstallAppManifestInput: InstallAppManifestInput;
  InstallAppPayload: ResolverTypeWrapper<Omit<InstallAppPayload, 'app'> & { app?: Maybe<ResolversTypes['App']> }>;
  Invitation: ResolverTypeWrapper<Invitation>;
  InviteMemberInput: InviteMemberInput;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  LinkedAccount: ResolverTypeWrapper<LinkedAccount>;
  MemberRole: ResolverTypeWrapper<MemberRole>;
  MemberUser: ResolverTypeWrapper<MemberUser>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  MySession: ResolverTypeWrapper<MySession>;
  Node: ResolverTypeWrapper<ResolversInterfaceTypes<ResolversTypes>['Node']>;
  OrderDirection: ResolverTypeWrapper<'ASC' | 'DESC'>;
  OrgMember: ResolverTypeWrapper<OrgMember>;
  Organization: ResolverTypeWrapper<Organization>;
  PageInfo: ResolverTypeWrapper<PageInfo>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  SetAppStatusInput: SetAppStatusInput;
  SetAppStatusPayload: ResolverTypeWrapper<Omit<SetAppStatusPayload, 'app'> & { app?: Maybe<ResolversTypes['App']> }>;
  SlugCheckResult: ResolverTypeWrapper<SlugCheckResult>;
  StringFilterInput: StringFilterInput;
  TotpUri: ResolverTypeWrapper<TotpUri>;
  TwoFactorVerifyResult: ResolverTypeWrapper<TwoFactorVerifyResult>;
  UninstallAppPayload: ResolverTypeWrapper<Omit<UninstallAppPayload, 'app'> & { app?: Maybe<ResolversTypes['App']> }>;
  UpdateApiKeyInput: UpdateApiKeyInput;
  UpdateAppManifestInput: UpdateAppManifestInput;
  UpdateAppManifestPayload: ResolverTypeWrapper<Omit<UpdateAppManifestPayload, 'app'> & { app?: Maybe<ResolversTypes['App']> }>;
  UpdateOrganizationInput: UpdateOrganizationInput;
  UpdateProfileInput: UpdateProfileInput;
  UpdateUserInput: UpdateUserInput;
  User: ResolverTypeWrapper<UserWithRole>;
  UserError: ResolverTypeWrapper<UserError>;
  UserInvitation: ResolverTypeWrapper<UserInvitation>;
  UserList: ResolverTypeWrapper<Omit<UserList, 'users'> & { users: Array<ResolversTypes['User']> }>;
  UserOrderByInput: UserOrderByInput;
  UserOrderField: ResolverTypeWrapper<'name' | 'email' | 'createdAt'>;
  UserSession: ResolverTypeWrapper<UserSession>;
  UserWhereInput: UserWhereInput;
  VerifyBackupCodeInput: VerifyBackupCodeInput;
  VerifyOtpInput: VerifyOtpInput;
  VerifyTotpInput: VerifyTotpInput;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  AccountInfo: AccountInfo;
  AccountInfoUser: AccountInfoUser;
  String: Scalars['String']['output'];
  Boolean: Scalars['Boolean']['output'];
  ID: Scalars['ID']['output'];
  ApiKey: ApiKey;
  App: AppRow;
  AppConnection: Omit<AppConnection, 'edges'> & { edges: Array<ResolversParentTypes['AppEdge']> };
  Int: Scalars['Int']['output'];
  AppEdge: Omit<AppEdge, 'node'> & { node: ResolversParentTypes['App'] };
  AppOrderByInput: AppOrderByInput;
  BackupCodesResult: BackupCodesResult;
  BooleanFilterInput: BooleanFilterInput;
  ChangeEmailInput: ChangeEmailInput;
  ChangePasswordInput: ChangePasswordInput;
  CreateApiKeyInput: CreateApiKeyInput;
  CreateOrganizationInput: CreateOrganizationInput;
  CreateUserInput: CreateUserInput;
  DateTime: Scalars['DateTime']['output'];
  DateTimeFilterInput: DateTimeFilterInput;
  DeleteAccountInput: DeleteAccountInput;
  EmailAddress: Scalars['EmailAddress']['output'];
  EnableTwoFactorResult: EnableTwoFactorResult;
  FullOrganization: FullOrganization;
  InstallAppInput: InstallAppInput;
  InstallAppManifestInput: InstallAppManifestInput;
  InstallAppPayload: Omit<InstallAppPayload, 'app'> & { app?: Maybe<ResolversParentTypes['App']> };
  Invitation: Invitation;
  InviteMemberInput: InviteMemberInput;
  JSON: Scalars['JSON']['output'];
  LinkedAccount: LinkedAccount;
  MemberRole: MemberRole;
  MemberUser: MemberUser;
  Mutation: Record<PropertyKey, never>;
  MySession: MySession;
  Node: ResolversInterfaceTypes<ResolversParentTypes>['Node'];
  OrgMember: OrgMember;
  Organization: Organization;
  PageInfo: PageInfo;
  Query: Record<PropertyKey, never>;
  SetAppStatusInput: SetAppStatusInput;
  SetAppStatusPayload: Omit<SetAppStatusPayload, 'app'> & { app?: Maybe<ResolversParentTypes['App']> };
  SlugCheckResult: SlugCheckResult;
  StringFilterInput: StringFilterInput;
  TotpUri: TotpUri;
  TwoFactorVerifyResult: TwoFactorVerifyResult;
  UninstallAppPayload: Omit<UninstallAppPayload, 'app'> & { app?: Maybe<ResolversParentTypes['App']> };
  UpdateApiKeyInput: UpdateApiKeyInput;
  UpdateAppManifestInput: UpdateAppManifestInput;
  UpdateAppManifestPayload: Omit<UpdateAppManifestPayload, 'app'> & { app?: Maybe<ResolversParentTypes['App']> };
  UpdateOrganizationInput: UpdateOrganizationInput;
  UpdateProfileInput: UpdateProfileInput;
  UpdateUserInput: UpdateUserInput;
  User: UserWithRole;
  UserError: UserError;
  UserInvitation: UserInvitation;
  UserList: Omit<UserList, 'users'> & { users: Array<ResolversParentTypes['User']> };
  UserOrderByInput: UserOrderByInput;
  UserSession: UserSession;
  UserWhereInput: UserWhereInput;
  VerifyBackupCodeInput: VerifyBackupCodeInput;
  VerifyOtpInput: VerifyOtpInput;
  VerifyTotpInput: VerifyTotpInput;
}>;

export type AccountInfoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['AccountInfo'] = ResolversParentTypes['AccountInfo']> = ResolversObject<{
  data?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  user?: Resolver<ResolversTypes['AccountInfoUser'], ParentType, ContextType>;
}>;

export type AccountInfoUserResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['AccountInfoUser'] = ResolversParentTypes['AccountInfoUser']> = ResolversObject<{
  email?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  emailVerified?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  image?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
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

export type AppResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['App'] = ResolversParentTypes['App']> = ResolversObject<{
  appId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  installedBy?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  manifest?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  organizationId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AppConnectionResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['AppConnection'] = ResolversParentTypes['AppConnection']> = ResolversObject<{
  edges?: Resolver<Array<ResolversTypes['AppEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  totalCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
}>;

export type AppEdgeResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['AppEdge'] = ResolversParentTypes['AppEdge']> = ResolversObject<{
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['App'], ParentType, ContextType>;
}>;

export type AppOrderFieldResolvers = EnumResolverSignature<{ APP_ID?: any, CREATED_AT?: any, STATUS?: any }, ResolversTypes['AppOrderField']>;

export type BackupCodesResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['BackupCodesResult'] = ResolversParentTypes['BackupCodesResult']> = ResolversObject<{
  backupCodes?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
}>;

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export interface EmailAddressScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['EmailAddress'], any> {
  name: 'EmailAddress';
}

export type EnableTwoFactorResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['EnableTwoFactorResult'] = ResolversParentTypes['EnableTwoFactorResult']> = ResolversObject<{
  backupCodes?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  totpURI?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

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

export type InstallAppPayloadResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['InstallAppPayload'] = ResolversParentTypes['InstallAppPayload']> = ResolversObject<{
  app?: Resolver<Maybe<ResolversTypes['App']>, ParentType, ContextType>;
  userErrors?: Resolver<Array<ResolversTypes['UserError']>, ParentType, ContextType>;
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

export type LinkedAccountResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['LinkedAccount'] = ResolversParentTypes['LinkedAccount']> = ResolversObject<{
  accountId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  providerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

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
  changeEmail?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationchangeEmailArgs, 'input'>>;
  changePassword?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationchangePasswordArgs, 'input'>>;
  createApiKey?: Resolver<ResolversTypes['ApiKey'], ParentType, ContextType, RequireFields<MutationcreateApiKeyArgs, 'input'>>;
  createOrganization?: Resolver<ResolversTypes['Organization'], ParentType, ContextType, RequireFields<MutationcreateOrganizationArgs, 'input'>>;
  createUser?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationcreateUserArgs, 'input'>>;
  deleteAccount?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, Partial<MutationdeleteAccountArgs>>;
  deleteApiKey?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationdeleteApiKeyArgs, 'keyId'>>;
  deleteOrganization?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationdeleteOrganizationArgs, 'organizationId'>>;
  disableTwoFactor?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationdisableTwoFactorArgs, 'password'>>;
  enableTwoFactor?: Resolver<ResolversTypes['EnableTwoFactorResult'], ParentType, ContextType, RequireFields<MutationenableTwoFactorArgs, 'password'>>;
  generateBackupCodes?: Resolver<ResolversTypes['BackupCodesResult'], ParentType, ContextType, RequireFields<MutationgenerateBackupCodesArgs, 'password'>>;
  impersonateUser?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationimpersonateUserArgs, 'userId'>>;
  installApp?: Resolver<ResolversTypes['InstallAppPayload'], ParentType, ContextType, RequireFields<MutationinstallAppArgs, 'input'>>;
  inviteMember?: Resolver<ResolversTypes['Invitation'], ParentType, ContextType, RequireFields<MutationinviteMemberArgs, 'input'>>;
  leaveOrganization?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationleaveOrganizationArgs, 'organizationId'>>;
  rejectInvitation?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationrejectInvitationArgs, 'invitationId'>>;
  removeMember?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationremoveMemberArgs, 'memberIdOrEmail'>>;
  removeUser?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationremoveUserArgs, 'userId'>>;
  revokeMySession?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationrevokeMySessionArgs, 'token'>>;
  revokeOtherSessions?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  revokeSession?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationrevokeSessionArgs, 'sessionToken'>>;
  revokeSessions?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationrevokeSessionsArgs, 'userId'>>;
  sendOtp?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  setActiveOrganization?: Resolver<Maybe<ResolversTypes['Organization']>, ParentType, ContextType, Partial<MutationsetActiveOrganizationArgs>>;
  setAppStatus?: Resolver<ResolversTypes['SetAppStatusPayload'], ParentType, ContextType, RequireFields<MutationsetAppStatusArgs, 'input'>>;
  setRole?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationsetRoleArgs, 'role' | 'userId'>>;
  setUserPassword?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationsetUserPasswordArgs, 'newPassword' | 'userId'>>;
  stopImpersonation?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  unbanUser?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationunbanUserArgs, 'userId'>>;
  uninstallApp?: Resolver<ResolversTypes['UninstallAppPayload'], ParentType, ContextType, RequireFields<MutationuninstallAppArgs, 'appId'>>;
  unlinkAccount?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationunlinkAccountArgs, 'providerId'>>;
  updateApiKey?: Resolver<ResolversTypes['ApiKey'], ParentType, ContextType, RequireFields<MutationupdateApiKeyArgs, 'input' | 'keyId'>>;
  updateAppManifest?: Resolver<ResolversTypes['UpdateAppManifestPayload'], ParentType, ContextType, RequireFields<MutationupdateAppManifestArgs, 'input'>>;
  updateMemberRole?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationupdateMemberRoleArgs, 'memberId' | 'role'>>;
  updateOrganization?: Resolver<ResolversTypes['Organization'], ParentType, ContextType, RequireFields<MutationupdateOrganizationArgs, 'input' | 'organizationId'>>;
  updateProfile?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationupdateProfileArgs, 'input'>>;
  updateUser?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationupdateUserArgs, 'input' | 'userId'>>;
  verifyBackupCode?: Resolver<ResolversTypes['TwoFactorVerifyResult'], ParentType, ContextType, RequireFields<MutationverifyBackupCodeArgs, 'input'>>;
  verifyOtp?: Resolver<ResolversTypes['TwoFactorVerifyResult'], ParentType, ContextType, RequireFields<MutationverifyOtpArgs, 'input'>>;
  verifyTotp?: Resolver<ResolversTypes['TwoFactorVerifyResult'], ParentType, ContextType, RequireFields<MutationverifyTotpArgs, 'input'>>;
}>;

export type MySessionResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['MySession'] = ResolversParentTypes['MySession']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  ipAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  token?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userAgent?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
}>;

export type NodeResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Node'] = ResolversParentTypes['Node']> = ResolversObject<{
  __resolveType?: TypeResolveFn<'App', ParentType, ContextType>;
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

export type PageInfoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['PageInfo'] = ResolversParentTypes['PageInfo']> = ResolversObject<{
  endCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  hasPreviousPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  startCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export type QueryResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = ResolversObject<{
  _empty?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  accountInfo?: Resolver<ResolversTypes['AccountInfo'], ParentType, ContextType>;
  activeMember?: Resolver<Maybe<ResolversTypes['OrgMember']>, ParentType, ContextType>;
  activeMemberRole?: Resolver<Maybe<ResolversTypes['MemberRole']>, ParentType, ContextType, Partial<QueryactiveMemberRoleArgs>>;
  apiKey?: Resolver<Maybe<ResolversTypes['ApiKey']>, ParentType, ContextType, RequireFields<QueryapiKeyArgs, 'keyId'>>;
  app?: Resolver<Maybe<ResolversTypes['App']>, ParentType, ContextType, RequireFields<QueryappArgs, 'id'>>;
  appBySlug?: Resolver<Maybe<ResolversTypes['App']>, ParentType, ContextType, RequireFields<QueryappBySlugArgs, 'appId'>>;
  apps?: Resolver<ResolversTypes['AppConnection'], ParentType, ContextType, Partial<QueryappsArgs>>;
  checkSlug?: Resolver<ResolversTypes['SlugCheckResult'], ParentType, ContextType, RequireFields<QuerycheckSlugArgs, 'slug'>>;
  invitation?: Resolver<Maybe<ResolversTypes['Invitation']>, ParentType, ContextType, RequireFields<QueryinvitationArgs, 'invitationId'>>;
  invitations?: Resolver<Array<ResolversTypes['Invitation']>, ParentType, ContextType, Partial<QueryinvitationsArgs>>;
  me?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  members?: Resolver<Array<ResolversTypes['OrgMember']>, ParentType, ContextType, Partial<QuerymembersArgs>>;
  myAccounts?: Resolver<Array<ResolversTypes['LinkedAccount']>, ParentType, ContextType>;
  myApiKeys?: Resolver<Array<ResolversTypes['ApiKey']>, ParentType, ContextType>;
  myInvitations?: Resolver<Array<ResolversTypes['UserInvitation']>, ParentType, ContextType>;
  mySessions?: Resolver<Array<ResolversTypes['MySession']>, ParentType, ContextType>;
  node?: Resolver<Maybe<ResolversTypes['Node']>, ParentType, ContextType, RequireFields<QuerynodeArgs, 'id'>>;
  organization?: Resolver<Maybe<ResolversTypes['FullOrganization']>, ParentType, ContextType, Partial<QueryorganizationArgs>>;
  organizations?: Resolver<Array<ResolversTypes['Organization']>, ParentType, ContextType>;
  totpUri?: Resolver<ResolversTypes['TotpUri'], ParentType, ContextType, RequireFields<QuerytotpUriArgs, 'password'>>;
  user?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<QueryuserArgs, 'userId'>>;
  userSessions?: Resolver<Array<ResolversTypes['UserSession']>, ParentType, ContextType, RequireFields<QueryuserSessionsArgs, 'userId'>>;
  users?: Resolver<ResolversTypes['UserList'], ParentType, ContextType, Partial<QueryusersArgs>>;
}>;

export type SetAppStatusPayloadResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['SetAppStatusPayload'] = ResolversParentTypes['SetAppStatusPayload']> = ResolversObject<{
  app?: Resolver<Maybe<ResolversTypes['App']>, ParentType, ContextType>;
  userErrors?: Resolver<Array<ResolversTypes['UserError']>, ParentType, ContextType>;
}>;

export type SlugCheckResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['SlugCheckResult'] = ResolversParentTypes['SlugCheckResult']> = ResolversObject<{
  available?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
}>;

export type TotpUriResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['TotpUri'] = ResolversParentTypes['TotpUri']> = ResolversObject<{
  totpURI?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

export type TwoFactorVerifyResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['TwoFactorVerifyResult'] = ResolversParentTypes['TwoFactorVerifyResult']> = ResolversObject<{
  token?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

export type UninstallAppPayloadResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['UninstallAppPayload'] = ResolversParentTypes['UninstallAppPayload']> = ResolversObject<{
  app?: Resolver<Maybe<ResolversTypes['App']>, ParentType, ContextType>;
  userErrors?: Resolver<Array<ResolversTypes['UserError']>, ParentType, ContextType>;
}>;

export type UpdateAppManifestPayloadResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['UpdateAppManifestPayload'] = ResolversParentTypes['UpdateAppManifestPayload']> = ResolversObject<{
  app?: Resolver<Maybe<ResolversTypes['App']>, ParentType, ContextType>;
  userErrors?: Resolver<Array<ResolversTypes['UserError']>, ParentType, ContextType>;
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

export type UserErrorResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['UserError'] = ResolversParentTypes['UserError']> = ResolversObject<{
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  field?: Resolver<Maybe<Array<ResolversTypes['String']>>, ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

export type UserInvitationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['UserInvitation'] = ResolversParentTypes['UserInvitation']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  email?: Resolver<ResolversTypes['EmailAddress'], ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  inviterId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  organizationId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  organizationName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  role?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
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
  AccountInfo?: AccountInfoResolvers<ContextType>;
  AccountInfoUser?: AccountInfoUserResolvers<ContextType>;
  ApiKey?: ApiKeyResolvers<ContextType>;
  App?: AppResolvers<ContextType>;
  AppConnection?: AppConnectionResolvers<ContextType>;
  AppEdge?: AppEdgeResolvers<ContextType>;
  AppOrderField?: AppOrderFieldResolvers;
  BackupCodesResult?: BackupCodesResultResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  EmailAddress?: GraphQLScalarType;
  EnableTwoFactorResult?: EnableTwoFactorResultResolvers<ContextType>;
  FullOrganization?: FullOrganizationResolvers<ContextType>;
  InstallAppPayload?: InstallAppPayloadResolvers<ContextType>;
  Invitation?: InvitationResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  LinkedAccount?: LinkedAccountResolvers<ContextType>;
  MemberRole?: MemberRoleResolvers<ContextType>;
  MemberUser?: MemberUserResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  MySession?: MySessionResolvers<ContextType>;
  Node?: NodeResolvers<ContextType>;
  OrderDirection?: OrderDirectionResolvers;
  OrgMember?: OrgMemberResolvers<ContextType>;
  Organization?: OrganizationResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  SetAppStatusPayload?: SetAppStatusPayloadResolvers<ContextType>;
  SlugCheckResult?: SlugCheckResultResolvers<ContextType>;
  TotpUri?: TotpUriResolvers<ContextType>;
  TwoFactorVerifyResult?: TwoFactorVerifyResultResolvers<ContextType>;
  UninstallAppPayload?: UninstallAppPayloadResolvers<ContextType>;
  UpdateAppManifestPayload?: UpdateAppManifestPayloadResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
  UserError?: UserErrorResolvers<ContextType>;
  UserInvitation?: UserInvitationResolvers<ContextType>;
  UserList?: UserListResolvers<ContextType>;
  UserOrderField?: UserOrderFieldResolvers;
  UserSession?: UserSessionResolvers<ContextType>;
}>;

