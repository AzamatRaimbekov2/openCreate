// apps/web/src/modules/Creator/components/SessionList.tsx
// The left rail: every conversation the user has had with the agent, newest
// first, with a live state word on the ones that are still moving. The
// CinemaLibrary/CanvasLibrary pattern (all four UI states owned here, the page
// canvas owned by the route) — but rendered as BUTTONS, not links: a session is
// not a URL in this screen (the route keeps one `/creator` address and swaps the
// active transcript), so a link would promise a destination that does not exist.
import { useTranslation } from 'react-i18next'
import type { CreatorSession } from '@opencreate/contracts'
import { Badge, Button, EmptyState, ErrorState, Skeleton } from 'shared/ui'
import { useCreatorSessions } from '../model/api'

// Static keys for the fixed skeleton column — index keys are banned even here
const SKELETON_KEYS = ['s1', 's2', 's3', 's4']

export type SessionListProps = {
  // The conversation currently open, or null on a fresh visit
  activeSessionId: string | null
  // Open a conversation
  onSelect: (sessionId: string) => void
  // Start a new one (the route clears the selection; the first message creates it)
  onNew: () => void
}

export function SessionList({ activeSessionId, onSelect, onNew }: SessionListProps) {
  const { t, i18n } = useTranslation()
  const { data, isPending, isError, refetch } = useCreatorSessions()

  const header = (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-normal text-mist-dim">{t('creator.rail')}</h2>
      <Button size="sm" onClick={onNew}>
        {t('creator.new')}
      </Button>
    </div>
  )

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div className="flex flex-col gap-2">
          {SKELETON_KEYS.map((key) => (
            <Skeleton key={key} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ErrorState message={t('creator.listError')} onRetry={() => void refetch()} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {header}
      {data.items.length === 0 ? (
        <EmptyState
          title={t('creator.empty.title')}
          description={t('creator.empty.description')}
          action={
            <Button size="sm" onClick={onNew}>
              {t('creator.new')}
            </Button>
          }
        />
      ) : (
        // Array order is the server's (updated_at DESC) — never re-sorted here.
        <ul className="flex flex-col gap-1.5">
          {data.items.map((item) => (
            <li key={item.id}>
              <SessionRow
                session={item}
                isActive={item.id === activeSessionId}
                language={i18n.language}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// A row: the title the agent gave the task, its date, and — only when there is
// news — a state word. `idle` prints nothing on purpose: "ready" on every row of
// a long rail is noise that hides the two rows that actually need attention.
const STATE_BADGE: Partial<
  Record<CreatorSession['status'], { key: string; variant: 'accent' | 'danger' }>
> = {
  running: { key: 'creator.status.running', variant: 'accent' },
  awaiting_confirm: { key: 'creator.status.awaiting_confirm', variant: 'accent' },
  failed: { key: 'creator.status.failed', variant: 'danger' },
}

function SessionRow({
  session,
  isActive,
  language,
  onSelect,
}: {
  session: CreatorSession
  isActive: boolean
  language: string
  onSelect: (sessionId: string) => void
}) {
  const { t } = useTranslation()
  const badge = STATE_BADGE[session.status]

  return (
    <button
      type="button"
      onClick={() => onSelect(session.id)}
      // aria-current is how a screen reader learns which conversation is open —
      // the ridge fill alone says it only to people who can see it.
      {...(isActive ? { 'aria-current': 'true' as const } : {})}
      className={`flex w-full flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${
        isActive ? 'border-white/15 bg-ridge' : 'border-transparent hover:bg-steel'
      }`}
    >
      <span className={`w-full truncate text-sm ${isActive ? 'text-white' : 'text-mist'}`}>
        {session.title}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-xs text-mist-dim">
          {new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(
            new Date(session.updatedAt),
          )}
        </span>
        {badge ? <Badge variant={badge.variant}>{t(badge.key)}</Badge> : null}
      </span>
    </button>
  )
}
