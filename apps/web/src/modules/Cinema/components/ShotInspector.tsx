// apps/web/src/modules/Cinema/components/ShotInspector.tsx
// The selected shot's editor, v6: a COMPOSER DOCK fixed to the bottom of the
// viewport — the shape every prompt-first tool trains users on (type below,
// result above). The v4/v5 form lived in a 360px side rail; with the timeline
// on top and the stage in the middle, the rail was the one column fighting the
// preview for width, and a long prompt lived in a cramped box up in a corner.
//
// The dock's contract:
//   * The PROMPT is the composer's whole face: an auto-growing textarea
//     (field-sizing-content) the user can also resize by hand (resize-y) —
//     prompts run long, and the field must follow without a scrollbar-in-a-
//     thimble. Hard cap 30svh so it never eats the stage.
//   * QUICK TOOLS ride the toolbar as compact controls: model + duration
//     pickers, then small icon toggles — cast (paperclip), spoken line (mic),
//     and expand — each revealing a DRAWER above the textarea. Nothing from
//     the v5 inspector is gone; the rarely-touched groups (look presets,
//     transition, title card) are folded behind the expand toggle.
//   * Save persists the draft; Generate saves first, then creates the clip
//     (unchanged money-path chaining — see handleGenerate).
//
// Local draft state (the parent keys this component by shot.id so a new
// selection re-initialises cleanly — no useEffect sync). Generate is chained
// through onSuccess (no floating async) so the shot is saved before the
// composed request is built.
import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AspectRatio,
  EntityRef,
  CatalogAudioModel,
  CatalogVideoModel,
  Shot,
  TitlePosition,
  Transition,
  UpdateShotInput,
} from '@opencreate/contracts'
import { applyPromptPreset, resolveBuiltinStyle, transitionSchema } from '@opencreate/contracts'
import { ApiClientError } from 'shared/libs/apiClient'
import { deriveEntityRefs, entityPlaceholderToken, nextPlaceholder } from 'shared/libs/mentions'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { presentationFor } from 'shared/libs/modelPresentation'
import { Button, EnhanceButton, GLASS_SURFACE, ProviderMark, Select } from 'shared/ui'
import { useUpdateShot } from '../model/shotsApi'
import { useGenerateShotClip, useShotGeneration } from '../model/shotGeneration'
import { useShotFailureToast } from '../model/shotFailureToast'
import { createSoftenRetry } from '../model/softenRetry'
import { useGenerateVoiceover } from '../model/voiceoverApi'
import { SHOT_DURATIONS_SECONDS, draftToPreset, hasAnyPreset, presetToDraft } from '../model/presetOptions'
import type { PresetDraft } from '../model/presetOptions'
import type { CastableEntity } from './ShotCastField'
import { ShotCastField } from './ShotCastField'
import { ShotReferenceImages } from './ShotReferenceImages'
import { InspectorSection } from './InspectorSection'
import { ModelPickerModal } from './ModelPickerModal'
import { PresetPickers } from './PresetPickers'
import { ShotClipStatus } from './ShotClipStatus'
import { ShotTitleField } from './ShotTitleField'
import { ShotVoiceoverField } from './ShotVoiceoverField'
import { ExpandIcon, MicIcon, PaperclipIcon, SparkIcon, SpeakerIcon } from './icons'

export type ShotInspectorProps = {
  filmId: string
  // Keyed by shot.id upstream, so this always holds a fresh draft
  shot: Shot
  // The film canvas the generation aspect resolves against
  filmAspect: AspectRatio
  // Video models offered in the model picker (from the catalog)
  videoModels: CatalogVideoModel[]
  // The tts model, if the catalog offers one. undefined → the voice tool hides.
  ttsModel: CatalogAudioModel | undefined
  // Characters available to cast in this shot (route-injected; Cinema must not
  // import Entities). Empty while the library is empty.
  entities: CastableEntity[]
  // Where this shot starts on the timeline, in ms — the offset a generated voice
  // track is filed at, so the line plays under the beat that speaks it. Computed
  // by the editor (it is the one that knows every shot's duration).
  startMs: number
  // Whether a voiceover track already exists for this shot.
  isVoiced: boolean
}

// The drawer the toolbar toggles can open above the prompt (one at a time —
// two open panels would push the textarea off the dock)
type DockPanel = 'cast' | 'voice' | 'more'

// The only crossfade lengths we offer — short enough that a 4s shot survives one
const CROSSFADE_MS = [300, 500, 800] as const

// Manual prompt-height bounds (px) and the keyboard step. 40 = one line; 480
// keeps even a hand-stretched prompt from burying the stage.
const MIN_PROMPT_H = 40
const MAX_PROMPT_H = 480
const PROMPT_STEP = 16

// Toolbar icon toggle: a quiet chip that lights amber (the selection tint) while
// its drawer is open. size-8 = the compact chrome scale of the v5 pass.
const TOOL =
  'grid size-8 shrink-0 place-items-center rounded-full border border-white/10 transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none'
const TOOL_OFF = 'text-mist-dim hover:bg-ridge hover:text-white'
const TOOL_ON = 'bg-specimen-amber/20 text-lumen-amber'

// Snap the shot's stored length to the nearest offered display duration
function nearestSeconds(durationMs: number): number {
  const target = durationMs / 1000
  return SHOT_DURATIONS_SECONDS.reduce(
    (best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best),
    SHOT_DURATIONS_SECONDS[0],
  )
}

// Which model this shot should open on, in order of how much we actually know:
//   1. the model it is PINNED to (a template's tier, or the user's own last pick,
//      now that shot.modelId is persisted);
//   2. the model its STYLE recommends;
//   3. the first video model, which is a guess.
function initialModelId(shot: Shot, videoModels: CatalogVideoModel[]): string {
  const has = (id: string | undefined) => id !== undefined && videoModels.some((m) => m.id === id)
  if (has(shot.modelId ?? undefined)) return shot.modelId as string
  // resolveBuiltinStyle, not STYLE_PRESETS[id]: styleId is an open string now
  // (ADR style-studio D1), so a shot may legitimately hold a USER style id that
  // this table has never heard of. That resolves to null — no recommendation,
  // fall through to the next-best guess — instead of an undefined lookup.
  const recommended = shot.promptPreset?.styleId
    ? resolveBuiltinStyle(shot.promptPreset.styleId)?.recommendedModelId
    : undefined
  if (has(recommended)) return recommended as string
  return videoModels[0]?.id ?? ''
}

export function ShotInspector({
  filmId,
  shot,
  filmAspect,
  videoModels,
  ttsModel,
  entities,
  startMs,
  isVoiced,
}: ShotInspectorProps) {
  const { t } = useTranslation()
  const update = useUpdateShot()
  const generate = useGenerateShotClip()
  const voiceover = useGenerateVoiceover()
  const clip = useShotGeneration(shot.generationId)

  const voices = ttsModel?.voices ?? []
  const [openPanel, setOpenPanel] = useState<DockPanel | null>(null)
  const [isModelOpen, setIsModelOpen] = useState(false)
  // Manual prompt height. null = AUTO (field-sizing-content grows with the
  // text); a number = the user took over via the TOP-edge grip. The dock is
  // pinned to the viewport bottom, so growth travels UP — which is why the
  // grip lives on the top edge and dragging UP means "bigger" (native
  // resize-y grew by dragging DOWN, exactly the wrong direction here).
  const [promptHeight, setPromptHeight] = useState<number | null>(null)
  const [promptDrag, setPromptDrag] = useState<{ y: number; height: number } | null>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)

  const clampPromptH = (px: number) => Math.min(MAX_PROMPT_H, Math.max(MIN_PROMPT_H, px))
  // The height the grip is standing on right now: the manual value if set,
  // else the auto-sized element's real height (so the first drag starts from
  // what the user sees, not from a constant). `||` (not `??`): a not-yet-laid-
  // out element measures 0, and 0 is as useless as undefined here. Only called
  // from EVENT HANDLERS — reading a ref during render is a hooks violation.
  const livePromptHeight = () => promptHeight ?? (promptRef.current?.offsetHeight || MIN_PROMPT_H)

  const handlePromptGripKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Top edge: up = the edge travels up = the field grows
    if (event.key === 'ArrowUp') setPromptHeight(clampPromptH(livePromptHeight() + PROMPT_STEP))
    else if (event.key === 'ArrowDown')
      setPromptHeight(clampPromptH(livePromptHeight() - PROMPT_STEP))
    else return
    event.preventDefault()
  }

  const handlePromptDragStart = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setPromptDrag({ y: event.clientY, height: livePromptHeight() })
  }

  const handlePromptDragMove = (event: PointerEvent<HTMLDivElement>) => {
    if (promptDrag === null) return
    // Pointer moving UP (smaller clientY) grows the field — the edge follows
    // the finger 1:1, same delta math as the timeline's separator.
    setPromptHeight(clampPromptH(promptDrag.height + (promptDrag.y - event.clientY)))
  }

  const handlePromptDragEnd = () => setPromptDrag(null)
  const [prompt, setPrompt] = useState(shot.prompt)
  const [preset, setPreset] = useState<PresetDraft>(presetToDraft(shot.promptPreset))
  const [modelId, setModelId] = useState(() => initialModelId(shot, videoModels))
  const [seconds, setSeconds] = useState(String(nearestSeconds(shot.durationMs)))
  const [transition, setTransition] = useState<Transition>(shot.transition)
  const [transitionMs, setTransitionMs] = useState(String(shot.transitionMs || 500))
  const [hasTitle, setHasTitle] = useState(shot.title !== null)
  const [titleText, setTitleText] = useState(shot.title?.text ?? '')
  const [titlePosition, setTitlePosition] = useState<TitlePosition>(shot.title?.position ?? 'center')
  const [hasVoice, setHasVoice] = useState(shot.voiceover !== null)
  const [voiceText, setVoiceText] = useState(shot.voiceover?.text ?? '')
  const [voiceId, setVoiceId] = useState(shot.voiceover?.voice ?? voices[0] ?? '')
  // Native generation audio — the model's OWN soundtrack, not the voiceover.
  // A paid capability on 'switchable' models (the API charges the with-audio
  // price), free-but-always-there on Wan 2.7, absent elsewhere.
  const [audioOn, setAudioOn] = useState(shot.audio)
  // The shot's CAST. Held as a draft like everything else here, and DERIVED down
  // to the live set at save/generate: a mapping whose `[[eN]]` token the user has
  // since deleted from the prompt is not a tag any more.
  const [cast, setCast] = useState<EntityRef[]>(shot.entityRefs)

  const addCharacter = (entityId: string) => {
    const placeholder = nextPlaceholder(cast)
    // The token goes into the TEXT — that is where a tag lives. The user can move
    // it, or delete it to untag, and no separate bookkeeping has to notice.
    setPrompt((text) => `${text}${text && !text.endsWith(' ') ? ' ' : ''}${entityPlaceholderToken(placeholder)}`)
    setCast((refs) => [...refs, { placeholder, entityId }])
  }

  const removeCharacter = (placeholder: string) => {
    setPrompt((text) => text.replace(entityPlaceholderToken(placeholder), '').replace(/\s{2,}/g, ' ').trim())
    setCast((refs) => refs.filter((ref) => ref.placeholder !== placeholder))
  }

  const model = videoModels.find((m) => m.id === modelId)
  const isBusy = update.isPending || generate.isPending
  const canGenerate = prompt.trim().length >= 2 && model !== undefined && !isBusy
  // The exact positive prompt the server will build — shown (in the expand
  // drawer) so the preset choice is legible before spending a credit.
  // applyPromptPreset no longer looks the style up itself (ADR style-studio D3),
  // so the hint has to resolve it the way the server will. The client half of
  // the registry is the builtin table; a USER style resolves to null here and
  // its fragment is simply missing from the preview — the server still applies
  // it. Fixing that needs the async styles list, which is the picker migration.
  const composedHint = applyPromptPreset(
    prompt,
    hasAnyPreset(preset) ? draftToPreset(preset) : undefined,
    (preset.styleId ? resolveBuiltinStyle(preset.styleId) : null) ?? undefined,
  ).positivePrompt

  const buildVoiceover = () =>
    hasVoice && voiceText.trim() && voiceId ? { text: voiceText.trim(), voice: voiceId } : null

  // Defaults to the composer's live prompt; the SOFTENED text is passed in when
  // the content_blocked retry regenerates against a rewrite (see generateWithPrompt).
  const buildPatch = (promptText: string = prompt): UpdateShotInput => ({
    prompt: promptText.trim(),
    promptPreset: hasAnyPreset(preset) ? draftToPreset(preset) : null,
    // Only the LIVE cast: derived from the text, one source of truth.
    entityRefs: deriveEntityRefs(promptText, cast),
    modelId: modelId || null,
    durationMs: Number(seconds) * 1000,
    transition,
    transitionMs: transition === 'crossfade' ? Number(transitionMs) : 0,
    title: hasTitle && titleText.trim() ? { text: titleText.trim(), position: titlePosition } : null,
    voiceover: buildVoiceover(),
    // Persist the INTENT even if the current model cannot honour it — the flag
    // only reaches a generation request through composeShotClipInput, which
    // re-checks the model's capability (a stale true must never 400 a request
    // or double a price on a model that cannot sing).
    audio: audioOn,
  })

  const handleSave = () => update.mutate({ filmId, shotId: shot.id, input: buildPatch() })

  // The newest failure across the three mutations this dock drives. Generate is
  // checked first because it is the one that spends credits.
  const failure = generate.error ?? voiceover.error ?? update.error
  const actionErrorCode =
    failure instanceof ApiClientError ? failure.code : failure ? 'internal_error' : null

  // Voicing charges credits against the line the user is LOOKING AT, so the
  // draft is saved first. `isVoicing` spans BOTH legs of that chain (PATCH →
  // voice) — a double-click between them would be a double charge.
  const [isVoicing, setIsVoicing] = useState(false)

  const handleVoice = () => {
    const line = buildVoiceover()
    if (!line || !ttsModel || isVoicing) return
    setIsVoicing(true)
    update.mutate(
      { filmId, shotId: shot.id, input: buildPatch() },
      {
        onSuccess: () =>
          voiceover.mutate(
            { filmId, shotId: shot.id, modelId: ttsModel.id, voiceover: line, startMs },
            { onSettled: () => setIsVoicing(false) },
          ),
        onError: () => setIsVoicing(false),
      },
    )
  }

  // Save first (so prompt/preset are persisted), then generate against the
  // freshly-saved draft; generate's own PATCH only sets generationId. Takes an
  // explicit prompt so the soften/retry path can regenerate against the REWRITE
  // rather than the (still-blocked) composer text.
  const generateWithPrompt = (promptText: string) => {
    if (!model) return
    update.mutate(
      { filmId, shotId: shot.id, input: buildPatch(promptText) },
      {
        onSuccess: () => {
          const draftShot: Shot = {
            ...shot,
            prompt: promptText.trim(),
            promptPreset: hasAnyPreset(preset) ? draftToPreset(preset) : null,
            // The LIVE cast — same derivation as buildPatch. Without this the
            // clip would generate against the shot as it was BEFORE this edit.
            entityRefs: deriveEntityRefs(promptText, cast),
            durationMs: Number(seconds) * 1000,
            // The audio draft too: composeShotClipInput reads shot.audio, and
            // generating from the pre-edit value would bill the wrong price.
            audio: audioOn,
          }
          generate.mutate({ filmId, shot: draftShot, model, filmAspect })
        },
      },
    )
  }

  const handleGenerate = () => generateWithPrompt(prompt)

  // The content_blocked recovery, fed to the failure toast's action: soften the
  // blocked prompt, mirror it back into the composer, then regenerate against
  // the rewrite. Degrades to a manual-edit toast if the enhance endpoint is
  // absent — never a dead click, never a raw error, never a surprise charge.
  const handleSoftenRetry = createSoftenRetry({
    text: prompt,
    t,
    onSoftened: (softened) => {
      setPrompt(softened)
      generateWithPrompt(softened)
    },
  })

  // Raise a toast the FIRST time this shot's polled clip is seen `failed` — the
  // attention-grabber the quiet inline ShotClipStatus line (below) cannot be.
  // content_blocked carries the soften action; dedupe guarantees ONE per clip.
  useShotFailureToast({ generation: clip.data, onSoften: handleSoftenRetry })

  const togglePanel = (panel: DockPanel) => setOpenPanel((prev) => (prev === panel ? null : panel))

  const toggleVoicePanel = () => {
    // Opening the voice drawer also ARMS the line (hasVoice) — the user clicked
    // a mic, not a settings gear; showing a second "enable" pill first would be
    // a hoop. Closing the drawer does NOT disarm: the line stays in the draft.
    if (openPanel !== 'voice' && !hasVoice) setHasVoice(true)
    togglePanel('voice')
  }

  return (
    // The composer: since v7 it is a plain flow element inside FilmEditor's
    // bottom WORKBENCH (composer above the tracks) — the editor column owns the
    // viewport pinning now, so the fixed shell and its z/clearance games are
    // gone. Opaque steel: the prompt must stay readable over anything.
    <section
      aria-label={t('cinema.inspector.title')}
      className="flex w-full flex-col rounded-2xl border border-white/10 bg-steel"
    >
        {/* Drawer — one panel at a time above the prompt, scrolling inside
            itself past 40svh so the dock never swallows the stage */}
        {openPanel !== null ? (
          <div className="max-h-[40svh] overflow-y-auto border-b border-white/10 p-3">
            {/* The attach drawer holds BOTH reference affordances, sharing the
                budget of 5: ShotCastField TAGS a known character; below it
                ShotReferenceImages attaches an ARBITRARY picture (click / drop /
                paste). entityRefCount is the LIVE tag count (derived from the
                prompt, same as ShotCastField shows), so the two controls agree on
                how much of the budget is spent. */}
            {openPanel === 'cast' ? (
              <div className="flex flex-col gap-4">
                <InspectorSection legend={t('cinema.cast.title')}>
                  <ShotCastField
                    entities={entities}
                    prompt={prompt}
                    cast={cast}
                    onAdd={addCharacter}
                    onRemove={removeCharacter}
                    modelSupportsReferences={Boolean(model?.referenceMode)}
                  />
                </InspectorSection>
                <InspectorSection legend={t('cinema.shotRef.title')}>
                  <ShotReferenceImages
                    filmId={filmId}
                    shotId={shot.id}
                    references={shot.referenceImages}
                    entityRefCount={deriveEntityRefs(prompt, cast).length}
                    modelSupportsReferences={Boolean(model?.referenceMode)}
                  />
                </InspectorSection>
              </div>
            ) : null}

            {openPanel === 'voice' && ttsModel ? (
              <ShotVoiceoverField
                isEnabled={hasVoice}
                onToggle={() => setHasVoice((prev) => !prev)}
                text={voiceText}
                onTextChange={setVoiceText}
                voice={voiceId}
                onVoiceChange={setVoiceId}
                voices={voices}
                credits={ttsModel.credits}
                isVoiced={isVoiced}
                onGenerate={handleVoice}
                isGenerating={isVoicing}
              />
            ) : null}

            {openPanel === 'more' ? (
              <div className="flex flex-col gap-4">
                {/* Look: the four structured preset axes (server-composed) */}
                <InspectorSection legend={t('cinema.inspector.sections.look')}>
                  <PresetPickers
                    value={preset}
                    onChange={(patch) => setPreset((prev) => ({ ...prev, ...patch }))}
                  />
                </InspectorSection>

                {/* Clip mechanics that are NOT everyday dials (model/duration
                    live on the toolbar): how the shot transitions in */}
                <InspectorSection legend={t('cinema.inspector.sections.clip')}>
                  <div className="grid grid-cols-2 gap-2">
                    <Select<Transition>
                      label={t('cinema.inspector.transition')}
                      options={transitionSchema.options.map((value) => ({
                        value,
                        label: t(`cinema.transition.${value}`),
                      }))}
                      value={transition}
                      onChange={setTransition}
                    />
                    {/* The length only exists for a crossfade — never a dead control */}
                    {transition === 'crossfade' ? (
                      <Select
                        label={t('cinema.inspector.transitionMs')}
                        options={CROSSFADE_MS.map((ms) => ({ value: String(ms), label: `${ms} ms` }))}
                        value={transitionMs}
                        onChange={setTransitionMs}
                      />
                    ) : null}
                  </div>
                </InspectorSection>

                {/* Title card: optional overlay, disclosed by its own toggle */}
                <InspectorSection legend={t('cinema.inspector.sections.title')}>
                  <ShotTitleField
                    isEnabled={hasTitle}
                    onToggle={() => setHasTitle((prev) => !prev)}
                    text={titleText}
                    onTextChange={setTitleText}
                    position={titlePosition}
                    onPositionChange={setTitlePosition}
                  />
                </InspectorSection>

                {/* The composed prompt the model will actually receive */}
                {composedHint ? (
                  <p className="rounded-lg bg-abyss px-3 py-2 text-xs text-mist-dim">
                    <span className="text-mist-dim/70">{t('cinema.inspector.willSee')} </span>
                    {composedHint}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* The prompt's resize grip, on the TOP edge (v6.2): the dock is pinned
            to the viewport bottom, so a bigger field can only grow UPWARD —
            native resize-y grew by dragging DOWN, exactly the wrong direction,
            which is why it is gone. Drag up = grow, drag down = shrink, arrows
            mirror it, double-click returns to auto-grow. Same keyboard-operable
            separator anatomy as the timeline's height edge. */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('cinema.inspector.promptResize')}
          aria-valuemin={MIN_PROMPT_H}
          aria-valuemax={MAX_PROMPT_H}
          // State only, never the ref: render must not read the DOM (hooks
          // rule). Until the user takes over, AT hears the auto floor — the
          // first interaction snaps this to the real measured height.
          aria-valuenow={promptHeight ?? MIN_PROMPT_H}
          tabIndex={0}
          onKeyDown={handlePromptGripKeyDown}
          onPointerDown={handlePromptDragStart}
          onPointerMove={handlePromptDragMove}
          onPointerUp={handlePromptDragEnd}
          onPointerCancel={handlePromptDragEnd}
          onDoubleClick={() => setPromptHeight(null)}
          className="group flex h-3 cursor-row-resize touch-none items-center justify-center focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
        >
          <span
            aria-hidden="true"
            className="h-1 w-10 rounded-full bg-white/10 transition-colors duration-200 group-hover:bg-white/25 group-focus-visible:bg-white/25"
          />
        </div>

        {/* The prompt — the dock's whole face, as an iOS-glass plate: the kit's
            GLASS_SURFACE gives the translucent white wash, the backdrop
            blur/saturate, the bright specular TOP edge (the no-gradient
            "reflection") and the inner glass ring — one recipe with Card/Modal,
            so the materials cannot drift. Two sizing modes: AUTO
            (field-sizing-content follows the text, capped 30svh) until the user
            takes over via the grip above — then the explicit height wins and
            the auto classes step aside so they cannot fight it. */}
        {/* The field is `relative` so the AI-enhance affordance can dock in its
            bottom-right corner (Higgsfield's arrangement). pr-12 reserves the
            corner so a long prompt never runs under the icon; the enhance/undo
            is just another setPrompt, so the resize grip and cast tokens are
            untouched. */}
        <div className="relative mx-2">
          <textarea
            rows={1}
            ref={promptRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={t('cinema.inspector.promptPlaceholder')}
            aria-label={t('cinema.inspector.prompt')}
            style={promptHeight !== null ? { height: `${promptHeight}px` } : undefined}
            className={`${GLASS_SURFACE} ${
              promptHeight === null ? 'field-sizing-content max-h-[30svh]' : 'resize-none'
            } w-full min-h-10 rounded-xl border px-3 py-2.5 pr-12 text-sm text-mist placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none`}
          />
          <div className="absolute bottom-2 right-2">
            <EnhanceButton value={prompt} onEnhanced={setPrompt} />
          </div>
        </div>

        {/* Status strip: the clip's lifecycle + the newest action failure, keyed
            off the machine code — never raw server text (design.md §9) */}
        {shot.generationId !== null || actionErrorCode !== null ? (
          <div className="flex flex-col gap-1 px-4 pb-1.5">
            <ShotClipStatus
              status={clip.data?.status}
              progress={clip.data?.progress ?? null}
              hasClip={shot.generationId !== null}
            />
            {actionErrorCode !== null ? (
              <p role="alert" className="text-xs text-glow-red">
                {t(errorCodeMessageKey(actionErrorCode))}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Toolbar: quick pickers + icon toggles left, actions right. Label-less
            since the v6.1 pass (owner request): the model chip and the slider
            carry aria-labels for AT, but the visible captions are gone — the
            controls explain themselves and the row stays one line tall. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Model trigger: a chip wearing the CURRENT choice (brand mark +
                name); the real decision surface is the big ModelPickerModal —
                a model is a purchase, and a purchase deserves the full table
                (logo, tier, provider, description, tariff), not a rail Select. */}
            <button
              type="button"
              aria-label={t('cinema.inspector.model')}
              onClick={() => setIsModelOpen(true)}
              className="flex min-h-8 max-w-44 items-center gap-2 rounded-full border border-white/10 bg-steel px-2.5 text-left text-xs text-mist transition-colors duration-200 hover:bg-ridge focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              <span className="grid size-4 shrink-0 place-items-center text-mist">
                <ProviderMark provider={presentationFor(modelId).provider} className="size-4" />
              </span>
              <span className="min-w-0 truncate">
                {model ? model.name : t('cinema.inspector.noModel')}
              </span>
              {/* Decorative chevron — same voice as the account menu trigger */}
              <span aria-hidden="true" className="text-[10px] text-mist-dim">
                ▾
              </span>
            </button>

            {/* Duration: a stepped range over the editorial stops (2/3/5/8/10s),
                not an option menu (owner request). The INDEX is the slider value
                so every notch is a real, priceable stop; aria-valuetext speaks
                the seconds, the chip beside it shows them. */}
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min={0}
                max={SHOT_DURATIONS_SECONDS.length - 1}
                step={1}
                value={Math.max(0, SHOT_DURATIONS_SECONDS.findIndex((s) => String(s) === seconds))}
                onChange={(event) => {
                  const stop = SHOT_DURATIONS_SECONDS[Number(event.target.value)]
                  if (stop !== undefined) setSeconds(String(stop))
                }}
                aria-label={t('cinema.inspector.duration')}
                aria-valuetext={t('cinema.shot.seconds', { count: Number(seconds) })}
                className="w-24 accent-glow-amber"
              />
              <span className="w-8 shrink-0 text-xs text-mist">
                {t('cinema.shot.seconds', { count: Number(seconds) })}
              </span>
            </div>

            {/* Native generation audio — a STATE toggle, not a drawer opener:
                amber = this clip will be generated with the model's own
                soundtrack (and the film keeps it). The label carries the price
                (×2 on switchable models — money never hides); disabled with an
                explanatory title when the model has no audio at all. */}
            <button
              type="button"
              aria-pressed={audioOn}
              aria-label={
                model?.nativeAudio === 'switchable'
                  ? t('cinema.inspector.audioX2')
                  : t('cinema.inspector.audio')
              }
              title={model?.nativeAudio ? undefined : t('cinema.inspector.audioNone')}
              disabled={!model?.nativeAudio}
              onClick={() => setAudioOn((prev) => !prev)}
              className={`${TOOL} disabled:cursor-not-allowed disabled:opacity-40 ${
                audioOn && model?.nativeAudio ? TOOL_ON : TOOL_OFF
              }`}
            >
              <SpeakerIcon />
            </button>

            {/* Icon toggles: each opens its drawer; amber while open (the
                selection tint). aria-pressed carries the state for AT. */}
            <button
              type="button"
              aria-pressed={openPanel === 'cast'}
              aria-label={t('cinema.cast.title')}
              onClick={() => togglePanel('cast')}
              className={`${TOOL} ${openPanel === 'cast' ? TOOL_ON : TOOL_OFF}`}
            >
              <PaperclipIcon />
            </button>
            {ttsModel ? (
              <button
                type="button"
                aria-pressed={openPanel === 'voice'}
                aria-label={t('cinema.voiceover.toggle')}
                onClick={toggleVoicePanel}
                className={`${TOOL} ${openPanel === 'voice' ? TOOL_ON : TOOL_OFF}`}
              >
                <MicIcon />
              </button>
            ) : null}
            <button
              type="button"
              aria-pressed={openPanel === 'more'}
              aria-label={t('cinema.inspector.more')}
              onClick={() => togglePanel('more')}
              className={`${TOOL} ${openPanel === 'more' ? TOOL_ON : TOOL_OFF}`}
            >
              <ExpandIcon />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              isLoading={update.isPending && !generate.isPending}
            >
              {t('cinema.inspector.save')}
            </Button>
            <Button size="sm" onClick={handleGenerate} isLoading={isBusy} disabled={!canGenerate}>
              <SparkIcon />
              {t('cinema.inspector.generate')}
            </Button>
          </div>
        </div>

        {/* The big model picker behind the trigger chip above */}
        <ModelPickerModal
          isOpen={isModelOpen}
          onClose={() => setIsModelOpen(false)}
          models={videoModels}
          value={modelId}
          onChange={setModelId}
        />
    </section>
  )
}
