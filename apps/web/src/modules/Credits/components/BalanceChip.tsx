// apps/web/src/modules/Credits/components/BalanceChip.tsx
// Header credit-balance chip (bolt + 165). 4 UI states: skeleton while loading,
// compact retry icon-button on failure, hidden entirely when signed out
// (the shell shows "Sign in" instead), and the AMBER SPECIMEN PILL on data
// (stage 3 — amber = the triad's pricing/credits family, and the balance is a
// real control, so it wears the full pill anatomy like the shell's other
// pills) — clicking it opens the TransactionsList history modal.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiClientError } from 'shared/libs/apiClient'
import { Skeleton } from 'shared/ui'
import { useBalance } from '../model/creditsApi'
import { TransactionsList } from './TransactionsList'

export function BalanceChip() {
  const { t, i18n } = useTranslation()
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const { data, error, isPending, isError, refetch } = useBalance()

  // Loading: chip-shaped skeleton, no layout shift when the number arrives
  if (isPending) {
    return <Skeleton className="h-8 w-20 rounded-full" />
  }

  if (isError) {
    // Signed out (401) — the balance has no meaning; render nothing so the
    // surrounding shell can show its "Sign in" action instead
    if (error instanceof ApiClientError && error.code === 'unauthorized') {
      return null
    }
    // Compact retry icon-button — the chip must not blow up the header on failure
    return (
      <button
        type="button"
        onClick={() => void refetch()}
        aria-label={t('credits.reload')}
        className="flex size-8 items-center justify-center rounded-full text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-mist focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
      >
        <span aria-hidden="true">↻</span>
      </button>
    )
  }

  // Number-format LAW (design.md §13): a raw balance renders as "1000000000",
  // which is unreadable and blows out the chip width. Show a COMPACT numeral
  // ("1B" / "1 млрд" — locale-aware) and carry the EXACT grouped value in the
  // aria-label + title, so scanning is easy and the precise figure is one hover
  // (or one screen-reader pass) away. Compact leaves small counts untouched
  // (165 → "165"), so only the eye-watering numbers change.
  const compact = new Intl.NumberFormat(i18n.language, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(data.creditsBalance)
  const exact = new Intl.NumberFormat(i18n.language).format(data.creditsBalance)

  return (
    <>
      {/* The AMBER SPECIMEN PILL (stage 3): /20 amber tint + white/10 hairline
          + lumen-amber text + shadow-pill — the exact pill anatomy of the
          Button ghost variant, because the balance is a real control in the
          shell, not passive meta (the white/5 caption-chip look undersold
          that). Amber = the triad's pricing/credits family (design.md v3 §2);
          hover deepens the same tint one step, never leaves the color. */}
      <button
        type="button"
        onClick={() => setIsHistoryOpen(true)}
        aria-label={`${t('credits.balance')}: ${exact}`}
        title={exact}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/10 bg-specimen-amber/20 px-3 py-1 text-lumen-amber shadow-pill transition-colors duration-200 hover:bg-specimen-amber/35 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
      >
        {/* Decorative bolt — the aria-label already names the control.
            Inline SVG (currentColor) instead of the ⚡ emoji: OS emoji render
            in their own palette and can't be tinted, which would smuggle an
            off-system color into the shell (QA r1: the triad is closed).
            text-glow-amber = the reference's amber-pill icon accent (#f0b100
            icon on the lumen-amber pill text — §2 pill anatomy). */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          className="size-3.5 text-glow-amber"
        >
          <path d="M13 2 4.5 13.5H11L9.5 22 19.5 9.5H12.5L13 2Z" />
        </svg>
        {/* Mono numeral at the 500 weight ceiling — the same numeral voice as
            the price index, scaled for the 32px control. Compact notation keeps
            the chip a fixed, scannable width no matter how large the balance. */}
        <span className="text-sm leading-none font-medium tabular-nums">{compact}</span>
      </button>
      <TransactionsList isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
    </>
  )
}
