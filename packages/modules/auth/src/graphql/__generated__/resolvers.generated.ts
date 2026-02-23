/* This file was automatically generated. DO NOT UPDATE MANUALLY. */
    import type   { Resolvers } from './types.generated';
    import    { _empty as Query__empty } from './../schema/resolvers/Query/_empty';
import    { activeMember as Query_activeMember } from './../schema/organization/resolvers/Query/activeMember';
import    { activeMemberRole as Query_activeMemberRole } from './../schema/organization/resolvers/Query/activeMemberRole';
import    { apiKey as Query_apiKey } from './../schema/api-key/resolvers/Query/apiKey';
import    { checkSlug as Query_checkSlug } from './../schema/organization/resolvers/Query/checkSlug';
import    { invitation as Query_invitation } from './../schema/organization/resolvers/Query/invitation';
import    { invitations as Query_invitations } from './../schema/organization/resolvers/Query/invitations';
import    { members as Query_members } from './../schema/organization/resolvers/Query/members';
import    { myApiKeys as Query_myApiKeys } from './../schema/api-key/resolvers/Query/myApiKeys';
import    { myAuthConfig as Query_myAuthConfig } from './../schema/resolvers/Query/myAuthConfig';
import    { organization as Query_organization } from './../schema/organization/resolvers/Query/organization';
import    { organizations as Query_organizations } from './../schema/organization/resolvers/Query/organizations';
import    { user as Query_user } from './../schema/user/resolvers/Query/user';
import    { userSessions as Query_userSessions } from './../schema/user/resolvers/Query/userSessions';
import    { users as Query_users } from './../schema/user/resolvers/Query/users';
import    { _empty as Mutation__empty } from './../schema/resolvers/Mutation/_empty';
import    { acceptInvitation as Mutation_acceptInvitation } from './../schema/organization/resolvers/Mutation/acceptInvitation';
import    { banUser as Mutation_banUser } from './../schema/user/resolvers/Mutation/banUser';
import    { cancelInvitation as Mutation_cancelInvitation } from './../schema/organization/resolvers/Mutation/cancelInvitation';
import    { createApiKey as Mutation_createApiKey } from './../schema/api-key/resolvers/Mutation/createApiKey';
import    { createOrganization as Mutation_createOrganization } from './../schema/organization/resolvers/Mutation/createOrganization';
import    { createUser as Mutation_createUser } from './../schema/user/resolvers/Mutation/createUser';
import    { deleteApiKey as Mutation_deleteApiKey } from './../schema/api-key/resolvers/Mutation/deleteApiKey';
import    { deleteOrganization as Mutation_deleteOrganization } from './../schema/organization/resolvers/Mutation/deleteOrganization';
import    { impersonateUser as Mutation_impersonateUser } from './../schema/user/resolvers/Mutation/impersonateUser';
import    { inviteMember as Mutation_inviteMember } from './../schema/organization/resolvers/Mutation/inviteMember';
import    { leaveOrganization as Mutation_leaveOrganization } from './../schema/organization/resolvers/Mutation/leaveOrganization';
import    { rejectInvitation as Mutation_rejectInvitation } from './../schema/organization/resolvers/Mutation/rejectInvitation';
import    { removeMember as Mutation_removeMember } from './../schema/organization/resolvers/Mutation/removeMember';
import    { removeUser as Mutation_removeUser } from './../schema/user/resolvers/Mutation/removeUser';
import    { revokeSession as Mutation_revokeSession } from './../schema/user/resolvers/Mutation/revokeSession';
import    { revokeSessions as Mutation_revokeSessions } from './../schema/user/resolvers/Mutation/revokeSessions';
import    { setActiveOrganization as Mutation_setActiveOrganization } from './../schema/organization/resolvers/Mutation/setActiveOrganization';
import    { setRole as Mutation_setRole } from './../schema/user/resolvers/Mutation/setRole';
import    { stopImpersonation as Mutation_stopImpersonation } from './../schema/user/resolvers/Mutation/stopImpersonation';
import    { unbanUser as Mutation_unbanUser } from './../schema/user/resolvers/Mutation/unbanUser';
import    { updateApiKey as Mutation_updateApiKey } from './../schema/api-key/resolvers/Mutation/updateApiKey';
import    { updateMemberRole as Mutation_updateMemberRole } from './../schema/organization/resolvers/Mutation/updateMemberRole';
import    { updateOrganization as Mutation_updateOrganization } from './../schema/organization/resolvers/Mutation/updateOrganization';
import    { updateUser as Mutation_updateUser } from './../schema/user/resolvers/Mutation/updateUser';
import    { DateTimeResolver,EmailAddressResolver,JSONResolver } from 'graphql-scalars';
    export const resolvers: Resolvers = {
      Query: { _empty: Query__empty,activeMember: Query_activeMember,activeMemberRole: Query_activeMemberRole,apiKey: Query_apiKey,checkSlug: Query_checkSlug,invitation: Query_invitation,invitations: Query_invitations,members: Query_members,myApiKeys: Query_myApiKeys,myAuthConfig: Query_myAuthConfig,organization: Query_organization,organizations: Query_organizations,user: Query_user,userSessions: Query_userSessions,users: Query_users },
      Mutation: { _empty: Mutation__empty,acceptInvitation: Mutation_acceptInvitation,banUser: Mutation_banUser,cancelInvitation: Mutation_cancelInvitation,createApiKey: Mutation_createApiKey,createOrganization: Mutation_createOrganization,createUser: Mutation_createUser,deleteApiKey: Mutation_deleteApiKey,deleteOrganization: Mutation_deleteOrganization,impersonateUser: Mutation_impersonateUser,inviteMember: Mutation_inviteMember,leaveOrganization: Mutation_leaveOrganization,rejectInvitation: Mutation_rejectInvitation,removeMember: Mutation_removeMember,removeUser: Mutation_removeUser,revokeSession: Mutation_revokeSession,revokeSessions: Mutation_revokeSessions,setActiveOrganization: Mutation_setActiveOrganization,setRole: Mutation_setRole,stopImpersonation: Mutation_stopImpersonation,unbanUser: Mutation_unbanUser,updateApiKey: Mutation_updateApiKey,updateMemberRole: Mutation_updateMemberRole,updateOrganization: Mutation_updateOrganization,updateUser: Mutation_updateUser },
      
      DateTime: DateTimeResolver,
EmailAddress: EmailAddressResolver,
JSON: JSONResolver
    }