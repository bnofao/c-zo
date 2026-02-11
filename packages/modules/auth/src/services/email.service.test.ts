import { describe, expect, it, vi } from 'vitest'

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))

vi.mock('@czo/kit', () => ({
  useLogger: () => mockLogger,
}))

// eslint-disable-next-line import/first
import { ConsoleEmailService } from './email.service'

describe('consoleEmailService', () => {
  const service = new ConsoleEmailService()
  const params = {
    to: 'user@czo.dev',
    userName: 'Test User',
    url: 'http://localhost:4000/verify?token=abc',
    token: 'abc',
  }

  it('should log verification email with recipient info', async () => {
    await service.sendVerificationEmail(params)

    expect(mockLogger.info).toHaveBeenCalledWith(
      '[Verification Email]',
      expect.objectContaining({
        to: 'user@czo.dev',
        userName: 'Test User',
        url: 'http://localhost:4000/verify?token=abc',
      }),
    )
  })

  it('should resolve without throwing for verification email', async () => {
    await expect(service.sendVerificationEmail(params)).resolves.toBeUndefined()
  })

  it('should log password reset email with recipient info', async () => {
    await service.sendPasswordResetEmail(params)

    expect(mockLogger.info).toHaveBeenCalledWith(
      '[Password Reset Email]',
      expect.objectContaining({
        to: 'user@czo.dev',
        userName: 'Test User',
        url: 'http://localhost:4000/verify?token=abc',
      }),
    )
  })

  it('should resolve without throwing for password reset email', async () => {
    await expect(service.sendPasswordResetEmail(params)).resolves.toBeUndefined()
  })

  it('should include URL in verification email log', async () => {
    await service.sendVerificationEmail(params)

    const logged = mockLogger.info.mock.calls.find(
      (call: unknown[]) => call[0] === '[Verification Email]',
    )
    expect(logged?.[1]).toHaveProperty('url')
  })

  it('should include URL in password reset email log', async () => {
    await service.sendPasswordResetEmail(params)

    const logged = mockLogger.info.mock.calls.find(
      (call: unknown[]) => call[0] === '[Password Reset Email]',
    )
    expect(logged?.[1]).toHaveProperty('url')
  })
})
