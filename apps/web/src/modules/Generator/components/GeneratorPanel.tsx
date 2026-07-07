// apps/web/src/modules/Generator/components/GeneratorPanel.tsx
// The create-page form: type toggle → model cards → prompt → aspect/duration →
// optional i2v upload → cost + submit. Catalog state (loading/error/empty/data)
// follows the 4-states rule; submit failures surface inline — insufficient
// credits gets its own banner with a pricing link instead of a generic error.
import { useEffect, useId } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ApiClientError } from 'shared/libs/apiClient'
import { Button, EmptyState, ErrorState, PillGroup, Skeleton } from 'shared/ui'
import { useCatalog } from '../model/catalogApi'
import { useCreateGeneration } from '../model/createGeneration'
import {
  selectCostCredits,
  selectCreateInput,
  selectModel,
  useGeneratorStore,
} from '../model/generatorStore'
import { AspectPicker } from './AspectPicker'
import { CostLabel } from './CostLabel'
import { DurationPicker } from './DurationPicker'
import { ImageDrop } from './ImageDrop'
import { ModelPicker } from './ModelPicker'

export function GeneratorPanel() {
  const { t } = useTranslation()
  const promptId = useId()
  const catalog = useCatalog()
  const state = useGeneratorStore()
  const mutation = useCreateGeneration()

  // Push the fetched catalog into the store — setCatalog keeps a still-valid
  // selection and otherwise picks the first model of the current type
  const setCatalog = useGeneratorStore((store) => store.setCatalog)
  useEffect(() => {
    if (catalog.data) setCatalog(catalog.data.models)
  }, [catalog.data, setCatalog])

  // Loading: mirror the form silhouette (toggle, cards, textarea, footer)
  if (catalog.isPending) {
    return (
      <section aria-label={t('generator.title')} className="flex flex-col gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-10 w-full" />
      </section>
    )
  }

  if (catalog.isError) {
    return <ErrorState message={t('errors.loadFailed')} onRetry={() => void catalog.refetch()} />
  }

  // Defensive empty state — a catalog without models must still explain itself
  if (catalog.data.models.length === 0) {
    return (
      <EmptyState
        title={t('generator.unavailable.title')}
        description={t('generator.unavailable.description')}
      />
    )
  }

  const model = selectModel(state)
  const cost = selectCostCredits(state)
  const input = selectCreateInput(state)
  const isInsufficient =
    mutation.error instanceof ApiClientError && mutation.error.code === 'insufficient_credits'
  // Safety-filter block (API 'content_blocked'): needs its own copy — the
  // failure is about the CONTENT, the fix is a different prompt, and the user
  // must hear the charge came back (spec: clear message + refund on NSFW block)
  const isBlocked =
    mutation.error instanceof ApiClientError && mutation.error.code === 'content_blocked'

  const handleSubmit = () => {
    // input is null while the draft is not submittable (button disabled too)
    if (input) mutation.mutate(input)
  }

  return (
    <section
      aria-label={t('generator.title')}
      className="flex flex-col gap-6 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm"
    >
      <PillGroup
        label={t('generator.type.label')}
        options={[
          { value: 'image', label: t('generator.type.image') },
          { value: 'video', label: t('generator.type.video') },
        ]}
        value={state.type}
        onChange={state.setType}
      />

      <ModelPicker
        models={state.models.filter((candidate) => candidate.type === state.type)}
        selectedId={state.modelId}
        onSelect={state.setModel}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor={promptId} className="text-sm font-medium text-ink">
          {t('generator.prompt.label')}
        </label>
        <textarea
          id={promptId}
          rows={3}
          value={state.prompt}
          onChange={(event) => state.setPrompt(event.target.value)}
          placeholder={t('generator.prompt.placeholder')}
          className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-ink placeholder:text-ink-soft focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
        />
      </div>

      {model ? (
        <AspectPicker
          options={model.aspectRatios}
          value={state.aspectRatio}
          onChange={state.setAspectRatio}
        />
      ) : null}

      {/* Duration is a video-only dimension */}
      {model?.type === 'video' ? (
        <DurationPicker
          options={model.durationOptions}
          value={state.duration}
          onChange={state.setDuration}
        />
      ) : null}

      {/* i2v upload only where the model can actually take an image */}
      {model?.supportsImageInput ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">{t('generator.image.label')}</span>
          <ImageDrop value={state.inputImage} onChange={state.setInputImage} />
        </div>
      ) : null}

      {mutation.isError ? (
        // Inline, non-blocking failure banner (frontend-error-ux: modal only
        // for failures that need a decision — this one has an inline next step)
        <div role="alert" className="flex flex-col gap-1 rounded-xl bg-danger/10 px-4 py-3 text-sm">
          <span className="text-ink">
            {isInsufficient
              ? t('generator.errors.insufficientCredits')
              : isBlocked
                ? t('generator.errors.contentBlocked')
                : t('errors.actionFailed')}
          </span>
          {isInsufficient ? (
            // Typed Link since Task 20 shipped /pricing — SPA navigation keeps
            // the drafted prompt alive in the store if the user comes back
            <Link
              to="/pricing"
              className="font-medium text-vermillion underline focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
            >
              {t('generator.errors.seePricing')}
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <CostLabel credits={cost} />
        <Button
          onClick={handleSubmit}
          disabled={!input}
          isLoading={mutation.isPending}
          className="ml-auto"
        >
          {t('generator.submit')}
        </Button>
      </div>
    </section>
  )
}
