// apps/web/src/shared/ui/AppShell.tsx
// Application chrome for in-app screens (/create, /library, /pricing): header
// with wordmark, primary nav, credits balance slot, EN/RU switch and the
// account area. Deliberately PRESENTATIONAL — session state, sign-out and the
// BalanceChip are injected by the routes/_shell layout route, so shared/ui
// never imports from modules/* (architecture law: shared has no business logic).
// v3 terminal: the bar is a STICKY steel surface step over the void; nav is
// lowercase mono (active = white, inactive = dimmed mist); the wordmark's
// trailing dot is portal blue — the brand's cursor.
// v3.1 COMPACT BAR: chrome height dropped 64→44px (controls min-h-10→min-h-8,
// bar py-3→py-1.5, wordmark xl→base, labels sm→xs) — the editor screens
// (CinemaStudio timeline, Soul sheet) are vertical-space-hungry and the header
// is pure chrome, so every pixel it gives up goes straight to the canvas.
// BalanceChip mirrors the same 32px control scale (modules/Credits).
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

// Nav links are quiet lowercase mono labels (the terminal voice — v3 killed
// the v2 uppercase tracking). Color lives ONLY in active/inactiveProps so two
// text-* utilities never fight inside one className; the active state is plain
// white — presence, not a color accent (portal stays reserved for links/brand).
const navLinkClass =
  'inline-flex min-h-8 items-center rounded-full px-3 text-xs transition-colors duration-200 hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none'

export function AppShell({
  user,
  isSessionPending = false,
  onSignOut,
  balanceSlot,
  children,
}: AppShellProps) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col bg-void">
      {/* Sticky steel bar — one surface step above the void; elevation is the
          color step, so no border/shadow is needed to separate it while
          scrolling (reference: nav lives on #1d293d) */}
      <header className="sticky top-0 z-40 bg-steel">
        {/* Full-bleed bar: app chrome spans the viewport (tool UI, not a
            centered reading column) — the page canvas below matches its gutter */}
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-6 py-1.5 xl:px-10">
          {/* Mono wordmark "openCreate·" doubles as the home link. The trailing
              middle dot is the brand's cursor — portal blue and aria-hidden so
              the accessible name stays "openCreate". */}
          <Link
            to="/"
            className="rounded-lg text-base font-medium text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            openCreate
            <span aria-hidden="true" className="text-portal">
              ·
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              to="/create"
              className={navLinkClass}
              activeProps={{ className: 'text-white' }}
              inactiveProps={{ className: 'text-mist-dim' }}
            >
              {t('nav.create')}
            </Link>
            <Link
              to="/library"
              className={navLinkClass}
              activeProps={{ className: 'text-white' }}
              inactiveProps={{ className: 'text-mist-dim' }}
            >
              {t('nav.library')}
            </Link>
            <Link
              to="/cinema"
              className={navLinkClass}
              activeProps={{ className: 'text-white' }}
              inactiveProps={{ className: 'text-mist-dim' }}
            >
              {t('nav.cinema')}
            </Link>
            {/* Next to Cinema, not next to Create: a template IS a film — it lands
                you in the film editor — and the adjacency is the hint. */}
            <Link
              to="/templates"
              className={navLinkClass}
              activeProps={{ className: 'text-white' }}
              inactiveProps={{ className: 'text-mist-dim' }}
            >
              {t('nav.templates')}
            </Link>
            {/* Soul Studio owns CHARACTERS (built from the constructor); /entities
                stays the generic library of objects, places and plain uploads. The
                adjacency is the hint that one is a specialization of the other. */}
            <Link
              to="/soul"
              className={navLinkClass}
              activeProps={{ className: 'text-white' }}
              inactiveProps={{ className: 'text-mist-dim' }}
            >
              {t('nav.soul')}
            </Link>
            <Link
              to="/entities"
              className={navLinkClass}
              activeProps={{ className: 'text-white' }}
              inactiveProps={{ className: 'text-mist-dim' }}
            >
              {t('nav.entities')}
            </Link>
            <Link
              to="/pricing"
              className={navLinkClass}
              activeProps={{ className: 'text-white' }}
              inactiveProps={{ className: 'text-mist-dim' }}
            >
              {t('nav.pricing')}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {balanceSlot}
            <LangSwitch />
            <AccountArea user={user} isSessionPending={isSessionPending} onSignOut={onSignOut} />
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
