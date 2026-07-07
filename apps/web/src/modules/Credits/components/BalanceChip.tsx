// apps/web/src/modules/Credits/components/BalanceChip.tsx
// Header credit-balance chip (bolt + 165). 4 UI states: skeleton while loading,
// compact retry icon-button on failure, hidden entirely when signed out
// (the shell shows "Sign in" instead), and the glow-amber caption chip on data
// (amber = the triad's pricing/credits family) — clicking it opens the
// TransactionsList history modal.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiClientError } from 'shared/libs/apiClient'
import { Skeleton } from 'shared/ui'
import { useBalance } from '../model/creditsApi'
import { TransactionsList } from './TransactionsList'

export function BalanceChip() {
  const { t } = useTranslation()
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const { data, error, isPending, isError, refetch } = useBalance()

  // Loading: chip-shaped skeleton, no layout shift when the number arrives
  if (isPending) {
    return <Skeleton className="h-10 w-20 rounded-full" />
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
        className="flex size-10 items-center justify-center rounded-full text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-mist focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
      >
        <span aria-hidden="true">↻</span>
      </button>
    )
  }

  return (
    <>
      {/* Mono caption chip (the Badge voice scaled to a 40px control):
          white/10 hairline pill, glow-amber lettering — amber is the triad's
          pricing/credits family (design.md v3 §2), and the small glow text is
          safe on the steel bar (contrast table §2). */}
      <button
        type="button"
        onClick={() => setIsHistoryOpen(true)}
        aria-label={t('credits.balance')}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-glow-amber transition-colors duration-200 hover:bg-ridge focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
      >
        {/* Decorative bolt — the aria-label already names the control.
            Inline SVG (currentColor) instead of the ⚡ emoji: OS emoji render
            in their own palette and can't be tinted, which would smuggle an
            off-system color into the shell (QA r1: the triad is closed).
            Outline stroke matches the chip's hairline aesthetic. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          className="size-3.5"
        >
          <path d="M13 2 4.5 13.5H11L9.5 22 19.5 9.5H12.5L13 2Z" />
        </svg>
        {/* Mono numeral at the 500 weight ceiling — the same numeral voice as
            the price index, scaled for the 40px control */}
        <span className="text-base leading-none font-medium">{data.creditsBalance}</span>
      </button>
      <TransactionsList isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
    </>
  )
}
