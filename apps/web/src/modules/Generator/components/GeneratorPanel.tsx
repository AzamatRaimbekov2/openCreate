// apps/web/src/modules/Generator/components/GeneratorPanel.tsx
// The create-page form as the v3 terminal "commission sheet": a white/10
// hairline-framed sheet whose field groups — type → model cards → prompt →
// aspect/duration → optional i2v upload — are rows numbered by ghost mono
// ordinals and separated by hairlines, closed by a footer with the mono cost
// numeral + the Generate pill.
// Catalog state (loading/error/empty/data) follows the 4-states rule; submit
// failures surface inline via SubmitErrorBanner (never a blocking modal).
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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
import { PromptField } from './PromptField'
import { SheetField } from './SheetField'
import { SubmitErrorBanner } from './SubmitErrorBanner'

export function GeneratorPanel() {
  const { t } = useTranslation()
  const catalog = useCatalog()
  const state = useGeneratorStore()
  const mutation = useCreateGeneration()

  // Push the fetched catalog into the store — setCatalog keeps a still-valid
  // selection and otherwise picks the first model of the current type
  const setCatalog = useGeneratorStore((store) => store.setCatalog)
  useEffect(() => {
    if (catalog.data) setCatalog(catalog.data.models)
  }, [catalog.data, setCatalog])

  // Loading: mirror the sheet silhouette (toggle, cards, textarea, footer)
  // inside the same hairline frame so data lands without a layout jump
  if (catalog.isPending) {
    return (
      <section
        aria-label={t('generator.title')}
        className="flex flex-col gap-4 rounded-lg border border-white/10 p-6 md:p-7"
      >
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

  const handleSubmit = () => {
    // input is null while the draft is not submittable (button disabled too)
    if (input) mutation.mutate(input)
  }

  // The sheet's visible field groups IN ORDER — conditional groups (aspect,
  // duration, i2v) simply join the list, and the decorative ordinals below are
  // derived from render position so the numbering never skips. Keys are stable
  // group ids (never the index — the index only feeds the aria-hidden numeral).
  const fields: { key: string; content: ReactNode }[] = [
    {
      key: 'type',
      content: (
        <PillGroup
          label={t('generator.type.label')}
          options={[
            { value: 'image', label: t('generator.type.image') },
            { value: 'video', label: t('generator.type.video') },
          ]}
          value={state.type}
          onChange={state.setType}
        />
      ),
    },
    {
      key: 'model',
      content: (
        <ModelPicker
          models={state.models.filter((candidate) => candidate.type === state.type)}
          selectedId={state.modelId}
          onSelect={state.setModel}
        />
      ),
    },
    {
      key: 'prompt',
      content: <PromptField value={state.prompt} onChange={state.setPrompt} />,
    },
  ]

  if (model) {
    fields.push({
      key: 'aspect',
      content: (
        <AspectPicker
          options={model.aspectRatios}
          value={state.aspectRatio}
          onChange={state.setAspectRatio}
        />
      ),
    })
  }

  // Duration is a video-only dimension
  if (model?.type === 'video') {
    fields.push({
      key: 'duration',
      content: (
        <DurationPicker
          options={model.durationOptions}
          value={state.duration}
          onChange={state.setDuration}
        />
      ),
    })
  }

  // i2v upload only where the model can actually take an image
  if (model?.supportsImageInput) {
    fields.push({
      key: 'image',
      content: (
        <div className="flex flex-col gap-2">
          {/* Quiet mono caption — the v3 field-label voice (no uppercase) */}
          <span className="text-xs text-mist-dim">{t('generator.image.label')}</span>
          <ImageDrop value={state.inputImage} onChange={state.setInputImage} />
        </div>
      ),
    })
  }

  return (
    <section
      aria-label={t('generator.title')}
      // The commission sheet (v3): a white/10 hairline frame directly on the
      // void — inputs INSIDE it are the steel surface steps, so the frame
      // itself stays unfilled to keep the elevation ladder readable
      className="flex flex-col rounded-lg border border-white/10 p-6 md:p-7"
    >
      {/* Sheet head: quiet mono caption over the sheet's opening hairline */}
      <header className="mb-6 border-b border-white/10 pb-4">
        <span className="text-xs text-mist-dim">{t('generator.sheet')}</span>
      </header>

      <div className="flex flex-col divide-y divide-white/10">
        {fields.map((field, index) => (
          <SheetField key={field.key} ordinal={String(index + 1).padStart(2, '0')}>
            {field.content}
          </SheetField>
        ))}
      </div>

      {mutation.isError ? <SubmitErrorBanner error={mutation.error} /> : null}

      {/* Sheet footer: the cost line as a mono numeral against the closing
          hairline — price and action are decided together */}
      <footer className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
        <CostLabel credits={cost} />
        <Button
          onClick={handleSubmit}
          disabled={!input}
          isLoading={mutation.isPending}
          className="ml-auto"
        >
          {t('generator.submit')}
        </Button>
      </footer>
    </section>
  )
}
