// apps/web/src/shared/ui/AccountMenu.tsx
// The header's right-most account slot, extracted from AppShell so BOTH the app
// chrome (AppShell) and the CinemaStudio editor's own top bar can render the
// same account affordance without one importing the other. Deliberately
// PRESENTATIONAL — session state and the sign-out action are injected by the
// composing route (shared/ui must not import modules/*).
// Three states, never a blank spot: skeleton while the session resolves, a RED
// specimen "Sign in" pill when signed out, the disclosure menu when signed in.
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Skeleton } from './Skeleton'

export type AccountUser = {
  // Display name for the menu trigger; null falls back to the email
  name: string | null
  // Account email — always present on a signed-in account
  email: string
}

export type AccountMenuProps = {
  // Signed-in account, or null when signed out (shows the Sign in pill)
  user: AccountUser | null
  // True while the session is still resolving — shows a placeholder instead of
  // flashing "Sign in" at a signed-in user
  isSessionPending?: boolean
  // Sign-out action (modules/Auth), injected by the composing route
  onSignOut: () => void
}

// Right-most header slot: skeleton while the session resolves, Sign in link
// when signed out, the user menu when signed in — never a blank spot
export function AccountMenu({ user, isSessionPending = false, onSignOut }: AccountMenuProps) {
  const { t } = useTranslation()

  if (isSessionPending) {
    // Pill-shaped stepped pulse mirrors the sign-in pill / menu trigger silhouette
    return <Skeleton className="h-8 w-24 rounded-full" />
  }

  if (!user) {
    // Link styled as a RED specimen pill — the reference taxonomy files
    // login/auth actions under the red tint (mirrors Button danger classes)
    return (
      <Link
        to="/login"
        className="inline-flex min-h-8 items-center justify-center rounded-full border border-white/10 bg-specimen-red/20 px-4 py-1 text-xs font-medium text-lumen-red shadow-pill transition-colors duration-200 hover:bg-specimen-red/35 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
      >
        {t('nav.signIn')}
      </Link>
    )
  }

  return <UserMenu user={user} onSignOut={onSignOut} />
}

type UserMenuProps = {
  // Signed-in account shown on the trigger
  user: AccountUser
  // Fired by the Sign out item (after the menu closes)
  onSignOut: () => void
}

// Minimal disclosure menu: trigger with aria-haspopup/aria-expanded, an
// invisible click-away layer, Escape to close — no dependency needed for one item
function UserMenu({ user, onSignOut }: UserMenuProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)

  // A better-auth name can be an empty string — treat it like a missing name
  const label = user.name?.trim() ? user.name : user.email

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') setIsOpen(false)
  }

  const handleSignOut = () => {
    setIsOpen(false)
    onSignOut()
  }

  return (
    <div className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        // Quiet trigger: the hover steps the surface up to ridge — the account
        // is chrome, not a call to action, so it never gets a triad tint
        className="inline-flex min-h-8 max-w-48 items-center gap-1 truncate rounded-full px-3 py-1 text-xs font-medium text-mist transition-colors duration-200 hover:bg-ridge focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
      >
        <span className="truncate">{label}</span>
        {/* Decorative chevron — the aria-expanded state carries the meaning */}
        <span aria-hidden="true" className="text-xs text-mist-dim">
          ▾
        </span>
      </button>
      {isOpen ? (
        <>
          {/* Click-away layer (same pattern as Modal's overlay) */}
          <div
            role="presentation"
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          {/* Menu panel = a ridge surface step above the steel bar with a
              white/10 hairline, 8px radius — elevation by color, no shadow */}
          <div
            role="menu"
            aria-label={label}
            className="absolute top-full right-0 z-20 mt-2 w-48 rounded-lg border border-white/10 bg-ridge p-1.5"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-mist transition-colors duration-200 hover:bg-steel hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              {t('nav.signOut')}
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
