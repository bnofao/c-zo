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
    "query Me { me { id name email role } }": typeof types.MeDocument,
    "\n  query AdminProduct($id: ID!) {\n    product(id: $id) { id name handle createdAt }\n  }\n": typeof types.AdminProductDocument,
    "\n  query AdminProducts($first: Int!, $after: String) {\n    products(first: $first, after: $after) {\n      edges { node { id name handle } }\n      pageInfo { endCursor hasNextPage }\n    }\n  }\n": typeof types.AdminProductsDocument,
    "\n  query AdminUsers($first: Int!, $after: String, $search: String, $where: UserWhereInput, $orderBy: [UserOrderByInput!]) {\n    users(first: $first, after: $after, search: $search, where: $where, orderBy: $orderBy) {\n      edges { node { id name email role banned emailVerified createdAt } }\n      pageInfo { endCursor hasNextPage }\n    }\n  }\n": typeof types.AdminUsersDocument,
    "\n  query AdminUserCounts {\n    userCounts { all admins unverified banned }\n  }\n": typeof types.AdminUserCountsDocument,
};
const documents: Documents = {
    "query Me { me { id name email role } }": types.MeDocument,
    "\n  query AdminProduct($id: ID!) {\n    product(id: $id) { id name handle createdAt }\n  }\n": types.AdminProductDocument,
    "\n  query AdminProducts($first: Int!, $after: String) {\n    products(first: $first, after: $after) {\n      edges { node { id name handle } }\n      pageInfo { endCursor hasNextPage }\n    }\n  }\n": types.AdminProductsDocument,
    "\n  query AdminUsers($first: Int!, $after: String, $search: String, $where: UserWhereInput, $orderBy: [UserOrderByInput!]) {\n    users(first: $first, after: $after, search: $search, where: $where, orderBy: $orderBy) {\n      edges { node { id name email role banned emailVerified createdAt } }\n      pageInfo { endCursor hasNextPage }\n    }\n  }\n": types.AdminUsersDocument,
    "\n  query AdminUserCounts {\n    userCounts { all admins unverified banned }\n  }\n": types.AdminUserCountsDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query Me { me { id name email role } }"): typeof import('./graphql').MeDocument;
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
export function graphql(source: "\n  query AdminUsers($first: Int!, $after: String, $search: String, $where: UserWhereInput, $orderBy: [UserOrderByInput!]) {\n    users(first: $first, after: $after, search: $search, where: $where, orderBy: $orderBy) {\n      edges { node { id name email role banned emailVerified createdAt } }\n      pageInfo { endCursor hasNextPage }\n    }\n  }\n"): typeof import('./graphql').AdminUsersDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AdminUserCounts {\n    userCounts { all admins unverified banned }\n  }\n"): typeof import('./graphql').AdminUserCountsDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
