import { useLogger } from '@czo/kit'

export interface EmailParams {
  to: string
  userName: string
  url: string
  token: string
}

export interface EmailService {
  sendVerificationEmail: (params: EmailParams) => Promise<void>
  sendPasswordResetEmail: (params: EmailParams) => Promise<void>
}

export class ConsoleEmailService implements EmailService {
  private readonly logger: ReturnType<typeof useLogger>

  constructor() {
    this.logger = useLogger('auth:email')
  }

  async sendVerificationEmail(params: EmailParams): Promise<void> {
    this.logger.info('[Verification Email]', {
      to: params.to,
      userName: params.userName,
      url: params.url,
    })
  }

  async sendPasswordResetEmail(params: EmailParams): Promise<void> {
    this.logger.info('[Password Reset Email]', {
      to: params.to,
      userName: params.userName,
      url: params.url,
    })
  }
}
