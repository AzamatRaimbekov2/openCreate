// apps/web/src/modules/Soul/components/SoulComposer.tsx
// The studio's bottom COMPOSER DOCK body — the ONE create action on the screen,
// mirroring the Cinema editor's fixed dock (type below, result above). It holds
// the character's NAME, a SHUFFLE dice that randomizes the whole look, and the
// single green "Create character" pill with the "creating is free" caption.
//
// A floating-glass capsule (GLASS_FLOATING — the design-system recipe for chrome
// that hovers OVER scrolling content), so it separates from the workbench beneath
// without a bespoke shadow. SoulStudio pins it to the viewport bottom via a
// position:fixed wrapper; this component is just the capsule and owns no layout
// of its own. It is CONTROLLED: the studio owns the draft, so the name field and
// every button here only report intent upward.
import { useTranslation } from 'react-i18next'
import { Button, GLASS_FLOATING } from 'shared/ui'

export type SoulComposerProps = {
  // The character's display name (owned by the studio draft)
  name: string
  onNameChange: (name: string) => void
  // Randomize the whole draft (SoulStudio keeps the typed name around the roll)
  onShuffle: () => void
  // Fire the free create mutation
  onCreate: () => void
  // Spinner + double-submit guard while the create request is in flight
  isCreating: boolean
  // The create gate (isDraftReady) — false disables the pill
  canCreate: boolean
  // Already-localized failure copy, rendered as a calm inline alert; null = none
  error: string | null
}

// The shuffle dice as a compact tool chip — same anatomy as the Cinema dock's
// icon toggles (size-8 pill, hairline border, ridge hover).
const TOOL =
  'grid size-10 shrink-0 place-items-center rounded-full border border-white/10 text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none'

export function SoulComposer({
  name,
  onNameChange,
  onShuffle,
  onCreate,
  isCreating,
  canCreate,
  error,
}: SoulComposerProps) {
  const { t } = useTranslation()

  return (
    <section
      aria-label={t('soul.composer.title')}
      className={`${GLASS_FLOATING} flex w-full flex-col gap-2 rounded-2xl border p-2.5`}
    >
      {error ? (
        // Calm inline failure: a steel block with the glow-red status rule (the
        // design law keeps red for the STATUS, never for the whole surface)
        <p
          role="alert"
          className="rounded-lg border-l-2 border-glow-red bg-steel px-3 py-2 text-sm text-mist"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        {/* A translucent glass field on the capsule (white/5 wash, portal focus —
            the composer-capsule field voice). aria-label carries the accessible
            name in this dense dock, the same choice the Cinema prompt makes. */}
        <input
          type="text"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label={t('soul.constructor.name')}
          placeholder={t('soul.constructor.namePlaceholder')}
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-base text-white transition-colors duration-200 placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none"
        />

        <button type="button" aria-label={t('soul.composer.shuffle')} onClick={onShuffle} className={TOOL}>
          <ShuffleIcon />
        </button>

        {/* The single green create action; disabled until the draft is nameable */}
        <Button onClick={onCreate} isLoading={isCreating} disabled={!canCreate}>
          {t('soul.constructor.submit')}
        </Button>
      </div>

      {/* Creating a character costs NOTHING — say so, right by the button, because
          everything else in this app charges credits and the user expects it */}
      <p className="px-1 text-xs text-mist-dim">{t('soul.constructor.free')}</p>
    </section>
  )
}

// Decorative shuffle glyph (currentColor SVG — never an OS emoji, per the design
// law): two paths crossing with arrowheads, the universal "randomize" mark.
function ShuffleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" />
      <path d="m18 2 4 4-4 4" />
      <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" />
      <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" />
      <path d="m18 14 4 4-4 4" />
    </svg>
  )
}
