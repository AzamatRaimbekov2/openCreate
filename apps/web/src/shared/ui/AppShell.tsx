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
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AccountMenu } from './AccountMenu'
import type { AccountUser } from './AccountMenu'
import { LangSwitch } from './LangSwitch'

// The signed-in account shape. Defined in AccountMenu (the account slot is now a
// shared piece — see AccountMenu.tsx) and re-exported here so existing importers
// of `AppShellUser` are untouched.
export type AppShellUser = AccountUser

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
            {/* openCreator sits beside Create because they answer the same
                question from opposite ends: /create is the manual pen, /creator
                is the agent you hand the whole task to. The adjacency is the
                hint that one is the autonomous form of the other. */}
            <Link
              to="/creator"
              className={navLinkClass}
              activeProps={{ className: 'text-white' }}
              inactiveProps={{ className: 'text-mist-dim' }}
            >
              {t('nav.creator')}
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
            {/* Canvas sits beside Cinema for the same reason: a board you enter
                from a library and keep working in, not a one-shot generation. */}
            <Link
              to="/canvas"
              className={navLinkClass}
              activeProps={{ className: 'text-white' }}
              inactiveProps={{ className: 'text-mist-dim' }}
            >
              {t('nav.canvas')}
            </Link>
            {/* Modular 3D assets sit beside Cinema: both are multi-step workbenches
                you enter from a library, not one-shot generations. */}
            <Link
              to="/assets"
              className={navLinkClass}
              activeProps={{ className: 'text-white' }}
              inactiveProps={{ className: 'text-mist-dim' }}
            >
              {t('nav.assets')}
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
            {/* Styles sits with the two libraries, not with Create: a style is a
                reusable thing you build once and then PICK everywhere, exactly
                like a character or an entity — and after the registry migration
                the styles a user writes here appear in every style picker. */}
            <Link
              to="/styles"
              className={navLinkClass}
              activeProps={{ className: 'text-white' }}
              inactiveProps={{ className: 'text-mist-dim' }}
            >
              {t('nav.styles')}
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
            {/* The account slot moved to shared/ui/AccountMenu so the CinemaStudio
                editor's own top bar can render the identical affordance without
                importing it across modules — see AccountMenu.tsx. */}
            <AccountMenu user={user} isSessionPending={isSessionPending} onSignOut={onSignOut} />
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  )
}
