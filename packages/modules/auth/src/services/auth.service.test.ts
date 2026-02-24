import type { AuthService } from './auth.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthService } from './auth.service'

function createMockApi() {
  return {
    getSession: vi.fn(),
    listSessions: vi.fn(),
    changePassword: vi.fn(),
    changeEmail: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    listUserAccounts: vi.fn(),
    unlinkAccount: vi.fn(),
    accountInfo: vi.fn(),
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
    getTOTPURI: vi.fn(),
    enableTwoFactor: vi.fn(),
    disableTwoFactor: vi.fn(),
    verifyTOTP: vi.fn(),
    sendTwoFactorOTP: vi.fn(),
    verifyTwoFactorOTP: vi.fn(),
    verifyBackupCode: vi.fn(),
    generateBackupCodes: vi.fn(),
  }
}

function createMockAuth() {
  return { api: createMockApi() } as unknown as Parameters<typeof createAuthService>[0]
}

function api(auth: ReturnType<typeof createMockAuth>) {
  return (auth as unknown as { api: ReturnType<typeof createMockApi> }).api
}

const headers = new Headers({ authorization: 'Bearer test-token' })

const mockUser = {
  id: 'u1',
  name: 'Test User',
  email: 'test@example.com',
  role: 'user',
  banned: false,
  createdAt: new Date('2026-01-01'),
}

const mockSession = {
  id: 'sess-1',
  userId: 'u1',
  token: 'tok-1',
  expiresAt: new Date('2026-02-01'),
  createdAt: new Date('2026-01-01'),
}

describe('authService', () => {
  let auth: ReturnType<typeof createMockAuth>
  let service: AuthService

  beforeEach(() => {
    auth = createMockAuth()
    service = createAuthService(auth)
  })

  // ─── getSession ─────────────────────────────────────────────────

  describe('getSession', () => {
    it('should call getSession with headers', async () => {
      api(auth).getSession.mockResolvedValue({ session: mockSession, user: mockUser })

      const result = await service.getSession(headers)

      expect(api(auth).getSession).toHaveBeenCalledWith({ headers })
      expect(result!.user.id).toBe('u1')
    })

    it('should return null when no session', async () => {
      api(auth).getSession.mockResolvedValue(null)

      const result = await service.getSession(headers)

      expect(result).toBeNull()
    })
  })

  // ─── listSessions ──────────────────────────────────────────────

  describe('listSessions', () => {
    it('should call listSessions with headers', async () => {
      api(auth).listSessions.mockResolvedValue([mockSession])

      const result = await service.listSessions(headers)

      expect(api(auth).listSessions).toHaveBeenCalledWith({ headers })
      expect(result).toHaveLength(1)
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).listSessions.mockRejectedValue(new APIError('UNAUTHORIZED', { message: 'No session' }))

      await expect(service.listSessions(headers)).rejects.toThrow('Failed to list sessions')
    })

    it('should propagate non-APIError', async () => {
      api(auth).listSessions.mockRejectedValue(new Error('Network error'))

      await expect(service.listSessions(headers)).rejects.toThrow('Network error')
    })
  })

  // ─── changePassword ────────────────────────────────────────────

  describe('changePassword', () => {
    it('should call changePassword with body and headers', async () => {
      api(auth).changePassword.mockResolvedValue({ status: true })

      const result = await service.changePassword({
        currentPassword: 'old-pass',
        newPassword: 'new-pass',
      }, headers)

      expect(api(auth).changePassword).toHaveBeenCalledWith({
        headers,
        body: { currentPassword: 'old-pass', newPassword: 'new-pass' },
      })
      expect(result).toEqual({ status: true })
    })

    it('should pass revokeOtherSessions option', async () => {
      api(auth).changePassword.mockResolvedValue({ status: true })

      await service.changePassword({
        currentPassword: 'old',
        newPassword: 'new',
        revokeOtherSessions: true,
      }, headers)

      expect(api(auth).changePassword).toHaveBeenCalledWith({
        headers,
        body: { currentPassword: 'old', newPassword: 'new', revokeOtherSessions: true },
      })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).changePassword.mockRejectedValue(new APIError('BAD_REQUEST', { message: 'Wrong password' }))

      await expect(service.changePassword({ currentPassword: 'wrong', newPassword: 'new' }, headers))
        .rejects
        .toThrow('Failed to change password')
    })

    it('should propagate non-APIError', async () => {
      api(auth).changePassword.mockRejectedValue(new Error('Timeout'))

      await expect(service.changePassword({ currentPassword: 'old', newPassword: 'new' }, headers))
        .rejects
        .toThrow('Timeout')
    })
  })

  // ─── changeEmail ───────────────────────────────────────────────

  describe('changeEmail', () => {
    it('should call changeEmail with body and headers', async () => {
      api(auth).changeEmail.mockResolvedValue({ status: true })

      const result = await service.changeEmail({ newEmail: 'new@example.com' }, headers)

      expect(api(auth).changeEmail).toHaveBeenCalledWith({
        headers,
        body: { newEmail: 'new@example.com' },
      })
      expect(result).toEqual({ status: true })
    })

    it('should pass callbackURL when provided', async () => {
      api(auth).changeEmail.mockResolvedValue({ status: true })

      await service.changeEmail({
        newEmail: 'new@example.com',
        callbackURL: 'https://app.example.com/verify',
      }, headers)

      expect(api(auth).changeEmail).toHaveBeenCalledWith({
        headers,
        body: { newEmail: 'new@example.com', callbackURL: 'https://app.example.com/verify' },
      })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).changeEmail.mockRejectedValue(new APIError('BAD_REQUEST', { message: 'Email taken' }))

      await expect(service.changeEmail({ newEmail: 'taken@example.com' }, headers))
        .rejects
        .toThrow('Failed to change email')
    })

    it('should propagate non-APIError', async () => {
      api(auth).changeEmail.mockRejectedValue(new Error('SMTP down'))

      await expect(service.changeEmail({ newEmail: 'a@b.com' }, headers))
        .rejects
        .toThrow('SMTP down')
    })
  })

  // ─── updateProfile ─────────────────────────────────────────────

  describe('updateProfile', () => {
    it('should call updateUser with body and headers', async () => {
      const updated = { ...mockUser, name: 'New Name' }
      api(auth).updateUser.mockResolvedValue(updated)

      const result = await service.updateProfile({ name: 'New Name' }, headers)

      expect(api(auth).updateUser).toHaveBeenCalledWith({
        headers,
        body: { name: 'New Name' },
      })
      expect((result as any).name).toBe('New Name')
    })

    it('should pass image when provided', async () => {
      api(auth).updateUser.mockResolvedValue({ ...mockUser, image: 'https://img.example.com/avatar.png' })

      await service.updateProfile({ image: 'https://img.example.com/avatar.png' }, headers)

      expect(api(auth).updateUser).toHaveBeenCalledWith({
        headers,
        body: { image: 'https://img.example.com/avatar.png' },
      })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).updateUser.mockRejectedValue(new APIError('BAD_REQUEST', { message: 'Invalid' }))

      await expect(service.updateProfile({ name: '' }, headers))
        .rejects
        .toThrow('Failed to update profile')
    })

    it('should propagate non-APIError', async () => {
      api(auth).updateUser.mockRejectedValue(new Error('DB error'))

      await expect(service.updateProfile({ name: 'x' }, headers))
        .rejects
        .toThrow('DB error')
    })
  })

  // ─── deleteAccount ─────────────────────────────────────────────

  describe('deleteAccount', () => {
    it('should call deleteUser with body and headers', async () => {
      api(auth).deleteUser.mockResolvedValue({ success: true })

      const result = await service.deleteAccount({ password: 'my-pass' }, headers)

      expect(api(auth).deleteUser).toHaveBeenCalledWith({
        headers,
        body: { password: 'my-pass' },
      })
      expect(result).toEqual({ success: true })
    })

    it('should pass callbackURL when provided', async () => {
      api(auth).deleteUser.mockResolvedValue({ success: true })

      await service.deleteAccount({
        password: 'pass',
        callbackURL: 'https://app.example.com/goodbye',
      }, headers)

      expect(api(auth).deleteUser).toHaveBeenCalledWith({
        headers,
        body: { password: 'pass', callbackURL: 'https://app.example.com/goodbye' },
      })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).deleteUser.mockRejectedValue(new APIError('FORBIDDEN', { message: 'Wrong password' }))

      await expect(service.deleteAccount({ password: 'wrong' }, headers))
        .rejects
        .toThrow('Failed to delete account')
    })

    it('should propagate non-APIError', async () => {
      api(auth).deleteUser.mockRejectedValue(new Error('DB locked'))

      await expect(service.deleteAccount({}, headers))
        .rejects
        .toThrow('DB locked')
    })
  })

  // ─── listAccounts ──────────────────────────────────────────────

  describe('listAccounts', () => {
    it('should call listAccounts with headers', async () => {
      const accounts = [{ id: 'acc-1', providerId: 'credential', accountId: 'u1' }]
      api(auth).listUserAccounts.mockResolvedValue(accounts)

      const result = await service.listAccounts(headers)

      expect(api(auth).listUserAccounts).toHaveBeenCalledWith({ headers })
      expect(result).toHaveLength(1)
      expect(result[0]!.providerId).toBe('credential')
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).listUserAccounts.mockRejectedValue(new APIError('UNAUTHORIZED', { message: 'No session' }))

      await expect(service.listAccounts(headers)).rejects.toThrow('Failed to list accounts')
    })

    it('should propagate non-APIError', async () => {
      api(auth).listUserAccounts.mockRejectedValue(new Error('Query failed'))

      await expect(service.listAccounts(headers)).rejects.toThrow('Query failed')
    })
  })

  // ─── unlinkAccount ─────────────────────────────────────────────

  describe('unlinkAccount', () => {
    it('should call unlinkAccount with body and headers', async () => {
      api(auth).unlinkAccount.mockResolvedValue({ status: true })

      const result = await service.unlinkAccount({ providerId: 'github' }, headers)

      expect(api(auth).unlinkAccount).toHaveBeenCalledWith({
        headers,
        body: { providerId: 'github' },
      })
      expect(result).toEqual({ status: true })
    })

    it('should pass accountId when provided', async () => {
      api(auth).unlinkAccount.mockResolvedValue({ status: true })

      await service.unlinkAccount({ providerId: 'google', accountId: '12345' }, headers)

      expect(api(auth).unlinkAccount).toHaveBeenCalledWith({
        headers,
        body: { providerId: 'google', accountId: '12345' },
      })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).unlinkAccount.mockRejectedValue(new APIError('BAD_REQUEST', { message: 'Cannot unlink' }))

      await expect(service.unlinkAccount({ providerId: 'github' }, headers))
        .rejects
        .toThrow('Failed to unlink account')
    })

    it('should propagate non-APIError', async () => {
      api(auth).unlinkAccount.mockRejectedValue(new Error('Connection lost'))

      await expect(service.unlinkAccount({ providerId: 'github' }, headers))
        .rejects
        .toThrow('Connection lost')
    })
  })

  // ─── accountInfo ───────────────────────────────────────────────

  describe('accountInfo', () => {
    it('should call accountInfo with headers', async () => {
      const info = { user: { id: 'u1', email: 'test@example.com', emailVerified: true }, data: {} }
      api(auth).accountInfo.mockResolvedValue(info)

      const result = await service.accountInfo(headers)

      expect(api(auth).accountInfo).toHaveBeenCalledWith({ headers })
      expect(result!.user.id).toBe('u1')
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).accountInfo.mockRejectedValue(new APIError('UNAUTHORIZED', { message: 'No session' }))

      await expect(service.accountInfo(headers)).rejects.toThrow('Failed to get account info')
    })

    it('should propagate non-APIError', async () => {
      api(auth).accountInfo.mockRejectedValue(new Error('Unexpected'))

      await expect(service.accountInfo(headers)).rejects.toThrow('Unexpected')
    })
  })

  // ─── revokeSession ─────────────────────────────────────────────

  describe('revokeSession', () => {
    it('should call revokeSession with token in body', async () => {
      api(auth).revokeSession.mockResolvedValue({ status: true })

      const result = await service.revokeSession('tok-1', headers)

      expect(api(auth).revokeSession).toHaveBeenCalledWith({
        headers,
        body: { token: 'tok-1' },
      })
      expect(result).toEqual({ status: true })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).revokeSession.mockRejectedValue(new APIError('NOT_FOUND', { message: 'Not found' }))

      await expect(service.revokeSession('bad-tok', headers))
        .rejects
        .toThrow('Failed to revoke session')
    })

    it('should propagate non-APIError', async () => {
      api(auth).revokeSession.mockRejectedValue(new Error('Redis down'))

      await expect(service.revokeSession('tok-1', headers))
        .rejects
        .toThrow('Redis down')
    })
  })

  // ─── revokeOtherSessions ───────────────────────────────────────

  describe('revokeOtherSessions', () => {
    it('should call revokeOtherSessions with headers', async () => {
      api(auth).revokeOtherSessions.mockResolvedValue({ status: true })

      const result = await service.revokeOtherSessions(headers)

      expect(api(auth).revokeOtherSessions).toHaveBeenCalledWith({ headers })
      expect(result).toEqual({ status: true })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).revokeOtherSessions.mockRejectedValue(new APIError('UNAUTHORIZED', { message: 'No session' }))

      await expect(service.revokeOtherSessions(headers))
        .rejects
        .toThrow('Failed to revoke other sessions')
    })

    it('should propagate non-APIError', async () => {
      api(auth).revokeOtherSessions.mockRejectedValue(new Error('Storage error'))

      await expect(service.revokeOtherSessions(headers))
        .rejects
        .toThrow('Storage error')
    })
  })

  // ─── getTotpUri ─────────────────────────────────────────────────

  describe('getTotpUri', () => {
    it('should call getTOTPURI with password and headers', async () => {
      api(auth).getTOTPURI.mockResolvedValue({ totpURI: 'otpauth://totp/app:user@test.com?secret=ABC' })

      const result = await service.getTotpUri('my-pass', headers)

      expect(api(auth).getTOTPURI).toHaveBeenCalledWith({
        headers,
        body: { password: 'my-pass' },
      })
      expect(result.totpURI).toContain('otpauth://')
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).getTOTPURI.mockRejectedValue(new APIError('BAD_REQUEST', { message: 'Wrong password' }))

      await expect(service.getTotpUri('wrong', headers))
        .rejects
        .toThrow('Failed to get TOTP URI')
    })

    it('should propagate non-APIError', async () => {
      api(auth).getTOTPURI.mockRejectedValue(new Error('DB error'))

      await expect(service.getTotpUri('pass', headers))
        .rejects
        .toThrow('DB error')
    })
  })

  // ─── enableTwoFactor ──────────────────────────────────────────

  describe('enableTwoFactor', () => {
    it('should call enableTwoFactor with password and headers', async () => {
      api(auth).enableTwoFactor.mockResolvedValue({ totpURI: 'otpauth://totp/...', backupCodes: ['code1', 'code2'] })

      const result = await service.enableTwoFactor({ password: 'my-pass' }, headers)

      expect(api(auth).enableTwoFactor).toHaveBeenCalledWith({
        headers,
        body: { password: 'my-pass' },
      })
      expect(result.totpURI).toBeDefined()
      expect(result.backupCodes).toHaveLength(2)
    })

    it('should pass issuer when provided', async () => {
      api(auth).enableTwoFactor.mockResolvedValue({ totpURI: 'otpauth://totp/...', backupCodes: [] })

      await service.enableTwoFactor({ password: 'pass', issuer: 'MyApp' }, headers)

      expect(api(auth).enableTwoFactor).toHaveBeenCalledWith({
        headers,
        body: { password: 'pass', issuer: 'MyApp' },
      })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).enableTwoFactor.mockRejectedValue(new APIError('BAD_REQUEST', { message: 'Wrong password' }))

      await expect(service.enableTwoFactor({ password: 'wrong' }, headers))
        .rejects
        .toThrow('Failed to enable two-factor')
    })

    it('should propagate non-APIError', async () => {
      api(auth).enableTwoFactor.mockRejectedValue(new Error('Timeout'))

      await expect(service.enableTwoFactor({ password: 'p' }, headers))
        .rejects
        .toThrow('Timeout')
    })
  })

  // ─── disableTwoFactor ─────────────────────────────────────────

  describe('disableTwoFactor', () => {
    it('should call disableTwoFactor with password and headers', async () => {
      api(auth).disableTwoFactor.mockResolvedValue({ status: true })

      const result = await service.disableTwoFactor('my-pass', headers)

      expect(api(auth).disableTwoFactor).toHaveBeenCalledWith({
        headers,
        body: { password: 'my-pass' },
      })
      expect(result).toEqual({ status: true })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).disableTwoFactor.mockRejectedValue(new APIError('BAD_REQUEST', { message: '2FA not enabled' }))

      await expect(service.disableTwoFactor('pass', headers))
        .rejects
        .toThrow('Failed to disable two-factor')
    })

    it('should propagate non-APIError', async () => {
      api(auth).disableTwoFactor.mockRejectedValue(new Error('DB error'))

      await expect(service.disableTwoFactor('pass', headers))
        .rejects
        .toThrow('DB error')
    })
  })

  // ─── verifyTotp ───────────────────────────────────────────────

  describe('verifyTotp', () => {
    it('should call verifyTOTP with code and headers', async () => {
      api(auth).verifyTOTP.mockResolvedValue({ token: 'sess-tok', user: mockUser })

      const result = await service.verifyTotp({ code: '123456' }, headers)

      expect(api(auth).verifyTOTP).toHaveBeenCalledWith({
        headers,
        body: { code: '123456' },
      })
      expect(result.token).toBe('sess-tok')
    })

    it('should pass trustDevice when provided', async () => {
      api(auth).verifyTOTP.mockResolvedValue({ token: 'tok', user: mockUser })

      await service.verifyTotp({ code: '123456', trustDevice: true }, headers)

      expect(api(auth).verifyTOTP).toHaveBeenCalledWith({
        headers,
        body: { code: '123456', trustDevice: true },
      })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).verifyTOTP.mockRejectedValue(new APIError('BAD_REQUEST', { message: 'Invalid code' }))

      await expect(service.verifyTotp({ code: '000000' }, headers))
        .rejects
        .toThrow('Failed to verify TOTP')
    })

    it('should propagate non-APIError', async () => {
      api(auth).verifyTOTP.mockRejectedValue(new Error('Crypto error'))

      await expect(service.verifyTotp({ code: '123456' }, headers))
        .rejects
        .toThrow('Crypto error')
    })
  })

  // ─── sendOtp ──────────────────────────────────────────────────

  describe('sendOtp', () => {
    it('should call sendTwoFactorOTP with headers', async () => {
      api(auth).sendTwoFactorOTP.mockResolvedValue({ status: true })

      const result = await service.sendOtp(headers)

      expect(api(auth).sendTwoFactorOTP).toHaveBeenCalledWith({ headers })
      expect(result).toEqual({ status: true })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).sendTwoFactorOTP.mockRejectedValue(new APIError('BAD_REQUEST', { message: 'OTP not enabled' }))

      await expect(service.sendOtp(headers))
        .rejects
        .toThrow('Failed to send OTP')
    })

    it('should propagate non-APIError', async () => {
      api(auth).sendTwoFactorOTP.mockRejectedValue(new Error('SMTP down'))

      await expect(service.sendOtp(headers))
        .rejects
        .toThrow('SMTP down')
    })
  })

  // ─── verifyOtp ────────────────────────────────────────────────

  describe('verifyOtp', () => {
    it('should call verifyTwoFactorOTP with code and headers', async () => {
      api(auth).verifyTwoFactorOTP.mockResolvedValue({ token: 'sess-tok', user: mockUser })

      const result = await service.verifyOtp({ code: '654321' }, headers)

      expect(api(auth).verifyTwoFactorOTP).toHaveBeenCalledWith({
        headers,
        body: { code: '654321' },
      })
      expect(result.token).toBe('sess-tok')
    })

    it('should pass trustDevice when provided', async () => {
      api(auth).verifyTwoFactorOTP.mockResolvedValue({ token: 'tok', user: mockUser })

      await service.verifyOtp({ code: '654321', trustDevice: true }, headers)

      expect(api(auth).verifyTwoFactorOTP).toHaveBeenCalledWith({
        headers,
        body: { code: '654321', trustDevice: true },
      })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).verifyTwoFactorOTP.mockRejectedValue(new APIError('BAD_REQUEST', { message: 'Invalid code' }))

      await expect(service.verifyOtp({ code: '000000' }, headers))
        .rejects
        .toThrow('Failed to verify OTP')
    })

    it('should propagate non-APIError', async () => {
      api(auth).verifyTwoFactorOTP.mockRejectedValue(new Error('Redis down'))

      await expect(service.verifyOtp({ code: '654321' }, headers))
        .rejects
        .toThrow('Redis down')
    })
  })

  // ─── verifyBackupCode ─────────────────────────────────────────

  describe('verifyBackupCode', () => {
    it('should call verifyBackupCode with code and headers', async () => {
      api(auth).verifyBackupCode.mockResolvedValue({ token: 'sess-tok', user: mockUser })

      const result = await service.verifyBackupCode({ code: 'backup-abc' }, headers)

      expect(api(auth).verifyBackupCode).toHaveBeenCalledWith({
        headers,
        body: { code: 'backup-abc' },
      })
      expect(result.token).toBe('sess-tok')
    })

    it('should pass disableSession and trustDevice when provided', async () => {
      api(auth).verifyBackupCode.mockResolvedValue({ token: 'tok', user: mockUser })

      await service.verifyBackupCode({ code: 'backup-abc', disableSession: true, trustDevice: false }, headers)

      expect(api(auth).verifyBackupCode).toHaveBeenCalledWith({
        headers,
        body: { code: 'backup-abc', disableSession: true, trustDevice: false },
      })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).verifyBackupCode.mockRejectedValue(new APIError('BAD_REQUEST', { message: 'Invalid backup code' }))

      await expect(service.verifyBackupCode({ code: 'bad-code' }, headers))
        .rejects
        .toThrow('Failed to verify backup code')
    })

    it('should propagate non-APIError', async () => {
      api(auth).verifyBackupCode.mockRejectedValue(new Error('DB error'))

      await expect(service.verifyBackupCode({ code: 'code' }, headers))
        .rejects
        .toThrow('DB error')
    })
  })

  // ─── generateBackupCodes ──────────────────────────────────────

  describe('generateBackupCodes', () => {
    it('should call generateBackupCodes with password and headers', async () => {
      api(auth).generateBackupCodes.mockResolvedValue({ status: true, backupCodes: ['c1', 'c2', 'c3'] })

      const result = await service.generateBackupCodes('my-pass', headers)

      expect(api(auth).generateBackupCodes).toHaveBeenCalledWith({
        headers,
        body: { password: 'my-pass' },
      })
      expect(result.backupCodes).toHaveLength(3)
      expect(result.status).toBe(true)
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).generateBackupCodes.mockRejectedValue(new APIError('BAD_REQUEST', { message: 'Wrong password' }))

      await expect(service.generateBackupCodes('wrong', headers))
        .rejects
        .toThrow('Failed to generate backup codes')
    })

    it('should propagate non-APIError', async () => {
      api(auth).generateBackupCodes.mockRejectedValue(new Error('Crypto error'))

      await expect(service.generateBackupCodes('pass', headers))
        .rejects
        .toThrow('Crypto error')
    })
  })
})
