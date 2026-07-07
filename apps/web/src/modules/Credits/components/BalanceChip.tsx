// apps/web/src/modules/Credits/components/BalanceChip.tsx
// Header credit-balance chip (⚡ 165). 4 UI states: skeleton while loading,
// compact retry icon-button on failure, hidden entirely when signed out
// (the shell shows "Sign in" instead), and the vermillion stamp chip on data — clicking
// it opens the TransactionsList history modal.
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

  // Loading: stamp-shaped skeleton, no layout shift when the number arrives
  if (isPending) {
    return <Skeleton className="h-10 w-20 rounded-[3px]" />
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
        className="flex size-10 items-center justify-center rounded-full text-ink-soft transition-opacity duration-150 hover:bg-sand focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
      >
        <span aria-hidden="true">↻</span>
      </button>
    )
  }

  return (
    <>
      {/* Stamp-style chip (brief: "balance chip as stamp-style badge,
          vermillion outline") — the Badge treatment scaled to a 40px control:
          hairline vermillion outline, stamp corners, serif numeral. The
          vermillion lettering is a recorded §2/§8 exception (stamp badges). */}
      <button
        type="button"
        onClick={() => setIsHistoryOpen(true)}
        aria-label={t('credits.balance')}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-[3px] border border-vermillion/70 px-3 py-2 text-vermillion transition-colors duration-200 hover:border-vermillion hover:bg-vermillion/5 focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
      >
        {/* Decorative bolt — the aria-label already names the control */}
        <span aria-hidden="true" className="text-xs">
          ⚡
        </span>
        {/* Serif display numeral — the same numeral voice as the price index */}
        <span className="font-display text-base leading-none font-semibold tracking-tight">
          {data.creditsBalance}
        </span>
      </button>
      <TransactionsList isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
    </>
  )
}
