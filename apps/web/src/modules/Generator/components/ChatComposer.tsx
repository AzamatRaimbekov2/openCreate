// apps/web/src/modules/Generator/components/ChatComposer.tsx
// The docked composer: the /create page's chat input, pinned to the bottom of
// the media feed (Higgsfield's arrangement — the library is the page, the
// composer is the pen).
//
// WHY A SECOND SURFACE ALONGSIDE GeneratorPanel:
// Same store, same mutation, same catalog — a different POSTURE. The sheet is a
// form you fill top-to-bottom and submit; the composer is a bar you return to,
// over and over, watching results land above it. Merging them behind a `mode`
// prop would mean one component branching on layout in ~8 places. They are kept
// as siblings over the SAME model layer, which is the part that must not fork.
//
// The settings row is the "под капотом" surface: type, model, aspect frames
// (+ derived resolution), duration, attachment. The CONTROLS stay visible in the
// row rather than collapsing into a single "settings" popover — these choices
// change the price, and the price is right there next to the button. (The model
// control is the custom ModelSelect: its option LIST is a popup, but the control
// itself — showing the current model + price — stays on the rail.)
//
// NOT PRESENT, DELIBERATELY: a quality (4K/8K) selector and a free width×height
// field. The API derives resolution from (model tier × aspect) — there is no
// wire field to carry either, and no upscale step in the pipeline. Rendering
// them would be a lie the backend cannot honor. See resolutionFor().
import { useEffect } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { formatResolution, resolutionFor } from '@opencreate/contracts'
import { Button, EmptyState, ErrorState, Select, Skeleton } from 'shared/ui'
import { useCatalog } from '../model/catalogApi'
import { useCreateGeneration } from '../model/createGeneration'
import {
  selectCostCredits,
  selectCreateInput,
  selectModel,
  useGeneratorStore,
} from '../model/generatorStore'
import { AttachImage } from './AttachImage'
import { MentionControl } from './MentionControl'
import type { TaggableEntity } from './MentionControl'
import { CostLabel } from './CostLabel'
import { ModelSelect } from './ModelSelect'
import { deriveEntityRefs } from '../model/mentions'
import { SubmitErrorBanner } from './SubmitErrorBanner'

// The capsule: a floating pill of frosted glass the media scrolls beneath.
//
// bg-ridge is the OPAQUE default and supports-[backdrop-filter] upgrades it to
// translucent. Order matters — without backdrop-filter a translucent fill is
// just a transparent panel, and the prompt text would land unreadable on top of
// whatever media happens to be behind it. Glass is the enhancement, never the
// baseline. (Firefox ships backdrop-filter enabled since 103, but the flag can
// still be off, and print/forced-colors modes drop it entirely.)
//
// WHAT MAKES IT READ AS iOS 18 GLASS, and not as "a dark box at 55% opacity":
//  · the fill is barely there (white/[0.04]) — the blurred backdrop IS the
//    surface, so you can see media move through it rather than behind a scrim
//  · backdrop-saturate-150 — Apple's materials boost chroma of what they blur;
//    without it a blur washes colour out and the panel goes grey and dead
//  · backdrop-brightness-75 — buys text contrast from the BACKDROP instead of
//    from an opaque fill, which is the whole trick: dim what's behind, don't
//    cover it
//  · a bright top border + faint bottom (border-t-white/25) fakes the specular
//    edge of a real lens; a uniform hairline reads as a flat outline
//  · an inset ring adds the inner glass wall under that edge
//
// The pointer-events-auto re-enables clicks the route's click-through wrapper
// disabled so the feed could stay scrollable under the capsule's margins.
const CAPSULE_CLASS = [
  'pointer-events-auto w-full max-w-3xl rounded-[1.75rem] px-4 py-3',
  // Opaque baseline — everything below only applies where glass is real
  'border border-white/15 bg-ridge',
  // Depth: a long soft shadow lifts the capsule off the feed
  'shadow-2xl shadow-black/50',
  // The glass itself
  'supports-[backdrop-filter]:bg-white/[0.04]',
  'supports-[backdrop-filter]:backdrop-blur-2xl',
  'supports-[backdrop-filter]:backdrop-saturate-150',
  'supports-[backdrop-filter]:backdrop-brightness-75',
  // Specular edge: lit from above, dimmer below
  'supports-[backdrop-filter]:border-white/10',
  'supports-[backdrop-filter]:border-t-white/25',
  // Inner glass wall
  'supports-[backdrop-filter]:ring-1 supports-[backdrop-filter]:ring-white/5 supports-[backdrop-filter]:ring-inset',
].join(' ')

export type ChatComposerProps = {
  // Entities the user can tag, injected by the route (Generator must not import
  // modules/Entities). Absent/empty → the mention control shows a quiet hint.
  taggableEntities?: TaggableEntity[]
}

export function ChatComposer({ taggableEntities = [] }: ChatComposerProps) {
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

  // Loading: mirror the bar's silhouette so the feed above never jumps
  if (catalog.isPending) {
    return (
      <div className={CAPSULE_CLASS} aria-label={t('generator.title')}>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-11 w-full rounded-2xl" />
          <Skeleton className="h-6 w-2/3 rounded-full" />
        </div>
      </div>
    )
  }

  if (catalog.isError) {
    return (
      <div className={CAPSULE_CLASS}>
        <ErrorState message={t('errors.loadFailed')} onRetry={() => void catalog.refetch()} />
      </div>
    )
  }

  // Defensive empty state — a catalog without models must still explain itself
  if (catalog.data.models.length === 0) {
    return (
      <div className={CAPSULE_CLASS}>
        <EmptyState
          title={t('generator.unavailable.title')}
          description={t('generator.unavailable.description')}
        />
      </div>
    )
  }

  const model = selectModel(state)
  const cost = selectCostCredits(state)
  const input = selectCreateInput(state)
  // A tag is LIVE when its token is still in the text. While one is, the model
  // list narrows to reference-capable models — a model that ignores the tag
  // would silently bill the user for a stranger (enforced again by the API).
  const hasMention = deriveEntityRefs(state.prompt, state.mentions).length > 0

  // Insert a tag: register the mention, append its token to the prompt. Appended
  // (not inserted at caret) to stay dependency-free — the token is opaque, so its
  // position is cosmetic, and the API composes the final sentence anyway.
  const handleAddMention = (entityId: string) => {
    const token = state.addMention(entityId)
    const separator = state.prompt.length > 0 && !state.prompt.endsWith(' ') ? ' ' : ''
    state.setPrompt(`${state.prompt}${separator}${token}`)
  }

  // Remove a tag: drop the mapping AND strip its token, so the two never drift
  const handleRemoveMention = (placeholder: string) => {
    state.removeMention(placeholder)
    state.setPrompt(state.prompt.replace(`[[${placeholder}]]`, '').replace(/\s{2,}/g, ' ').trim())
  }

  const handleSubmit = () => {
    // input is null while the draft is not submittable (button disabled too)
    if (input) mutation.mutate(input)
  }

  // Enter submits, Shift+Enter breaks the line — the chat contract. Without
  // this the composer looks like a chat box and behaves like a form, which is
  // the single most jarring thing a chat-shaped input can do.
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }

  return (
    <section aria-label={t('generator.title')} className={CAPSULE_CLASS}>
      {mutation.isError ? (
        <div className="mb-2">
          <SubmitErrorBanner error={mutation.error} />
        </div>
      ) : null}

      {/* Input row FIRST — the prompt is why the capsule exists. The textarea
          is transparent and border-less: the capsule's own glass is the field,
          so nesting a second bordered box inside it would read as a box in a
          box. One row tall (rows=1) keeps the pill small; it grows only when
          the user shift+enters. */}
      <div className="flex items-center gap-2">
        {/* Attachment sits INSIDE the input row, iOS-style, only where the
            model can actually take an image */}
        {model?.supportsImageInput ? (
          <AttachImage value={state.inputImage} onChange={state.setInputImage} />
        ) : null}
        <textarea
          rows={1}
          value={state.prompt}
          onChange={(event) => state.setPrompt(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={t('generator.prompt.label')}
          placeholder={t('generator.prompt.placeholder')}
          className="max-h-32 min-h-11 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-base text-mist placeholder:text-mist-dim/60 focus:outline-none"
        />
        <div className="flex shrink-0 items-center gap-3">
          <CostLabel credits={cost} />
          {/* Round pill — the capsule's own radius language */}
          <Button onClick={handleSubmit} disabled={!input} isLoading={mutation.isPending}>
            {t('generator.submit')}
          </Button>
        </div>
      </div>

      {/* Settings strip — a quiet under-rail separated by a hairline, not a
          second panel. Type/aspect/duration stay the same compact glass Select
          (one silhouette, one height); the MODEL is the exception — it is the
          choice that most changes the result and the price, so it earns the
          custom ModelSelect (logo + tariff + description in an OPAQUE popup that
          opens UPWARD, readable over the capsule's frosted glass).
          min-w-0 on the children lets a long model label truncate instead of
          shoving the strip wider than the capsule (a flex item's default
          min-width:auto refuses to shrink below its content). */}
      <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-white/10 pt-2.5 sm:flex sm:flex-wrap sm:items-end">
        <Select
          label={t('generator.type.label')}
          variant="glass"
          options={[
            { value: 'image', label: t('generator.type.image') },
            { value: 'video', label: t('generator.type.video') },
          ]}
          value={state.type}
          onChange={state.setType}
        />
        <div className="min-w-0 sm:max-w-56 sm:flex-1">
          <ModelSelect
            variant="glass"
            selectedId={state.modelId}
            onSelect={state.setModel}
            referenceCapableOnly={hasMention}
          />
        </div>
        {model ? (
          <Select
            label={t('generator.aspect.label')}
            variant="glass"
            // Ratio is the label, the DERIVED pixel size is the meta column —
            // the kit right-aligns it, so the sizes line up down the popup
            // instead of trailing each ratio at a ragged offset
            options={model.aspectRatios.map((ratio) => ({
              value: ratio,
              label: ratio,
              meta: formatResolution(resolutionFor(model, ratio)),
            }))}
            value={state.aspectRatio}
            onChange={state.setAspectRatio}
          />
        ) : null}
        <MentionControl
          entities={taggableEntities}
          prompt={state.prompt}
          mentions={state.mentions}
          onAdd={handleAddMention}
          onRemove={handleRemoveMention}
        />
        {/* Duration is a video-only dimension */}
        {model?.type === 'video' ? (
          <Select
            label={t('generator.duration.label')}
            variant="glass"
            options={model.durationOptions.map((seconds) => ({
              value: String(seconds),
              label: t('generator.duration.seconds', { count: seconds }),
            }))}
            value={String(state.duration ?? '')}
            // The store's duration is a number; the DOM only speaks strings
            onChange={(seconds) => state.setDuration(Number(seconds))}
          />
        ) : null}
      </div>
    </section>
  )
}
