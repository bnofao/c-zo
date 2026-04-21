import { registerMiddleware } from '@czo/kit/graphql'
import { banUserMiddleware } from './ban-user'
import { createUserMiddleware } from './create-user'
import { updateUserMiddleware } from './update-user'
import { userExists } from './user-exists'

registerMiddleware({
  Mutation: {
    createUser: createUserMiddleware,
    updateUser: [userExists('user'), updateUserMiddleware],
    banUser: [userExists('user'), banUserMiddleware],
    unbanUser: userExists('user'),
    setRole: userExists('user'),
    setUserPassword: userExists('success'),
    removeUser: userExists('user'),
    impersonateUser: userExists('success'),
    revokeSessions: userExists('success'),
  },
})
