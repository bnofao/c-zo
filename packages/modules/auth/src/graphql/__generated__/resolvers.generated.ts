/* This file was automatically generated. DO NOT UPDATE MANUALLY. */
    import type   { Resolvers } from './types.generated';
    import    { accountInfo as Query_accountInfo } from './../schema/account/resolvers/Query/accountInfo';
import    { activeMember as Query_activeMember } from './../schema/organization/resolvers/Query/activeMember';
import    { activeMemberRole as Query_activeMemberRole } from './../schema/organization/resolvers/Query/activeMemberRole';
import    { apiKey as Query_apiKey } from './../schema/api-key/resolvers/Query/apiKey';
import    { checkSlug as Query_checkSlug } from './../schema/organization/resolvers/Query/checkSlug';
import    { invitation as Query_invitation } from './../schema/organization/resolvers/Query/invitation';
import    { invitations as Query_invitations } from './../schema/organization/resolvers/Query/invitations';
import    { me as Query_me } from './../schema/account/resolvers/Query/me';
import    { members as Query_members } from './../schema/organization/resolvers/Query/members';
import    { myAccounts as Query_myAccounts } from './../schema/account/resolvers/Query/myAccounts';
import    { myApiKeys as Query_myApiKeys } from './../schema/api-key/resolvers/Query/myApiKeys';
import    { myInvitations as Query_myInvitations } from './../schema/organization/resolvers/Query/myInvitations';
import    { mySessions as Query_mySessions } from './../schema/account/resolvers/Query/mySessions';
import    { organization as Query_organization } from './../schema/organization/resolvers/Query/organization';
import    { organizations as Query_organizations } from './../schema/organization/resolvers/Query/organizations';
import    { totpUri as Query_totpUri } from './../schema/two-factor/resolvers/Query/totpUri';
import    { user as Query_user } from './../schema/user/resolvers/Query/user';
import    { userSessions as Query_userSessions } from './../schema/user/resolvers/Query/userSessions';
import    { users as Query_users } from './../schema/user/resolvers/Query/users';
import    { acceptInvitation as Mutation_acceptInvitation } from './../schema/organization/resolvers/Mutation/acceptInvitation';
import    { banUser as Mutation_banUser } from './../schema/user/resolvers/Mutation/banUser';
import    { cancelInvitation as Mutation_cancelInvitation } from './../schema/organization/resolvers/Mutation/cancelInvitation';
import    { changeEmail as Mutation_changeEmail } from './../schema/account/resolvers/Mutation/changeEmail';
import    { changePassword as Mutation_changePassword } from './../schema/account/resolvers/Mutation/changePassword';
import    { createApiKey as Mutation_createApiKey } from './../schema/api-key/resolvers/Mutation/createApiKey';
import    { createOrganization as Mutation_createOrganization } from './../schema/organization/resolvers/Mutation/createOrganization';
import    { createUser as Mutation_createUser } from './../schema/user/resolvers/Mutation/createUser';
import    { deleteAccount as Mutation_deleteAccount } from './../schema/account/resolvers/Mutation/deleteAccount';
import    { deleteApiKey as Mutation_deleteApiKey } from './../schema/api-key/resolvers/Mutation/deleteApiKey';
import    { deleteOrganization as Mutation_deleteOrganization } from './../schema/organization/resolvers/Mutation/deleteOrganization';
import    { disableTwoFactor as Mutation_disableTwoFactor } from './../schema/two-factor/resolvers/Mutation/disableTwoFactor';
import    { enableTwoFactor as Mutation_enableTwoFactor } from './../schema/two-factor/resolvers/Mutation/enableTwoFactor';
import    { generateBackupCodes as Mutation_generateBackupCodes } from './../schema/two-factor/resolvers/Mutation/generateBackupCodes';
import    { impersonateUser as Mutation_impersonateUser } from './../schema/user/resolvers/Mutation/impersonateUser';
import    { inviteMember as Mutation_inviteMember } from './../schema/organization/resolvers/Mutation/inviteMember';
import    { leaveOrganization as Mutation_leaveOrganization } from './../schema/organization/resolvers/Mutation/leaveOrganization';
import    { rejectInvitation as Mutation_rejectInvitation } from './../schema/organization/resolvers/Mutation/rejectInvitation';
import    { removeMember as Mutation_removeMember } from './../schema/organization/resolvers/Mutation/removeMember';
import    { removeUser as Mutation_removeUser } from './../schema/user/resolvers/Mutation/removeUser';
import    { revokeMySession as Mutation_revokeMySession } from './../schema/account/resolvers/Mutation/revokeMySession';
import    { revokeOtherSessions as Mutation_revokeOtherSessions } from './../schema/account/resolvers/Mutation/revokeOtherSessions';
import    { revokeSession as Mutation_revokeSession } from './../schema/user/resolvers/Mutation/revokeSession';
import    { revokeSessions as Mutation_revokeSessions } from './../schema/user/resolvers/Mutation/revokeSessions';
import    { sendOtp as Mutation_sendOtp } from './../schema/two-factor/resolvers/Mutation/sendOtp';
import    { setActiveOrganization as Mutation_setActiveOrganization } from './../schema/organization/resolvers/Mutation/setActiveOrganization';
import    { setRole as Mutation_setRole } from './../schema/user/resolvers/Mutation/setRole';
import    { setUserPassword as Mutation_setUserPassword } from './../schema/user/resolvers/Mutation/setUserPassword';
import    { stopImpersonation as Mutation_stopImpersonation } from './../schema/user/resolvers/Mutation/stopImpersonation';
import    { unbanUser as Mutation_unbanUser } from './../schema/user/resolvers/Mutation/unbanUser';
import    { unlinkAccount as Mutation_unlinkAccount } from './../schema/account/resolvers/Mutation/unlinkAccount';
import    { updateApiKey as Mutation_updateApiKey } from './../schema/api-key/resolvers/Mutation/updateApiKey';
import    { updateMemberRole as Mutation_updateMemberRole } from './../schema/organization/resolvers/Mutation/updateMemberRole';
import    { updateOrganization as Mutation_updateOrganization } from './../schema/organization/resolvers/Mutation/updateOrganization';
import    { updateProfile as Mutation_updateProfile } from './../schema/account/resolvers/Mutation/updateProfile';
import    { updateUser as Mutation_updateUser } from './../schema/user/resolvers/Mutation/updateUser';
import    { verifyBackupCode as Mutation_verifyBackupCode } from './../schema/two-factor/resolvers/Mutation/verifyBackupCode';
import    { verifyOtp as Mutation_verifyOtp } from './../schema/two-factor/resolvers/Mutation/verifyOtp';
import    { verifyTotp as Mutation_verifyTotp } from './../schema/two-factor/resolvers/Mutation/verifyTotp';
import    { _empty as Query__empty } from '././../../../../../kit/src/graphql/resolvers/Query/_empty';
import    { _empty as Mutation__empty } from '././../../../../../kit/src/graphql/resolvers/Mutation/_empty';
import    { DateTimeResolver,EmailAddressResolver,JSONResolver } from 'graphql-scalars';
    export const resolvers: Resolvers = {
      Query: { accountInfo: Query_accountInfo,activeMember: Query_activeMember,activeMemberRole: Query_activeMemberRole,apiKey: Query_apiKey,checkSlug: Query_checkSlug,invitation: Query_invitation,invitations: Query_invitations,me: Query_me,members: Query_members,myAccounts: Query_myAccounts,myApiKeys: Query_myApiKeys,myInvitations: Query_myInvitations,mySessions: Query_mySessions,organization: Query_organization,organizations: Query_organizations,totpUri: Query_totpUri,user: Query_user,userSessions: Query_userSessions,users: Query_users,_empty: Query__empty },
      Mutation: { acceptInvitation: Mutation_acceptInvitation,banUser: Mutation_banUser,cancelInvitation: Mutation_cancelInvitation,changeEmail: Mutation_changeEmail,changePassword: Mutation_changePassword,createApiKey: Mutation_createApiKey,createOrganization: Mutation_createOrganization,createUser: Mutation_createUser,deleteAccount: Mutation_deleteAccount,deleteApiKey: Mutation_deleteApiKey,deleteOrganization: Mutation_deleteOrganization,disableTwoFactor: Mutation_disableTwoFactor,enableTwoFactor: Mutation_enableTwoFactor,generateBackupCodes: Mutation_generateBackupCodes,impersonateUser: Mutation_impersonateUser,inviteMember: Mutation_inviteMember,leaveOrganization: Mutation_leaveOrganization,rejectInvitation: Mutation_rejectInvitation,removeMember: Mutation_removeMember,removeUser: Mutation_removeUser,revokeMySession: Mutation_revokeMySession,revokeOtherSessions: Mutation_revokeOtherSessions,revokeSession: Mutation_revokeSession,revokeSessions: Mutation_revokeSessions,sendOtp: Mutation_sendOtp,setActiveOrganization: Mutation_setActiveOrganization,setRole: Mutation_setRole,setUserPassword: Mutation_setUserPassword,stopImpersonation: Mutation_stopImpersonation,unbanUser: Mutation_unbanUser,unlinkAccount: Mutation_unlinkAccount,updateApiKey: Mutation_updateApiKey,updateMemberRole: Mutation_updateMemberRole,updateOrganization: Mutation_updateOrganization,updateProfile: Mutation_updateProfile,updateUser: Mutation_updateUser,verifyBackupCode: Mutation_verifyBackupCode,verifyOtp: Mutation_verifyOtp,verifyTotp: Mutation_verifyTotp,_empty: Mutation__empty },
      
      DateTime: DateTimeResolver,
EmailAddress: EmailAddressResolver,
JSON: JSONResolver
    }