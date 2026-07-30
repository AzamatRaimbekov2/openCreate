// apps/web/src/modules/Creator/components/CreatorWorkbench.tsx
// The /creator screen: the conversation rail, the open transcript, and the
// composer docked beneath it. It exists as a MODULE component rather than living
// in the route file because it holds two real decisions — which conversation is
// open, and whether a message opens a session or continues one — and routes in
// this app are composition only (architecture law).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateCreatorSession, useCreatorSession, useCreatorSessions, usePostCreatorMessage } from '../model/api'
import { CreatorChat } from './CreatorChat'
import { CreatorComposer } from './CreatorComposer'
import { SessionList } from './SessionList'

// Which conversation the column shows. Three cases rather than a bare
// `string | null`, because "nothing chosen yet" and "deliberately starting a new
// task" must behave differently: the first resolves to the newest conversation,
// the second must NOT (a `null` that auto-resolves would bounce the user straight
// back out of the fresh draft they just asked for).
type Selection =
  // Arrival: no choice made, so open whatever is newest.
  | { kind: 'auto' }
  // An explicit pick from the rail, or the session a first message just created.
  | { kind: 'session'; id: string }
  // «New task»: an empty column waiting for the first message.
  | { kind: 'new' }

export function CreatorWorkbench() {
  const { t } = useTranslation()
  const [selection, setSelection] = useState<Selection>({ kind: 'auto' })
  // Same ['creator-sessions'] cache entry the rail reads — one request, and the
  // newest-first order is the server's.
  const sessions = useCreatorSessions()
  const create = useCreateCreatorSession()

  // DERIVED in render, never synced through an effect: an effect that "selected
  // the first session" would fight the user's own click for one frame and is
  // exactly the derived-state-in-useEffect the standard forbids.
  const activeSessionId =
    selection.kind === 'session'
      ? selection.id
      : selection.kind === 'new'
        ? null
        : (sessions.data?.items[0]?.id ?? null)

  // The composer needs the live status to know whether it may post at all. This
  // is the SAME query the chat polls (one cache entry, one 2s poll).
  const active = useCreatorSession(activeSessionId)
  const post = usePostCreatorMessage(activeSessionId ?? '')

  // The first message opens the conversation; every later one continues it. The
  // promise is handed back to the composer, which clears its draft only when the
  // send actually lands.
  const handleSend = async (message: string) => {
    if (activeSessionId === null) {
      const created = await create.mutateAsync(message)
      setSelection({ kind: 'session', id: created.id })
      return
    }
    await post.mutateAsync(message)
  }

  return (
    <div className="flex h-full min-h-0 gap-6">
      {/* The rail is a sunken column on the left, its own scroller so a long
          history never pushes the chat down. Hidden below lg: on a phone the
          conversation is the screen, and a 15-row rail beside it is not. */}
      <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-white/10 pr-4 lg:flex">
        <SessionList
          activeSessionId={activeSessionId}
          onSelect={(id) => setSelection({ kind: 'session', id })}
          onNew={() => setSelection({ kind: 'new' })}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-normal text-white">{t('creator.title')}</h1>
          <p className="max-w-2xl text-xs text-mist-dim">{t('creator.lead')}</p>
        </header>
        <CreatorChat sessionId={activeSessionId} />
        <CreatorComposer
          onSend={handleSend}
          isSending={create.isPending || post.isPending}
          // No session yet → always sendable. Otherwise the server's status
          // decides (running / awaiting_confirm close the input).
          sessionStatus={activeSessionId === null ? null : (active.data?.status ?? null)}
        />
      </div>
    </div>
  )
}
