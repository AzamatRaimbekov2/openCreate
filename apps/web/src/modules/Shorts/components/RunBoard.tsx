// apps/web/src/modules/Shorts/components/RunBoard.tsx
// What the batch is doing, per short and per beat.
//
// IT HAS NO STATE OF ITS OWN, and that is the feature. ADR shorts-studio §2
// declined a batch table, job rows and a status machine on the grounds that
// `shot.generation_id` already answers "does this clip exist?" — so this board
// renders a DERIVATION (boardStatus.ts) over two things it does not own: the
// films, and the shared ['generation', id] cache every poller in the app writes.
// The consequence is the one the ADR wanted: a reload rebuilds the whole board,
// because it was never in memory to begin with.
//
// THE TWO SUBSCRIPTIONS, and why there are two. A chip OWNS the polling for its
// own clip (`useShotGeneration`, 4s while processing, stops at terminal); the
// film header READS every clip at once for its progress line
// (`useShotGenerations`, no interval). That is Cinema's own split — ShotThumb
// polls, PreviewPlayer reads — and it works because both go through the SAME
// cache entry, so they cannot disagree and N readers cost one poll (§7).
//
// PER-BEAT FAILURE, following ExtractStage. One rejection shows its own
// localized reason on its own chip and offers its own retry; it never paints
// over the beats that worked. Collapsing forty outcomes into one banner would
// hide exactly which of them the user actually got for their credits.
//
// A RETRY IS A FRESH PURCHASE. The failed attempt either never charged (a
// refused submit) or was already refunded by `generations.create` — so the
// price goes ON the control, the way every other spend in this app does.
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import type { CatalogModel, FilmDetail, Shot } from '@opencreate/contracts'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from 'shared/ui'
import { useShotGeneration, useShotGenerations } from 'modules/Cinema'
import { clipCredits } from '../model/batchPlan'
import type { BatchRunItem, BeatStatus } from '../model/boardStatus'
import { batchProgress, beatGenerationId, beatState } from '../model/boardStatus'
import { useBatchRun, useBatchRunItems, useIsBatchRunning } from '../model/useBatchRun'

export type RunBoardProps = {
  // The batch's films WITH their shots, from the shared ['film', id] entries
  films: FilmDetail[]
  // The live catalog — the source of a retry's price. Empty while it loads: the
  // retry stays disabled rather than quote a guess (ExtractStage's rule).
  models: CatalogModel[]
  isPending: boolean
  isError: boolean
  onRetryLoad: () => void
}

const SKELETON_KEYS = ['s1', 's2', 's3']

// Each status gets ONE colour, and they are the design system's specimen tints
// plus dim mist — never a fourth hue invented for a chip.
const CHIP_TONE: Record<BeatStatus, string> = {
  free: 'border-white/10 text-mist-dim',
  draft: 'border-white/10 text-mist-dim',
  queued: 'border-white/10 text-mist-dim',
  submitting: 'border-white/10 text-mist',
  processing: 'border-specimen-amber/40 text-lumen-amber',
  succeeded: 'border-specimen-green/40 text-glow-green',
  failed: 'border-glow-red/40 text-glow-red',
}

const findItem = (items: readonly BatchRunItem[], shotId: string) =>
  items.find((item) => item.shotId === shotId)

export function RunBoard({ films, models, isPending, isError, onRetryLoad }: RunBoardProps) {
  const { t } = useTranslation()

  if (isPending) {
    return (
      // role="status" so the wait is announced rather than being a silent gap.
      <div role="status" aria-label={t('common.loading')} className="flex flex-col gap-4">
        {SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-28 w-full" />
        ))}
      </div>
    )
  }

  if (isError) return <ErrorState message={t('errors.loadFailed')} onRetry={onRetryLoad} />

  if (films.length === 0) {
    return (
      <EmptyState
        title={t('shorts.board.empty.title')}
        description={t('shorts.board.empty.description')}
      />
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-normal text-mist-dim">{t('shorts.board.title')}</h2>
      {films.map((detail) => (
        <FilmRow key={detail.film.id} detail={detail} models={models} />
      ))}
    </section>
  )
}

function FilmRow({ detail, models }: { detail: FilmDetail; models: CatalogModel[] }) {
  const { t } = useTranslation()
  const runItems = useBatchRunItems()

  // Read every clip of this film at once (no interval — the chips below own the
  // polling) and derive the progress line from the same pure function the chips
  // use, so the header can never contradict the row under it.
  const generationIds = detail.shots.flatMap((shot) => {
    const id = beatGenerationId(shot, findItem(runItems, shot.id))
    return id === null ? [] : [id]
  })
  const generations = useShotGenerations(generationIds)
  const progress = batchProgress(
    detail.shots.map((shot) => {
      const runItem = findItem(runItems, shot.id)
      const id = beatGenerationId(shot, runItem)
      return beatState(shot, runItem, id === null ? undefined : generations[id])
    }),
  )

  return (
    <Card>
      {/* An `article` named after the film: a board of forty shorts is forty
          landmarks a screen-reader user can move between. */}
      <article aria-label={detail.film.title} className="flex flex-col gap-3">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-base font-normal text-white">{detail.film.title}</h3>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-xs text-mist-dim tabular-nums">
              <span>
                {t('shorts.board.progress', {
                  succeeded: progress.succeeded,
                  total: progress.total,
                })}
              </span>
              {progress.failed > 0 ? (
                <Badge variant="danger">
                  {t('shorts.board.failed', { count: progress.failed })}
                </Badge>
              ) : null}
            </span>
            {/* The batch's exit: a short IS a film, so it opens in the editor
                that already knows how to trim, score and export it. */}
            <Link
              to="/cinema/$filmId"
              params={{ filmId: detail.film.id }}
              className="text-xs text-portal transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              {t('shorts.board.open')}
            </Link>
          </div>
        </header>
        <ul className="flex flex-wrap gap-2">
          {detail.shots.map((shot, index) => (
            <BeatChip key={shot.id} shot={shot} index={index} models={models} />
          ))}
        </ul>
      </article>
    </Card>
  )
}

// One beat, one chip. It subscribes to its OWN generation through Cinema's
// `useShotGeneration` — the shared ['generation', id] entry — so this chip is
// what keeps a live clip polling, and everything else in the app that watches
// the same clip rides that one request.
function BeatChip({
  shot,
  index,
  models,
}: {
  shot: Shot
  // Position in the film, 0-based. NOT shot.orderIndex: that is a real-valued
  // sort key (a beat inserted between 1 and 2 is 1.5), so it is a fine sort and
  // a terrible label.
  index: number
  models: CatalogModel[]
}) {
  const { t } = useTranslation()
  const runItem = useBatchRunItems().find((item) => item.shotId === shot.id)
  const { data: generation } = useShotGeneration(beatGenerationId(shot, runItem))
  const state = beatState(shot, runItem, generation)

  const isRunning = useIsBatchRunning()
  const { retryBeat } = useBatchRun()
  const model = models.find((candidate) => candidate.id === shot.modelId)
  const credits = model ? clipCredits(model, Math.round(shot.durationMs / 1000)) : null

  return (
    <li
      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${CHIP_TONE[state.status]}`}
    >
      <span className="tabular-nums">{index + 1}</span>
      <span>{t(`shorts.board.status.${state.status}`)}</span>
      {state.status === 'failed' ? (
        <>
          {/* Our words for the failure, never the provider's raw text. */}
          <span className="text-mist-dim">{t(errorCodeMessageKey(state.errorCode))}</span>
          <Button
            variant="ghost"
            size="sm"
            // Disabled while a batch runs: a retry then would be a fifth submit
            // past the cap, against a total confirmed for a different list of
            // beats. An unknown price disables it too — the price IS the
            // information, and a button that hides it is the trap this feature
            // exists to avoid.
            disabled={isRunning || model === undefined || credits === null}
            onClick={() => {
              if (!model) return
              void retryBeat(shot, model, shot.aspectRatio ?? '9:16')
            }}
          >
            {t('shorts.board.retry', { credits: credits ?? 0 })}
          </Button>
        </>
      ) : null}
    </li>
  )
}
