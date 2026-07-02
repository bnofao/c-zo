/* eslint-disable */
import * as types from './graphql';



/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "query MeProbe { me { id name email role } }": typeof types.MeProbeDocument,
    "query Me { me { id name email role permissions { resource actions } } }": typeof types.MeDocument,
    "\n  query AdminProduct($id: ID!) {\n    product(id: $id) { id name handle createdAt }\n  }\n": typeof types.AdminProductDocument,
    "\n  query AdminProducts($first: Int!, $after: String) {\n    products(first: $first, after: $after) {\n      edges { node { id name handle } }\n      pageInfo { endCursor hasNextPage }\n    }\n  }\n": typeof types.AdminProductsDocument,
    "\n  query AdminUsers($first: Int!, $after: String, $search: String, $where: UserWhereInput, $orderBy: [UserOrderByInput!], $admin: Boolean) {\n    users(first: $first, after: $after, search: $search, where: $where, orderBy: $orderBy, admin: $admin) {\n      edges { node { id name email role banned emailVerified createdAt accounts } }\n      pageInfo { endCursor hasNextPage }\n    }\n  }\n": typeof types.AdminUsersDocument,
    "\n  query AdminUserCounts {\n    userCounts { all admins unverified banned }\n  }\n": typeof types.AdminUserCountsDocument,
    "\n  mutation AdminCreateUser($input: CreateUserInput!) {\n    createUser(input: $input) {\n      __typename\n      ... on CreateUserSuccess { data { user { id } } }\n      ... on ValidationError { message }\n      ... on UserAlreadyExistsError { message }\n      ... on InvalidRoleError { message }\n      ... on RoleAssignmentDeniedError { message }\n      ... on CredentialLinkFailedError { message }\n      ... on PasswordHashFailedError { message }\n    }\n  }\n": typeof types.AdminCreateUserDocument,
    "\n  mutation AdminSetRole($input: SetRoleInput!) {\n    setRole(input: $input) {\n      __typename\n      ... on SetRoleSuccess { data { user { id } } }\n      ... on ForbiddenError { message }\n      ... on UserNotFoundError { message }\n      ... on InvalidRoleError { message }\n      ... on CannotDemoteSelfError { message }\n      ... on RoleAssignmentDeniedError { message }\n    }\n  }\n": typeof types.AdminSetRoleDocument,
    "\n  mutation AdminBanUser($input: BanUserInput!) {\n    banUser(input: $input) {\n      __typename\n      ... on BanUserSuccess { data { user { id } } }\n      ... on ForbiddenError { message }\n      ... on UserNotFoundError { message }\n      ... on CannotBanSelfError { message }\n      ... on UserAlreadyBannedError { message }\n    }\n  }\n": typeof types.AdminBanUserDocument,
    "\n  mutation AdminUnbanUser($input: UnbanUserInput!) {\n    unbanUser(input: $input) {\n      __typename\n      ... on UnbanUserSuccess { data { user { id } } }\n      ... on UserNotFoundError { message }\n      ... on UserNotBannedError { message }\n    }\n  }\n": typeof types.AdminUnbanUserDocument,
    "\n  mutation AdminResendInvitation($input: ResendInvitationInput!) {\n    resendInvitation(input: $input) {\n      __typename\n      ... on ResendInvitationSuccess { data { success } }\n      ... on UserNotFoundError { message }\n    }\n  }\n": typeof types.AdminResendInvitationDocument,
    "\n  query AdminRoleHierarchies {\n    roleHierarchies { name tiers { name } }\n  }\n": typeof types.AdminRoleHierarchiesDocument,
};
const documents: Documents = {
    "query MeProbe { me { id name email role } }": types.MeProbeDocument,
    "query Me { me { id name email role permissions { resource actions } } }": types.MeDocument,
    "\n  query AdminProduct($id: ID!) {\n    product(id: $id) { id name handle createdAt }\n  }\n": types.AdminProductDocument,
    "\n  query AdminProducts($first: Int!, $after: String) {\n    products(first: $first, after: $after) {\n      edges { node { id name handle } }\n      pageInfo { endCursor hasNextPage }\n    }\n  }\n": types.AdminProductsDocument,
    "\n  query AdminUsers($first: Int!, $after: String, $search: String, $where: UserWhereInput, $orderBy: [UserOrderByInput!], $admin: Boolean) {\n    users(first: $first, after: $after, search: $search, where: $where, orderBy: $orderBy, admin: $admin) {\n      edges { node { id name email role banned emailVerified createdAt accounts } }\n      pageInfo { endCursor hasNextPage }\n    }\n  }\n": types.AdminUsersDocument,
    "\n  query AdminUserCounts {\n    userCounts { all admins unverified banned }\n  }\n": types.AdminUserCountsDocument,
    "\n  mutation AdminCreateUser($input: CreateUserInput!) {\n    createUser(input: $input) {\n      __typename\n      ... on CreateUserSuccess { data { user { id } } }\n      ... on ValidationError { message }\n      ... on UserAlreadyExistsError { message }\n      ... on InvalidRoleError { message }\n      ... on RoleAssignmentDeniedError { message }\n      ... on CredentialLinkFailedError { message }\n      ... on PasswordHashFailedError { message }\n    }\n  }\n": types.AdminCreateUserDocument,
    "\n  mutation AdminSetRole($input: SetRoleInput!) {\n    setRole(input: $input) {\n      __typename\n      ... on SetRoleSuccess { data { user { id } } }\n      ... on ForbiddenError { message }\n      ... on UserNotFoundError { message }\n      ... on InvalidRoleError { message }\n      ... on CannotDemoteSelfError { message }\n      ... on RoleAssignmentDeniedError { message }\n    }\n  }\n": types.AdminSetRoleDocument,
    "\n  mutation AdminBanUser($input: BanUserInput!) {\n    banUser(input: $input) {\n      __typename\n      ... on BanUserSuccess { data { user { id } } }\n      ... on ForbiddenError { message }\n      ... on UserNotFoundError { message }\n      ... on CannotBanSelfError { message }\n      ... on UserAlreadyBannedError { message }\n    }\n  }\n": types.AdminBanUserDocument,
    "\n  mutation AdminUnbanUser($input: UnbanUserInput!) {\n    unbanUser(input: $input) {\n      __typename\n      ... on UnbanUserSuccess { data { user { id } } }\n      ... on UserNotFoundError { message }\n      ... on UserNotBannedError { message }\n    }\n  }\n": types.AdminUnbanUserDocument,
    "\n  mutation AdminResendInvitation($input: ResendInvitationInput!) {\n    resendInvitation(input: $input) {\n      __typename\n      ... on ResendInvitationSuccess { data { success } }\n      ... on UserNotFoundError { message }\n    }\n  }\n": types.AdminResendInvitationDocument,
    "\n  query AdminRoleHierarchies {\n    roleHierarchies { name tiers { name } }\n  }\n": types.AdminRoleHierarchiesDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query MeProbe { me { id name email role } }"): typeof import('./graphql').MeProbeDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query Me { me { id name email role permissions { resource actions } } }"): typeof import('./graphql').MeDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AdminProduct($id: ID!) {\n    product(id: $id) { id name handle createdAt }\n  }\n"): typeof import('./graphql').AdminProductDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AdminProducts($first: Int!, $after: String) {\n    products(first: $first, after: $after) {\n      edges { node { id name handle } }\n      pageInfo { endCursor hasNextPage }\n    }\n  }\n"): typeof import('./graphql').AdminProductsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AdminUsers($first: Int!, $after: String, $search: String, $where: UserWhereInput, $orderBy: [UserOrderByInput!], $admin: Boolean) {\n    users(first: $first, after: $after, search: $search, where: $where, orderBy: $orderBy, admin: $admin) {\n      edges { node { id name email role banned emailVerified createdAt accounts } }\n      pageInfo { endCursor hasNextPage }\n    }\n  }\n"): typeof import('./graphql').AdminUsersDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AdminUserCounts {\n    userCounts { all admins unverified banned }\n  }\n"): typeof import('./graphql').AdminUserCountsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AdminCreateUser($input: CreateUserInput!) {\n    createUser(input: $input) {\n      __typename\n      ... on CreateUserSuccess { data { user { id } } }\n      ... on ValidationError { message }\n      ... on UserAlreadyExistsError { message }\n      ... on InvalidRoleError { message }\n      ... on RoleAssignmentDeniedError { message }\n      ... on CredentialLinkFailedError { message }\n      ... on PasswordHashFailedError { message }\n    }\n  }\n"): typeof import('./graphql').AdminCreateUserDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AdminSetRole($input: SetRoleInput!) {\n    setRole(input: $input) {\n      __typename\n      ... on SetRoleSuccess { data { user { id } } }\n      ... on ForbiddenError { message }\n      ... on UserNotFoundError { message }\n      ... on InvalidRoleError { message }\n      ... on CannotDemoteSelfError { message }\n      ... on RoleAssignmentDeniedError { message }\n    }\n  }\n"): typeof import('./graphql').AdminSetRoleDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AdminBanUser($input: BanUserInput!) {\n    banUser(input: $input) {\n      __typename\n      ... on BanUserSuccess { data { user { id } } }\n      ... on ForbiddenError { message }\n      ... on UserNotFoundError { message }\n      ... on CannotBanSelfError { message }\n      ... on UserAlreadyBannedError { message }\n    }\n  }\n"): typeof import('./graphql').AdminBanUserDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AdminUnbanUser($input: UnbanUserInput!) {\n    unbanUser(input: $input) {\n      __typename\n      ... on UnbanUserSuccess { data { user { id } } }\n      ... on UserNotFoundError { message }\n      ... on UserNotBannedError { message }\n    }\n  }\n"): typeof import('./graphql').AdminUnbanUserDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AdminResendInvitation($input: ResendInvitationInput!) {\n    resendInvitation(input: $input) {\n      __typename\n      ... on ResendInvitationSuccess { data { success } }\n      ... on UserNotFoundError { message }\n    }\n  }\n"): typeof import('./graphql').AdminResendInvitationDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AdminRoleHierarchies {\n    roleHierarchies { name tiers { name } }\n  }\n"): typeof import('./graphql').AdminRoleHierarchiesDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
