// apps/web/src/shared/ui/AppShell.tsx
// Application chrome for in-app screens (/create, /library, /pricing): header
// with wordmark, primary nav, credits balance slot, EN/RU switch and the
// account area. Deliberately PRESENTATIONAL — session state, sign-out and the
// BalanceChip are injected by the routes/_shell layout route, so shared/ui
// never imports from modules/* (architecture law: shared has no business logic).
import { useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { LangSwitch } from './LangSwitch'
import { Skeleton } from './Skeleton'

export type AppShellUser = {
  // Display name for the menu trigger; null falls back to the email
  name: string | null
  // Account email — always present on a signed-in account
  email: string
}

export type AppShellProps = {
  // Signed-in account, or null when signed out (the shell shows Sign in)
  user: AppShellUser | null
  // True while the session is still resolving — shows a placeholder instead
  // of flashing "Sign in" at a signed-in user
  isSessionPending?: boolean
  // Sign-out action (modules/Auth), injected by the layout route
  onSignOut: () => void
  // Credits balance chip (modules/Credits), injected by the layout route
  balanceSlot?: ReactNode
  // The screen content rendered under the header
  children: ReactNode
}

// Nav link styling: color lives ONLY in active/inactiveProps so the two
// text-* utilities never fight inside one className
const navLinkClass =
  'inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-medium transition-opacity duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none'

export function AppShell({
  user,
  isSessionPending = false,
  onSignOut,
  balanceSlot,
  children,
}: AppShellProps) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-ink/10">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
          {/* Wordmark doubles as the home link */}
          <Link
            to="/"
            className="rounded-xl text-lg font-semibold tracking-tight text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            openCreate
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              to="/create"
              className={navLinkClass}
              activeProps={{ className: 'text-accent' }}
              inactiveProps={{ className: 'text-ink-soft' }}
            >
              {t('nav.create')}
            </Link>
            <Link
              to="/library"
              className={navLinkClass}
              activeProps={{ className: 'text-accent' }}
              inactiveProps={{ className: 'text-ink-soft' }}
            >
              {t('nav.library')}
            </Link>
            <Link
              to="/pricing"
              className={navLinkClass}
              activeProps={{ className: 'text-accent' }}
              inactiveProps={{ className: 'text-ink-soft' }}
            >
              {t('nav.pricing')}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {balanceSlot}
            <LangSwitch />
            <AccountArea
              user={user}
              isSessionPending={isSessionPending}
              onSignOut={onSignOut}
            />
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  )
}

type AccountAreaProps = {
  // See AppShellProps — same three account-related inputs
  user: AppShellUser | null
  isSessionPending: boolean
  onSignOut: () => void
}

// Right-most header slot: skeleton while the session resolves, Sign in link
// when signed out, the user menu when signed in — never a blank spot
function AccountArea({ user, isSessionPending, onSignOut }: AccountAreaProps) {
  const { t } = useTranslation()

  if (isSessionPending) {
    return <Skeleton className="h-10 w-24 rounded-xl" />
  }

  if (!user) {
    // Link styled as the primary action — mirrors Button primary/md classes
    return (
      <Link
        to="/login"
        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        {t('nav.signIn')}
      </Link>
    )
  }

  return <UserMenu user={user} onSignOut={onSignOut} />
}

type UserMenuProps = {
  // Signed-in account shown on the trigger
  user: AppShellUser
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
        className="inline-flex min-h-10 max-w-48 items-center gap-1 truncate rounded-xl px-3 py-2 text-sm font-medium text-ink transition-opacity duration-150 hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <span className="truncate">{label}</span>
        {/* Decorative chevron — the aria-expanded state carries the meaning */}
        <span aria-hidden="true" className="text-xs text-ink-soft">
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
          <div
            role="menu"
            aria-label={label}
            className="absolute top-full right-0 z-20 mt-2 w-48 rounded-2xl border border-ink/10 bg-white p-2 shadow-xl"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="flex min-h-10 w-full items-center rounded-xl px-3 py-2 text-sm font-medium text-ink transition-opacity duration-150 hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              {t('nav.signOut')}
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
