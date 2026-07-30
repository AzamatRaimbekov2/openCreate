// apps/web/src/modules/Creator/components/CreatorChat.tsx
// The transcript column: the whole agent story, re-rendered from ONE GET. Every
// step the agent takes is a persisted message, so this component needs no local
// progress state and a reload loses nothing (ADR opencreator-agent D4).
//
// It owns two things the cards cannot own:
//   1. the poll (via useCreatorSession — 2s while the session is moving), and
//   2. the plan-gate decision (planStateFor needs the whole transcript, so a card
//      cannot compute whether its own confirm button is live).
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorState, Skeleton } from 'shared/ui'
import { useConfirmCreatorPlan, useCreatorSession } from '../model/api'
import { planStateFor } from '../model/planState'
import { MessageCard } from './MessageCard'

const SKELETON_KEYS = ['k1', 'k2', 'k3']

export type CreatorChatProps = {
  // The open conversation, or null on a fresh visit with nothing selected
  sessionId: string | null
}

export function CreatorChat({ sessionId }: CreatorChatProps) {
  const { t } = useTranslation()
  const session = useCreatorSession(sessionId)
  // The hook needs a string; with no session there is no plan card, so the
  // mutation is built but never fired (an empty id can never reach the network).
  const confirm = useConfirmCreatorPlan(sessionId ?? '')

  // Follow the conversation: a new message scrolls the column to the bottom. The
  // scroll CONTAINER is driven directly (scrollTop) rather than through
  // scrollIntoView — the latter is unimplemented in jsdom and would also drag the
  // whole page when the chat is not the scrolling element.
  const scrollRef = useRef<HTMLDivElement>(null)
  const messageCount = session.data?.messages.length ?? 0
  useEffect(() => {
    const column = scrollRef.current
    if (column) column.scrollTop = column.scrollHeight
  }, [messageCount])

  const body = (() => {
    if (sessionId === null) {
      return <Placeholder title={t('creator.pick.title')} description={t('creator.pick.description')} />
    }
    if (session.isPending) {
      return (
        <div className="flex flex-col gap-4">
          {SKELETON_KEYS.map((key) => (
            <Skeleton key={key} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      )
    }
    if (session.isError) {
      return <ErrorState message={t('creator.chatError')} onRetry={() => void session.refetch()} />
    }
    const { messages, status } = session.data
    // A session always opens WITH the user's first message, so an empty
    // transcript is a race between the 202 and the first poll — not a real empty
    // state. It still gets copy rather than a blank column (the 4-states law).
    if (messages.length === 0) {
      return <p className="text-sm text-mist-dim">{t('creator.noMessages')}</p>
    }
    return (
      <ul className="flex flex-col gap-4">
        {messages.map((message, index) => (
          <MessageCard
            key={message.id}
            message={message}
            // Only a plan card reads this; computing it for every message keeps
            // the card dumb and the rule in one tested place.
            planState={planStateFor(messages, index, status)}
            onConfirm={() => confirm.mutate()}
            isConfirming={confirm.isPending}
          />
        ))}
      </ul>
    )
  })()

  return (
    <section
      // Labelled «Диалог», not «openCreator»: the page heading already carries
      // the product name, and two regions with the same accessible name give a
      // screen-reader user no way to tell the rail from the transcript.
      aria-label={t('creator.transcript')}
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-1 py-2"
    >
      {body}
      {/* The live pulse: a turn is executing right now. Rendered OUTSIDE the
          message list because it is not a message — nothing was persisted for it,
          and it disappears the moment the next step lands. */}
      {session.data?.status === 'running' ? (
        <p role="status" className="mt-4 flex items-center gap-2 text-xs text-glow-amber">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-glow-amber motion-safe:animate-pulse"
          />
          {t('creator.working')}
        </p>
      ) : null}
    </section>
  )
}

// The "nothing selected" state. Not shared/ui's EmptyState: that one centers a
// card in a page canvas, and this is a column that also has to look right beside
// a full-height rail.
function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="text-lg text-white">{title}</p>
      <p className="max-w-md text-sm text-mist-dim">{description}</p>
    </div>
  )
}
