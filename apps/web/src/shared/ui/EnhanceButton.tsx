// apps/web/src/shared/ui/EnhanceButton.tsx
// The prompt-enhancer affordance: a quiet sparkle icon that lives INSIDE a prompt
// field and turns a rough draft into one detailed cinematic prompt in a click.
// One shared component so the /create composer and the Cinema shot prompt cannot
// drift — each surface only hands it the current text + a setter (it never reaches
// into a module store), so there is nothing to duplicate and no cross-module import.
//
// Three behaviours ride on the same icon:
//   1. ENHANCE + UNDO — a click posts the raw text and REPLACES the field with the
//      result, then offers a one-click "Undo" that restores the exact original. The
//      draft is never lost: `undo` remembers the pre-enhance text, and the affordance
//      only shows while the enhanced result is still what is in the field (a manual
//      edit or an undo makes `enhanced !== value`, so it quietly retires).
//   2. ERROR — a failure is never a dead click: a calm amber `role="status"` chip
//      floats above the icon (provider_error 502 → "unavailable", rate_limited 429,
//      else generic). Amber, not red: nothing the user did is wrong — the key-gated
//      backend is simply off (the storyboard-not-configured precedent).
//   3. NUDGE — an occasional, gentle hint: after a short/rough prompt sits idle a few
//      seconds it offers "enhance this in one click", AT MOST ONCE PER SESSION (a
//      shared Zustand flag), never after dismiss, motion only when allowed, and it
//      never steals focus.
import { useEffect, useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiClientError } from 'shared/libs/apiClient'
import { useEnhanceNudge, useEnhancePrompt } from 'shared/model'

// Below this trimmed length there is nothing worth a round-trip (a whitespace or
// one-character draft). Matches the app's 2-char prompt floor (selectCreateInput).
export const MIN_ENHANCE_LENGTH = 2
// The nudge only helps a SHORT, rough prompt — a long detailed one needs no hint.
const ENHANCE_NUDGE_MAX_LENGTH = 48
// How long the prompt must sit unchanged before the hint appears ("при простое").
export const ENHANCE_NUDGE_IDLE_MS = 3500

export type EnhanceButtonProps = {
  // The current prompt text (controlled by the surface).
  value: string
  // Replace the field text — called with the enhanced prompt on success, and with
  // the original draft on undo. The surface owns where the text actually lives.
  onEnhanced: (next: string) => void
  // Layout only (positioning inside the field); never surface styling.
  className?: string
}

// Machine error code → localized copy key. `unknown` in, because the mutation's
// error type is domain-agnostic; only ApiClientError carries a code to branch on.
function enhanceErrorKey(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'provider_error') return 'enhance.error.unavailable'
    if (error.code === 'rate_limited') return 'enhance.error.rateLimited'
  }
  return 'enhance.error.generic'
}

// Icon-toggle anatomy shared with the Cinema toolbar (TOOL_OFF): a quiet hairline
// chip that lifts one surface step on hover. size-8 = the dense in-field chrome scale.
const ICON_BTN =
  'grid size-8 shrink-0 place-items-center rounded-full border border-white/10 text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40'

// A quiet neutral chip for Undo — deliberately NOT a specimen pill: undo is a
// secondary escape hatch, not a create/explore/destroy action from the triad.
const UNDO_BTN =
  'shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none'

// Floating chip above the icon (error + nudge): an OPAQUE ridge popup with a
// hairline and no shadow — the menu-panel material (design.md §2/§3.5), never
// translucent glass over a moving field. The enter is pure CSS via @starting-style
// (Tailwind `starting:`), gated by `motion-safe:` so reduced-motion gets no motion.
const FLOATING =
  'absolute bottom-full right-0 z-20 mb-2 w-max max-w-[15rem] rounded-lg border border-white/10 bg-ridge px-3 py-2 text-xs motion-safe:transition motion-safe:duration-200 starting:translate-y-1 starting:opacity-0'

export function EnhanceButton({ value, onEnhanced, className = '' }: EnhanceButtonProps) {
  const { t } = useTranslation()
  const mutation = useEnhancePrompt()
  const { dismissed, dismiss } = useEnhanceNudge()
  const nudgeId = useId()

  // The pre-enhance draft + the exact result it produced. Undo shows only while
  // that result is still in the field — deriving it (never syncing state in render)
  // means a manual edit or an undo retires the affordance with no effect.
  const [undo, setUndo] = useState<{ original: string; enhanced: string } | null>(null)
  const [showNudge, setShowNudge] = useState(false)

  const trimmedLength = value.trim().length
  const canEnhance = trimmedLength >= MIN_ENHANCE_LENGTH && !mutation.isPending
  const canUndo = undo !== null && undo.enhanced === value
  const errorKey = mutation.isError ? enhanceErrorKey(mutation.error) : null

  // Idle detection: arm a timer whenever a short/rough prompt sits unchanged; any
  // keystroke re-mounts the effect and restarts it (a real pause is required).
  // Showing the hint also spends the session flag, so it can appear at most once.
  useEffect(() => {
    if (dismissed) return
    if (trimmedLength < MIN_ENHANCE_LENGTH || trimmedLength > ENHANCE_NUDGE_MAX_LENGTH) return
    const timer = setTimeout(() => {
      setShowNudge(true)
      dismiss()
    }, ENHANCE_NUDGE_IDLE_MS)
    return () => clearTimeout(timer)
  }, [value, trimmedLength, dismissed, dismiss])

  const handleEnhance = () => {
    if (trimmedLength < MIN_ENHANCE_LENGTH || mutation.isPending) return
    // Interacting with the icon retires the hint for good this session.
    setShowNudge(false)
    if (!dismissed) dismiss()
    const original = value
    mutation.mutate(value, {
      onSuccess: (result) => {
        onEnhanced(result.prompt)
        setUndo({ original, enhanced: result.prompt })
      },
    })
  }

  const handleUndo = () => {
    if (!undo) return
    onEnhanced(undo.original)
    setUndo(null)
  }

  // Keyboard-dismissable: Escape anywhere in the cluster closes the hint without
  // moving focus (the icon/close stay where they were).
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && showNudge) setShowNudge(false)
  }

  return (
    <div
      className={`relative inline-flex items-center gap-1.5 ${className}`}
      onKeyDown={handleKeyDown}
    >
      {canUndo ? (
        <button type="button" onClick={handleUndo} className={UNDO_BTN}>
          {t('enhance.undo')}
        </button>
      ) : null}

      <button
        type="button"
        onClick={handleEnhance}
        disabled={!canEnhance}
        aria-busy={mutation.isPending || undefined}
        aria-label={t('enhance.button')}
        // Associate the hint with the control for screen readers while it shows.
        aria-describedby={showNudge ? nudgeId : undefined}
        className={ICON_BTN}
      >
        {mutation.isPending ? <Spinner /> : <SparkleIcon />}
      </button>

      {errorKey ? (
        <p role="status" className={`${FLOATING} text-glow-amber`}>
          {t(errorKey)}
        </p>
      ) : null}

      {showNudge ? (
        <div role="tooltip" id={nudgeId} className={`${FLOATING} flex items-start gap-2`}>
          <span className="text-mist">{t('enhance.nudge')}</span>
          <button
            type="button"
            aria-label={t('enhance.nudgeDismiss')}
            onClick={() => setShowNudge(false)}
            className="grid size-4 shrink-0 place-items-center rounded-full text-mist-dim transition-colors duration-200 hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

// The AI-enhance glyph: a four-point sparkle + a small companion, drawn on the
// same 24-grid / 1.5-stroke / currentColor language as the Cinema icon set — never
// an OS emoji (it would paint its own palette and break the closed icon language).
function SparkleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
      <path d="M18 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  )
}

// Inline spinner mirroring Button's — decorative (aria-hidden); the icon itself
// carries aria-busy. Same size-4 box as the sparkle, so the swap causes no shift.
function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
