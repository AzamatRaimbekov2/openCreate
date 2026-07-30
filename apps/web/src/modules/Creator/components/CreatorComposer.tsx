// apps/web/src/modules/Creator/components/CreatorComposer.tsx
// The creator chat's input: one glass capsule with a growing textarea, the
// mandatory enhance sparkle, and a send pill. Posture borrowed from the /create
// ChatComposer (the app already has one chat input; a second silhouette would
// read as a different product) minus everything model-specific — the agent picks
// its own models, so there is no model/aspect/duration rail here.
//
// THE DRAFT LIVES HERE, not in a Zustand store: nothing outside this component
// reads it (the enhance sparkle is a child), and a store for one string with a
// single consumer is indirection with no payer. Unmounting on a session switch
// clearing the draft is the correct behaviour, not a bug — a draft belongs to the
// conversation it was typed into.
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { CreatorSessionStatus } from '@opencreate/contracts'
import { Button, EnhanceButton, GLASS_FLOATING } from 'shared/ui'

// The contract's floor (createCreatorSessionInputSchema: min 2) — enforced here
// so the button is honest rather than letting the API refuse the click.
const MIN_MESSAGE_LENGTH = 2

export type CreatorComposerProps = {
  // Sends the draft. Returns the mutation's promise: the draft is cleared only
  // when it RESOLVES, so a failed send never eats what the user typed.
  onSend: (message: string) => Promise<void>
  // True while a send is in flight (the pill spins, a second Enter is a no-op)
  isSending: boolean
  // The session's status, or null for a chat that does not exist yet (always
  // sendable). `running` and `awaiting_confirm` close the input — the API would
  // answer 409, and an input that looks live but cannot post is a lie.
  sessionStatus: CreatorSessionStatus | null
}

export function CreatorComposer({ onSend, isSending, sessionStatus }: CreatorComposerProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')

  const isGated = sessionStatus === 'awaiting_confirm'
  const isBusy = sessionStatus === 'running'
  // `failed` stays OPEN on purpose: asking again IS the retry, and a dead-end
  // screen after a provider hiccup would strand the conversation.
  const isClosed = isBusy || isGated
  const canSend = draft.trim().length >= MIN_MESSAGE_LENGTH && !isSending && !isClosed

  const handleSend = () => {
    if (!canSend) return
    const message = draft.trim()
    // Clear only on success. `catch` swallows here because the failure is already
    // reported by the caller's mutation state (inline copy / toast) — an unhandled
    // rejection would additionally crash the boundary for no extra information.
    void onSend(message)
      .then(() => setDraft(''))
      .catch(() => {})
  }

  // The chat contract: Enter sends, Shift+Enter breaks the line. Without it a box
  // that looks like a chat behaves like a form, which is the single most jarring
  // thing a chat-shaped input can do.
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    handleSend()
  }

  return (
    <section
      aria-label={t('creator.composer.label')}
      className={`w-full rounded-[1.75rem] border px-4 py-3 ${GLASS_FLOATING}`}
    >
      {/* A closed input always explains itself: "the agent is working" vs
          "confirm the budget above" are different next actions, and a bare
          greyed box tells the user neither. */}
      {isClosed ? (
        <p role="status" className="mb-2 px-2 text-xs text-mist-dim">
          {t(isGated ? 'creator.composer.gate' : 'creator.composer.waiting')}
        </p>
      ) : null}

      <div className="flex items-end gap-2">
        {/* The field is its OWN relative box so the sparkle sits inside the text
            area rather than at some guessed offset from the send pill. The
            absolute positioning lives on a WRAPPER div and never on
            EnhanceButton's className: that class lands on the component's own
            `relative` box, Tailwind resolves competing position utilities by
            stylesheet order rather than class order, and that box is the anchor
            its error/nudge chip (`absolute bottom-full`) hangs from — the
            ShotInspector precedent and the ImageNode.tsx.md gotcha. */}
        <div className="relative flex-1">
          <textarea
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isClosed}
            aria-label={t('creator.composer.label')}
            placeholder={t('creator.composer.placeholder')}
            // pr-10 keeps the text from sliding under the sparkle.
            className="max-h-40 min-h-11 w-full resize-none border-0 bg-transparent px-2 py-2.5 pr-10 text-base text-mist placeholder:text-mist-dim/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="absolute right-1 bottom-1.5">
            <EnhanceButton value={draft} onEnhanced={setDraft} />
          </div>
        </div>
        <Button onClick={handleSend} disabled={!canSend} isLoading={isSending}>
          {t('creator.composer.send')}
        </Button>
      </div>
    </section>
  )
}
