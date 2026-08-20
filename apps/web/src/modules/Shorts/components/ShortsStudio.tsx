// apps/web/src/modules/Shorts/components/ShortsStudio.tsx
// The batch surface. NOT a second gallery: ADR shorts-studio §1 widened
// TemplateCategory by one value, so the shorts shelf already appears in
// /templates for free. What does not exist anywhere else is this — pick ONE
// format, write N rows of knob values, read one price, run.
//
// THE ORDER OF THE SCREEN IS THE ORDER OF THE DECISION, the same discipline
// TemplateDetailModal follows:
//   1. which format          — do I want this shape at all?
//   2. which tier            — what am I paying per clip, and can I afford it?
//   3. the rows              — what are the N shorts actually about?
//   4. one price, one button — and a dialog that restates it before it moves.
//
// STEP 4 IS THE FEATURE. The template-catalog ADR rejected "Generate all" as "the
// same trap with a better name" and left exactly one door open: an explicit,
// ITEMISED confirmation step. Everything above is assembly; the confirm is the
// condition being met.
//
// WHAT IS NOT HERE, on purpose (ADR §5): cast entities, style packages, voices.
// Those are durable inventory chosen once, not per row — conflating them with
// knobs is what makes a batch incoherent, because forty clips need ONE brand and
// ONE face. A row supplies knob values and a title, nothing else.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CatalogModel, TemplateSummary, TemplateTier } from '@opencreate/contracts'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { ApiClientError } from 'shared/libs/apiClient'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  SpendConfirmModal,
} from 'shared/ui'
import { TemplateCard, TierPicker, useBalance, useTemplates } from 'modules/Templates'
import { buildBatchPlan } from '../model/batchPlan'
import { newRowId, seedRow, isRowComplete, toBatchRows } from '../model/variantRows'
import type { VariantRow } from '../model/variantRows'
import { useBatchFilmDetails, useBatchFilms, useCreateFilmBatch } from '../model/batchApi'
import { useBatchRun, useIsBatchRunning } from '../model/useBatchRun'
import { RunBoard } from './RunBoard'
import { VariantsTable } from './VariantsTable'

export type ShortsStudioProps = {
  // The live catalog, read at the ROUTE (the established seam — Assets3D and
  // Cinema do the same) and passed down. It is the source of every price on
  // this screen; empty means "no number yet", never "free".
  models: CatalogModel[]
  // The batch this surface is showing, from the URL. Null = nothing run yet.
  batchId: string | null
  // Hand a fresh batch id back to the route, which puts it in the URL. That is
  // the whole of the reload story (ADR §2): the board is rebuilt from the id.
  onBatchCreated: (batchId: string) => void
}

const SKELETON_KEYS = ['s1', 's2', 's3', 's4']
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'

export function ShortsStudio({ models, batchId, onBatchCreated }: ShortsStudioProps) {
  const { t } = useTranslation()
  const templates = useTemplates()
  const balance = useBalance()
  const createBatch = useCreateFilmBatch()
  const { start } = useBatchRun()
  const isRunning = useIsBatchRunning()

  const [template, setTemplate] = useState<TemplateSummary | null>(null)
  const [tier, setTier] = useState<TemplateTier>('standard')
  const [rows, setRows] = useState<VariantRow[]>([])
  const [isConfirming, setIsConfirming] = useState(false)
  // The batch THIS visit created, if any. It exists so the board can render the
  // instant the create answers, without waiting for the id to make a round trip
  // through the URL and come back as a list request — the run has already
  // started by then, and a blank board next to a spending runner is a lie.
  const [created, setCreated] = useState<{ batchId: string; filmIds: string[] } | null>(null)

  // The films of the batch currently on screen. Their shots come from the SHARED
  // ['film', id] entries the create response seeded, so a fresh batch renders
  // with no extra request and a reload fetches them once.
  const batchFilms = useBatchFilms(batchId)
  // Local ids win, unless the URL has moved to a DIFFERENT batch than the one we
  // made — that is the reload/deep-link path, and there the list is the truth.
  const isShowingOwnBatch = created !== null && (batchId === null || batchId === created.batchId)
  const filmIds = isShowingOwnBatch
    ? created.filmIds
    : (batchFilms.data?.items.map((film) => film.id) ?? [])
  const details = useBatchFilmDetails(filmIds)

  if (templates.isPending) {
    return (
      <div role="status" aria-label={t('common.loading')} className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <div className={GRID}>
          {SKELETON_KEYS.map((key) => (
            <Skeleton key={key} className="aspect-4/5 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (templates.isError) {
    return <ErrorState message={t('errors.loadFailed')} onRetry={() => void templates.refetch()} />
  }

  const shelf = templates.data.items.filter((candidate) => candidate.category === 'shorts')

  if (shelf.length === 0) {
    return (
      <EmptyState title={t('shorts.empty.title')} description={t('shorts.empty.description')} />
    )
  }

  const pick = (picked: TemplateSummary) => {
    setTemplate(picked)
    // Open on ONE seeded row rather than an empty table: a batch of one is a
    // legitimate first act, and an empty grid asks the user to guess what a row is.
    setRows([seedRow(picked, newRowId())])
  }

  if (!template) {
    return (
      <div className="flex flex-col gap-8">
        <Header />
        <ul className={GRID}>
          {shelf.map((candidate) => (
            <li key={candidate.id}>
              <TemplateCard template={candidate} onOpen={pick} />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const plan = buildBatchPlan(template, tier, rows.length, models)
  const isComplete = rows.length > 0 && rows.every((row) => isRowComplete(template, row))
  const canRun = isComplete && plan.total !== null && !isRunning && !createBatch.isPending

  const confirmBatch = () => {
    // Close FIRST, then spend (design.md §9): the interesting thing to watch is
    // the board filling in, not a spinner on a question already answered.
    setIsConfirming(false)
    createBatch.mutate(
      { templateId: template.id, tier, rows: toBatchRows(rows) },
      {
        onSuccess: (result) => {
          setCreated({
            batchId: result.batchId,
            filmIds: result.films.map((detail) => detail.film.id),
          })
          onBatchCreated(result.batchId)
          // Creating charged nothing. THIS is where the credits go, and only
          // after the dialog above said the number out loud.
          void start(result.films, models)
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <Header />

      <Card
        title={template.name}
        action={
          <Button variant="ghost" size="sm" onClick={() => setTemplate(null)} disabled={isRunning}>
            {t('shorts.pick.change')}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-mist-dim">
            {t('shorts.pick.beats', {
              beats: template.shotCount,
              seconds: template.totalDurationSeconds,
              aspect: template.aspectRatio,
            })}
          </p>
          {/* The tier is chosen ONCE for the whole batch — mixing tiers inside
              one confirmed total is how an itemised price stops being itemised. */}
          <TierPicker
            offers={template.tiers}
            value={tier}
            onChange={setTier}
            balance={balance.data?.creditsBalance}
          />
        </div>
      </Card>

      <VariantsTable template={template} rows={rows} onChange={setRows} disabled={isRunning} />

      {/* The price, live, next to the thing it is pricing. */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
        <div className="flex flex-col gap-1">
          {plan.total === null ? (
            <span className="text-sm text-mist-dim">{t('shorts.total.unknown')}</span>
          ) : (
            <>
              <span className="text-lg text-white tabular-nums">
                {t('spend.credits', { count: plan.total })}
              </span>
              <span className="text-xs text-mist-dim">
                {t('shorts.total.shape', {
                  rows: plan.rows,
                  beats: plan.beatsPerRow,
                  credits: plan.perShort === null ? 0 : plan.perShort / plan.beatsPerRow,
                })}
              </span>
            </>
          )}
          {/* Say WHY the button is dead. A disabled control with no explanation
              is a dead end, and on a spend surface it reads as a broken product. */}
          {plan.hasPriceDrift ? (
            <span role="status" className="text-xs text-glow-red">
              {t('shorts.run.drift')}
            </span>
          ) : null}
          {!isComplete && rows.length > 0 ? (
            <span role="status" className="text-xs text-mist-dim">
              {t('shorts.run.incomplete')}
            </span>
          ) : null}
          {createBatch.isError ? (
            <span role="status" className="text-xs text-glow-red">
              {createBatch.error instanceof ApiClientError
                ? t(errorCodeMessageKey(createBatch.error.code))
                : t('shorts.run.createFailed')}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {isRunning ? (
            <RunningControls />
          ) : (
            <Button
              onClick={() => setIsConfirming(true)}
              disabled={!canRun}
              isLoading={createBatch.isPending}
            >
              {/* The number is said ON the button the click is aimed at. Without
                  a total there is no honest label, so the pill falls back to the
                  plain CTA — and is disabled. */}
              {plan.total === null
                ? t('shorts.run.ctaUnknown')
                : t('shorts.run.cta', { credits: plan.total })}
            </Button>
          )}
        </div>
      </div>

      <RunBoard
        films={details.films}
        models={models}
        // Only the RELOAD path can be pending: a batch made in this session
        // already holds its films, so it never shows a skeleton over them.
        isPending={
          !isShowingOwnBatch && batchId !== null && (batchFilms.isPending || details.isPending)
        }
        isError={batchFilms.isError || details.isError}
        onRetryLoad={() => {
          void batchFilms.refetch()
          details.refetch()
        }}
      />

      {/* The gate. Everything above this line is free; everything below it is not. */}
      <SpendConfirmModal
        isOpen={isConfirming}
        title={t('shorts.confirm.title', { rows: rows.length })}
        description={t('shorts.confirm.description')}
        confirmLabel={t('shorts.confirm.submit', { credits: plan.total ?? 0 })}
        credits={plan.total}
        balance={balance.data?.creditsBalance}
        onCancel={() => setIsConfirming(false)}
        onConfirm={confirmBatch}
      >
        {/* The arithmetic, spelled out. "1,400 credits" alone is a number to
            flinch at; "10 shorts × 4 beats × 35 cr" is a number to CHECK. */}
        <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-xs">
          <span className="text-mist-dim">
            {t('shorts.total.shape', {
              rows: plan.rows,
              beats: plan.beatsPerRow,
              credits: plan.perShort === null ? 0 : plan.perShort / plan.beatsPerRow,
            })}
          </span>
          <span className="text-glow-green tabular-nums">
            {plan.total === null ? '—' : t('spend.credits', { count: plan.total })}
          </span>
        </div>
      </SpendConfirmModal>
    </div>
  )
}

function Header() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-normal text-white">{t('shorts.title')}</h1>
      <p className="max-w-2xl text-sm text-mist-dim">{t('shorts.subtitle')}</p>
    </div>
  )
}

// While a batch runs there is exactly one action worth offering, and it is not
// "run it again". Stop is a `danger` ghost rather than a primary: stopping is a
// recovery, and the design should nudge toward neither continuing nor quitting.
function RunningControls() {
  const { t } = useTranslation()
  const { cancel } = useBatchRun()
  return (
    <>
      <span role="status" className="text-xs text-lumen-amber">
        {t('shorts.run.running')}
      </span>
      <Button variant="danger" onClick={cancel}>
        {t('shorts.run.cancel')}
      </Button>
    </>
  )
}
