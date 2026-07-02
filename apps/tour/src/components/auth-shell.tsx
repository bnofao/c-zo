import { Badge } from '@workspace/ui/components/badge'
import * as React from 'react'

function LogoMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-10 flex-none place-items-center rounded-xl bg-primary text-lg font-bold tracking-tighter text-primary-foreground">
        C
      </div>
      <span className="text-[19px] font-semibold tracking-tight">
        Czo
        {' '}
        <span className="font-medium text-muted-foreground">Admin</span>
      </span>
    </div>
  )
}

/**
 * Split auth layout shared by the public screens (login, password reset):
 * a dark brand panel (logo, badge, tagline) beside a centered form panel.
 */
export function AuthShell({ badge, tagline, copyright, children }: {
  badge: string
  tagline: string
  copyright: string
  children: React.ReactNode
}) {
  return (
    <div className="grid h-screen grid-cols-1 md:grid-cols-2">
      {/* Brand panel — always dark-themed, hidden on small screens. */}
      <div className="dark relative hidden flex-col justify-between overflow-hidden bg-background p-9 text-foreground md:flex">
        <LogoMark />
        <div
          className="pointer-events-none absolute inset-0 opacity-55"
          style={{ background: 'radial-gradient(120% 80% at 100% 0%, color-mix(in oklab, var(--primary) 22%, transparent), transparent 60%)' }}
        />
        <div className="relative max-w-80">
          <Badge variant="secondary" className="mb-4">{badge}</Badge>
          <p className="text-[25px] font-semibold leading-tight tracking-tight text-balance">
            {tagline}
          </p>
        </div>
        <span className="relative text-xs text-muted-foreground">{copyright}</span>
      </div>

      {/* Form panel. */}
      <div className="grid place-items-center bg-background p-9">
        <div className="w-full max-w-sm">
          {children}
        </div>
      </div>
    </div>
  )
}
