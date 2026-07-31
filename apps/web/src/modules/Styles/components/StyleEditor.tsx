// apps/web/src/modules/Styles/components/StyleEditor.tsx
// The style CONSTRUCTOR: name, the positive fragment, the negative, an optional
// recommended model, and — once the style exists — the preview run. Create and
// edit are one modal (a null `style` means create), the EntityEditor precedent:
// the fields are identical and forking them would drift.
//
// WHY THE PREVIEW IS NOT RUN FROM HERE. The button saves and then hands the
// SAVED row upward; StyleLibrary owns the actual generation. A preview is a paid
// run that takes seconds to minutes, and a user closes a modal — a poll that
// died with this component would leave a charged generation with nothing left to
// attach it to, and no way for the user to recover the credit.
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CatalogModel, Style } from '@opencreate/contracts'
import { Button, EnhanceButton, Input, Modal, Select } from 'shared/ui'
import { PREVIEW_FALLBACK_MODEL_ID, useCreateStyle, useUpdateStyle } from '../model/api'
import { StyleReferenceImages } from './StyleReferenceImages'

export type StyleEditorProps = {
  // null → create mode; a style → edit mode (prefilled)
  style: Style | null
  // The catalog, injected from the route through StyleLibrary. Used twice: to
  // offer a recommended model, and to price the preview from the model that
  // will actually run it.
  models: CatalogModel[]
  isOpen: boolean
  onClose: () => void
  // Hand the SAVED style up for its preview run (owned by the library, which
  // outlives this modal).
  onPreview: (style: Style) => void
  // True while that run is in flight for this style — the button holds its
  // spinner even though the mutation driving it lives one level up.
  isPreviewPending: boolean
}

// Shared field chrome — the app's textarea recipe (EntityEditor / StoryboardModal).
const TEXTAREA =
  'w-full resize-none rounded-lg border border-white/10 bg-steel px-3 py-2 text-base text-mist transition-colors duration-200 placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none'
const FIELD_LABEL = 'text-xs text-mist-dim'
const FIELD_HINT = 'text-[11px] text-mist-dim/80'

export function StyleEditor({
  style,
  models,
  isOpen,
  onClose,
  onPreview,
  isPreviewPending,
}: StyleEditorProps) {
  const { t } = useTranslation()
  const createStyle = useCreateStyle()
  const updateStyle = useUpdateStyle()
  const fragmentId = useId()
  const negativeId = useId()

  const [name, setName] = useState(style?.name ?? '')
  const [fragment, setFragment] = useState(style?.fragment ?? '')
  const [negative, setNegative] = useState(style?.negative ?? '')
  // '' = no recommendation. The picker must be able to CLEAR one, which is why
  // the wire field is nullable rather than merely optional.
  const [recommendedModelId, setRecommendedModelId] = useState(style?.recommendedModelId ?? '')

  const isEdit = style !== null
  const isBusy = createStyle.isPending || updateStyle.isPending
  const isError = createStyle.isError || updateStyle.isError
  // A style with no fragment has nothing to apply — the server rejects it, and
  // the button should never have offered the trip.
  const canSubmit = name.trim().length > 0 && fragment.trim().length > 0 && !isBusy

  // Only image models can render a still preview, and the recommendation is
  // advice for a picker rather than a constraint, so both kinds are offered.
  const modelOptions = [
    { value: '', label: t('styles.field.modelNone') },
    ...models
      .filter((model) => model.type === 'image' || model.type === 'video')
      .map((model) => ({ value: model.id, label: model.name, caption: model.providerLabel })),
  ]

  // What the preview will cost: the model the style recommends, else the
  // fallback the run itself uses. A video recommendation has no still price, so
  // it falls back too — the number must match what the server will charge.
  const previewModel = models.find(
    (model) =>
      model.type === 'image' &&
      model.id === (recommendedModelId === '' ? PREVIEW_FALLBACK_MODEL_ID : recommendedModelId),
  )
  const fallbackModel = models.find(
    (model) => model.type === 'image' && model.id === PREVIEW_FALLBACK_MODEL_ID,
  )
  const previewCredits =
    previewModel?.type === 'image'
      ? previewModel.credits
      : fallbackModel?.type === 'image'
        ? fallbackModel.credits
        : null

  // The draft as the wire wants it. Shared by "save" and "save then preview" so
  // the two can never write different things.
  const draft = () => ({
    name: name.trim(),
    fragment: fragment.trim(),
    negative: negative.trim(),
    recommendedModelId: recommendedModelId === '' ? null : recommendedModelId,
  })

  const handleSubmit = () => {
    if (!canSubmit) return
    if (isEdit) {
      updateStyle.mutate({ id: style.id, input: draft() }, { onSuccess: onClose })
    } else {
      // `recommendedModelId` is optional (not nullable) on create — drop it
      // rather than send an explicit null the create schema does not accept.
      const { recommendedModelId: recommended, ...rest } = draft()
      createStyle.mutate(
        { ...rest, ...(recommended === null ? {} : { recommendedModelId: recommended }) },
        { onSuccess: onClose },
      )
    }
  }

  // Save first, THEN preview: the sample must render the fragment on screen, not
  // the one the server last heard about. The modal stays open so the result can
  // be judged against the text that produced it.
  const handlePreview = () => {
    if (!isEdit || !canSubmit) return
    // Wrapped, not passed through: a mutation's onSuccess also carries the
    // variables and context, and onPreview takes exactly one style.
    updateStyle.mutate({ id: style.id, input: draft() }, { onSuccess: (saved) => onPreview(saved) })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? t('styles.edit.title') : t('styles.create.title')}
    >
      <div className="flex flex-col gap-4">
        <Input
          label={t('styles.field.name')}
          value={name}
          placeholder={t('styles.field.namePlaceholder')}
          onChange={(event) => setName(event.target.value)}
        />

        {/* THE FRAGMENT — the style itself. Carries the sparkle, mandatory on
            every prompt field in this app (owner requirement 2026-07-30), and
            here it is the whole point: a user who cannot phrase a look in
            English gets one written for them. */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fragmentId} className={FIELD_LABEL}>
            {t('styles.field.fragment')}
          </label>
          {/* The absolute placement lives on THIS wrapper, never on
              EnhanceButton's own className: that class lands on the component's
              `relative` box, which is the anchor its error/nudge chip hangs
              from (ImageNode.tsx.md / ShotInspector precedent). */}
          <div className="relative">
            <textarea
              id={fragmentId}
              rows={3}
              value={fragment}
              onChange={(event) => setFragment(event.target.value)}
              placeholder={t('styles.field.fragmentPlaceholder')}
              className={`${TEXTAREA} pr-12`}
            />
            <div className="absolute right-2 bottom-2">
              <EnhanceButton value={fragment} onEnhanced={setFragment} />
            </div>
          </div>
          <p className={FIELD_HINT}>{t('styles.field.fragmentHint')}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={negativeId} className={FIELD_LABEL}>
            {t('styles.field.negative')}
          </label>
          <textarea
            id={negativeId}
            rows={2}
            value={negative}
            onChange={(event) => setNegative(event.target.value)}
            placeholder={t('styles.field.negativePlaceholder')}
            className={TEXTAREA}
          />
          <p className={FIELD_HINT}>{t('styles.field.negativeHint')}</p>
        </div>

        <Select
          label={t('styles.field.model')}
          options={modelOptions}
          value={recommendedModelId}
          onChange={setRecommendedModelId}
        />

        {/* THE OTHER HALF OF THE PACKAGE (ADR style-studio A1): a style may carry
            fragments AND up to three reference images at the same time. Edit mode
            only — an image is attached to a style BY ID, and one still being typed
            has none (the same reason the preview button is absent above). The
            strip reads `style.referenceImages` straight off the cached row, and
            both of its writes answer with the whole updated Style, so it never
            merges a partial result locally. */}
        {isEdit ? (
          <StyleReferenceImages styleId={style.id} references={style.referenceImages} />
        ) : (
          <p className="text-[11px] text-mist-dim/70">{t('styles.references.unsaved')}</p>
        )}

        {isError ? (
          <span role="alert" className="text-sm text-glow-red">
            {t('errors.actionFailed')}
          </span>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {/* Preview only in edit mode: the run cites a style BY ID, and a style
              still being typed does not have one yet (the EntityEditor photos
              precedent — create first, attach after). */}
          {isEdit ? (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={handlePreview}
              isLoading={isPreviewPending}
              disabled={!canSubmit || previewCredits === null}
            >
              {isPreviewPending
                ? t('styles.preview.running')
                : t('styles.preview.cta', { count: previewCredits ?? 0 })}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} isLoading={isBusy} disabled={!canSubmit}>
            {isEdit ? t('common.done') : t('styles.create.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
