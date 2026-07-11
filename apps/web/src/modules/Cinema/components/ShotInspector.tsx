// apps/web/src/modules/Cinema/components/ShotInspector.tsx
// The selected shot's editor. Local draft state (the parent keys this component
// by shot.id so a new selection re-initialises cleanly — no useEffect sync),
// the structured preset pickers, a video-model picker, duration/transition/title
// controls, a live "what the model will see" hint, and the two actions:
//   Save  → persist the edits (useUpdateShot)
//   Generate → persist, then create+link the clip (useGenerateShotClip)
// Generate is chained through onSuccess (no floating async) so the shot is saved
// before the composed request is built.
//
// v4 shape: a titled glass `Card` living in the sticky inspector rail, and — the
// real fix — the controls are grouped into four labelled <fieldset> sections
// (prompt · look · clip · title card) instead of one undifferentiated column.
// The sub-forms live in their own files so this stays an orchestrator.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AspectRatio,
  CatalogAudioModel,
  CatalogVideoModel,
  Shot,
  TitlePosition,
  Transition,
  UpdateShotInput,
} from '@opencreate/contracts'
import { STYLE_PRESETS, applyPromptPreset } from '@opencreate/contracts'
import { Button, Card } from 'shared/ui'
import { useUpdateShot } from '../model/shotsApi'
import { useGenerateShotClip, useShotGeneration } from '../model/shotGeneration'
import { useGenerateVoiceover } from '../model/voiceoverApi'
import { SHOT_DURATIONS_SECONDS, draftToPreset, hasAnyPreset, presetToDraft } from '../model/presetOptions'
import type { PresetDraft } from '../model/presetOptions'
import { InspectorSection } from './InspectorSection'
import { PresetPickers } from './PresetPickers'
import { ShotClipFields } from './ShotClipFields'
import { ShotClipStatus } from './ShotClipStatus'
import { ShotTitleField } from './ShotTitleField'
import { ShotVoiceoverField } from './ShotVoiceoverField'
import { SparkIcon } from './icons'

export type ShotInspectorProps = {
  filmId: string
  // Keyed by shot.id upstream, so this always holds a fresh draft
  shot: Shot
  // The film canvas the generation aspect resolves against
  filmAspect: AspectRatio
  // Video models offered in the model picker (from the catalog)
  videoModels: CatalogVideoModel[]
  // The tts model, if the catalog offers one. undefined → the voice group hides.
  ttsModel: CatalogAudioModel | undefined
  // Where this shot starts on the timeline, in ms — the offset a generated voice
  // track is filed at, so the line plays under the beat that speaks it. Computed
  // by the editor (it is the one that knows every shot's duration).
  startMs: number
  // Whether a voiceover track already exists for this shot.
  isVoiced: boolean
}

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
//   2. the model its STYLE recommends (STYLE_PRESETS has carried a
//      recommendedModelId since the preset tables landed, and nothing read it —
//      a Disney render defaulting to the fastest, cheapest model was never right);
//   3. the first video model, which is a guess.
// Before shot.modelId existed this function was step 3 alone, which is why
// re-selecting a shot forgot which model produced its clip.
function initialModelId(shot: Shot, videoModels: CatalogVideoModel[]): string {
  const has = (id: string | undefined) => id !== undefined && videoModels.some((m) => m.id === id)
  if (has(shot.modelId ?? undefined)) return shot.modelId as string
  const recommended = shot.promptPreset?.styleId
    ? STYLE_PRESETS[shot.promptPreset.styleId].recommendedModelId
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
  startMs,
  isVoiced,
}: ShotInspectorProps) {
  const { t } = useTranslation()
  const update = useUpdateShot()
  const generate = useGenerateShotClip()
  const voiceover = useGenerateVoiceover()
  const clip = useShotGeneration(shot.generationId)

  const voices = ttsModel?.voices ?? []
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

  const model = videoModels.find((m) => m.id === modelId)
  const isBusy = update.isPending || generate.isPending
  const canGenerate = prompt.trim().length >= 2 && model !== undefined && !isBusy
  // The exact positive prompt the server will build — shown so the preset choice
  // is legible before spending a credit (structured in, composed server-side).
  const composedHint = applyPromptPreset(
    prompt,
    hasAnyPreset(preset) ? draftToPreset(preset) : undefined,
  ).positivePrompt

  const buildVoiceover = () =>
    hasVoice && voiceText.trim() && voiceId ? { text: voiceText.trim(), voice: voiceId } : null

  const buildPatch = (): UpdateShotInput => ({
    prompt: prompt.trim(),
    promptPreset: hasAnyPreset(preset) ? draftToPreset(preset) : null,
    // Persist the model choice. It used to live and die with this component.
    modelId: modelId || null,
    durationMs: Number(seconds) * 1000,
    transition,
    transitionMs: transition === 'crossfade' ? Number(transitionMs) : 0,
    title: hasTitle && titleText.trim() ? { text: titleText.trim(), position: titlePosition } : null,
    voiceover: buildVoiceover(),
  })

  const handleSave = () => update.mutate({ filmId, shotId: shot.id, input: buildPatch() })

  // Voicing charges credits against the line the user is LOOKING AT, so the draft
  // is saved first — otherwise an edited line would be paid for at its old text.
  //
  // `isVoicing` spans BOTH legs of that chain. Deriving the button's busy state
  // from voiceover.isPending alone would leave it live during the PATCH, and a
  // double-click there is a double charge.
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
  // freshly-saved draft; generate's own PATCH only sets generationId.
  const handleGenerate = () => {
    if (!model) return
    update.mutate(
      { filmId, shotId: shot.id, input: buildPatch() },
      {
        onSuccess: () => {
          const draftShot: Shot = {
            ...shot,
            prompt: prompt.trim(),
            promptPreset: hasAnyPreset(preset) ? draftToPreset(preset) : null,
            durationMs: Number(seconds) * 1000,
          }
          generate.mutate({ filmId, shot: draftShot, model, filmAspect })
        },
      },
    )
  }

  return (
    <Card title={t('cinema.inspector.title')}>
      <div className="flex flex-col gap-5">
        {/* 1 — Prompt: the user's own words; the preset stays structured (ADR §3).
            The legend names the group and the lone control inside it, so the
            textarea borrows it rather than repeating the word twice. */}
        <InspectorSection legend={t('cinema.inspector.prompt')}>
          <textarea
            rows={3}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={t('cinema.inspector.promptPlaceholder')}
            aria-label={t('cinema.inspector.prompt')}
            className="resize-none rounded-lg border border-white/10 bg-steel px-3 py-2 text-base text-mist transition-colors duration-200 placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none"
          />
          {/* The composed prompt the model will actually receive */}
          {composedHint ? (
            <p className="rounded-lg bg-abyss px-3 py-2 text-xs text-mist-dim">
              <span className="text-mist-dim/70">{t('cinema.inspector.willSee')} </span>
              {composedHint}
            </p>
          ) : null}
        </InspectorSection>

        {/* 2 — Look: the four structured preset axes */}
        <InspectorSection legend={t('cinema.inspector.sections.look')}>
          <PresetPickers
            value={preset}
            onChange={(patch) => setPreset((prev) => ({ ...prev, ...patch }))}
          />
        </InspectorSection>

        {/* 3 — Clip: what generates it, how long it runs, how it enters */}
        <InspectorSection legend={t('cinema.inspector.sections.clip')}>
          <ShotClipFields
            videoModels={videoModels}
            modelId={modelId}
            onModelChange={setModelId}
            seconds={seconds}
            onSecondsChange={setSeconds}
            transition={transition}
            onTransitionChange={setTransition}
            transitionMs={transitionMs}
            onTransitionMsChange={setTransitionMs}
          />
        </InspectorSection>

        {/* 4 — Title card: optional overlay, disclosed by its own toggle */}
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

        {/* 5 — Voice: the line this beat's character speaks. Its own action (and
            its own charge) — voicing a line is not part of generating the picture,
            and pretending otherwise would hide a second cost behind one button. */}
        {ttsModel ? (
          <InspectorSection legend={t('cinema.inspector.sections.voice')}>
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
          </InspectorSection>
        ) : null}

        {/* Actions sit against the closing hairline: status, then Save/Generate */}
        <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
          <ShotClipStatus
            status={clip.data?.status}
            progress={clip.data?.progress ?? null}
            hasClip={shot.generationId !== null}
          />
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={handleSave}
              isLoading={update.isPending && !generate.isPending}
            >
              {t('cinema.inspector.save')}
            </Button>
            <Button onClick={handleGenerate} isLoading={isBusy} disabled={!canGenerate}>
              <SparkIcon />
              {t('cinema.inspector.generate')}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
