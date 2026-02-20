/* This file was automatically generated. DO NOT UPDATE MANUALLY. */
    import type   { Resolvers } from './types.generated';
    import    { _empty as Query__empty } from './../schema/resolvers/Query/_empty';
import    { myApiKeys as Query_myApiKeys } from './../schema/resolvers/Query/myApiKeys';
import    { myAuthConfig as Query_myAuthConfig } from './../schema/resolvers/Query/myAuthConfig';
import    { myOrganizations as Query_myOrganizations } from './../schema/resolvers/Query/myOrganizations';
import    { organization as Query_organization } from './../schema/resolvers/Query/organization';
import    { user as Query_user } from './../schema/user/resolvers/Query/user';
import    { userSessions as Query_userSessions } from './../schema/user/resolvers/Query/userSessions';
import    { users as Query_users } from './../schema/user/resolvers/Query/users';
import    { _empty as Mutation__empty } from './../schema/resolvers/Mutation/_empty';
import    { acceptInvitation as Mutation_acceptInvitation } from './../schema/resolvers/Mutation/acceptInvitation';
import    { banUser as Mutation_banUser } from './../schema/user/resolvers/Mutation/banUser';
import    { createOrganization as Mutation_createOrganization } from './../schema/resolvers/Mutation/createOrganization';
import    { createUser as Mutation_createUser } from './../schema/user/resolvers/Mutation/createUser';
import    { impersonateUser as Mutation_impersonateUser } from './../schema/user/resolvers/Mutation/impersonateUser';
import    { inviteMember as Mutation_inviteMember } from './../schema/resolvers/Mutation/inviteMember';
import    { removeMember as Mutation_removeMember } from './../schema/resolvers/Mutation/removeMember';
import    { removeUser as Mutation_removeUser } from './../schema/user/resolvers/Mutation/removeUser';
import    { revokeSession as Mutation_revokeSession } from './../schema/user/resolvers/Mutation/revokeSession';
import    { revokeSessions as Mutation_revokeSessions } from './../schema/user/resolvers/Mutation/revokeSessions';
import    { setActiveOrganization as Mutation_setActiveOrganization } from './../schema/resolvers/Mutation/setActiveOrganization';
import    { setRole as Mutation_setRole } from './../schema/user/resolvers/Mutation/setRole';
import    { stopImpersonation as Mutation_stopImpersonation } from './../schema/user/resolvers/Mutation/stopImpersonation';
import    { unbanUser as Mutation_unbanUser } from './../schema/user/resolvers/Mutation/unbanUser';
import    { updateUser as Mutation_updateUser } from './../schema/user/resolvers/Mutation/updateUser';
import    { DateTimeResolver,EmailAddressResolver } from 'graphql-scalars';
    export const resolvers: Resolvers = {
      Query: { _empty: Query__empty,myApiKeys: Query_myApiKeys,myAuthConfig: Query_myAuthConfig,myOrganizations: Query_myOrganizations,organization: Query_organization,user: Query_user,userSessions: Query_userSessions,users: Query_users },
      Mutation: { _empty: Mutation__empty,acceptInvitation: Mutation_acceptInvitation,banUser: Mutation_banUser,createOrganization: Mutation_createOrganization,createUser: Mutation_createUser,impersonateUser: Mutation_impersonateUser,inviteMember: Mutation_inviteMember,removeMember: Mutation_removeMember,removeUser: Mutation_removeUser,revokeSession: Mutation_revokeSession,revokeSessions: Mutation_revokeSessions,setActiveOrganization: Mutation_setActiveOrganization,setRole: Mutation_setRole,stopImpersonation: Mutation_stopImpersonation,unbanUser: Mutation_unbanUser,updateUser: Mutation_updateUser },
      
      DateTime: DateTimeResolver,
EmailAddress: EmailAddressResolver
    }