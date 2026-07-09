// apps/web/src/modules/Cinema/components/ShotInspector.tsx
// The selected shot's editor. Local draft state (the parent keys this component
// by shot.id so a new selection re-initialises cleanly — no useEffect sync),
// the structured preset pickers, a video-model picker, duration/transition/title
// controls, a live "what the model will see" hint, and the two actions:
//   Save  → persist the edits (useUpdateShot)
//   Generate → persist, then create+link the clip (useGenerateShotClip)
// Generate is chained through onSuccess (no floating async) so the shot is saved
// before the composed request is built.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AspectRatio, CatalogVideoModel, Shot, TitlePosition, Transition, UpdateShotInput } from '@opencreate/contracts'
import { applyPromptPreset, titlePositionSchema, transitionSchema } from '@opencreate/contracts'
import { Button, Select } from 'shared/ui'
import { useUpdateShot } from '../model/shotsApi'
import { useGenerateShotClip, useShotGeneration } from '../model/shotGeneration'
import { SHOT_DURATIONS_SECONDS, draftToPreset, hasAnyPreset, presetToDraft } from '../model/presetOptions'
import type { PresetDraft } from '../model/presetOptions'
import { PresetPickers } from './PresetPickers'
import { SparkIcon } from './icons'

export type ShotInspectorProps = {
  filmId: string
  // Keyed by shot.id upstream, so this always holds a fresh draft
  shot: Shot
  // The film canvas the generation aspect resolves against
  filmAspect: AspectRatio
  // Video models offered in the model picker (from the catalog)
  videoModels: CatalogVideoModel[]
}

const CROSSFADE_MS = [300, 500, 800] as const

// Snap the shot's stored length to the nearest offered display duration
function nearestSeconds(durationMs: number): number {
  const target = durationMs / 1000
  return SHOT_DURATIONS_SECONDS.reduce(
    (best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best),
    SHOT_DURATIONS_SECONDS[0],
  )
}

export function ShotInspector({ filmId, shot, filmAspect, videoModels }: ShotInspectorProps) {
  const { t } = useTranslation()
  const update = useUpdateShot()
  const generate = useGenerateShotClip()
  const clip = useShotGeneration(shot.generationId)

  const [prompt, setPrompt] = useState(shot.prompt)
  const [preset, setPreset] = useState<PresetDraft>(presetToDraft(shot.promptPreset))
  const [modelId, setModelId] = useState(videoModels[0]?.id ?? '')
  const [seconds, setSeconds] = useState(String(nearestSeconds(shot.durationMs)))
  const [transition, setTransition] = useState<Transition>(shot.transition)
  const [transitionMs, setTransitionMs] = useState(String(shot.transitionMs || 500))
  const [hasTitle, setHasTitle] = useState(shot.title !== null)
  const [titleText, setTitleText] = useState(shot.title?.text ?? '')
  const [titlePosition, setTitlePosition] = useState<TitlePosition>(shot.title?.position ?? 'center')

  const model = videoModels.find((m) => m.id === modelId)
  const isBusy = update.isPending || generate.isPending
  const canGenerate = prompt.trim().length >= 2 && model !== undefined && !isBusy
  // The exact positive prompt the server will build — shown so the preset choice
  // is legible before spending a credit (structured in, composed server-side).
  const composedHint = applyPromptPreset(
    prompt,
    hasAnyPreset(preset) ? draftToPreset(preset) : undefined,
  ).positivePrompt

  const buildPatch = (): UpdateShotInput => ({
    prompt: prompt.trim(),
    promptPreset: hasAnyPreset(preset) ? draftToPreset(preset) : null,
    durationMs: Number(seconds) * 1000,
    transition,
    transitionMs: transition === 'crossfade' ? Number(transitionMs) : 0,
    title: hasTitle && titleText.trim() ? { text: titleText.trim(), position: titlePosition } : null,
  })

  const handleSave = () => update.mutate({ filmId, shotId: shot.id, input: buildPatch() })

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
    <section aria-label={t('cinema.inspector.title')} className="flex flex-col gap-4">
      <h2 className="text-sm text-mist-dim">{t('cinema.inspector.title')}</h2>

      {/* Prompt — the user's own words; the preset stays structured (ADR §3) */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-mist-dim">{t('cinema.inspector.prompt')}</span>
        <textarea
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t('cinema.inspector.promptPlaceholder')}
          className="resize-none rounded-lg border border-white/10 bg-steel px-3 py-2 text-base text-mist transition-colors duration-200 placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none"
        />
      </label>

      <PresetPickers value={preset} onChange={(patch) => setPreset((prev) => ({ ...prev, ...patch }))} />

      {/* Model + duration */}
      <div className="grid grid-cols-2 gap-2">
        <Select
          label={t('cinema.inspector.model')}
          placeholder={t('cinema.inspector.noModel')}
          options={videoModels.map((m) => ({ value: m.id, label: m.name, caption: m.providerLabel }))}
          value={modelId}
          onChange={setModelId}
        />
        <Select
          label={t('cinema.inspector.duration')}
          options={SHOT_DURATIONS_SECONDS.map((s) => ({
            value: String(s),
            label: t('cinema.shot.seconds', { count: s }),
          }))}
          value={seconds}
          onChange={setSeconds}
        />
      </div>

      {/* Transition into this shot (+ its length when crossfading) */}
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
        {transition === 'crossfade' ? (
          <Select
            label={t('cinema.inspector.transitionMs')}
            options={CROSSFADE_MS.map((ms) => ({ value: String(ms), label: `${ms} ms` }))}
            value={transitionMs}
            onChange={setTransitionMs}
          />
        ) : null}
      </div>

      {/* Optional title overlay */}
      <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-3">
        <button
          type="button"
          aria-pressed={hasTitle}
          onClick={() => setHasTitle((prev) => !prev)}
          className={`self-start rounded-full border border-white/10 px-3 py-1 text-xs font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${
            hasTitle ? 'bg-specimen-amber/20 text-lumen-amber' : 'text-mist-dim hover:bg-ridge'
          }`}
        >
          {t('cinema.inspector.titleToggle')}
        </button>
        {hasTitle ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={titleText}
              onChange={(event) => setTitleText(event.target.value)}
              placeholder={t('cinema.inspector.titlePlaceholder')}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-steel px-3 py-2 text-sm text-mist placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none"
            />
            <Select<TitlePosition>
              label={t('cinema.inspector.titlePosition')}
              options={titlePositionSchema.options.map((value) => ({
                value,
                label: t(`cinema.position.${value}`),
              }))}
              value={titlePosition}
              onChange={setTitlePosition}
            />
          </div>
        ) : null}
      </div>

      {/* The composed prompt the model will actually receive */}
      {composedHint ? (
        <p className="rounded-lg bg-abyss px-3 py-2 text-xs text-mist-dim">
          <span className="text-mist-dim/70">{t('cinema.inspector.willSee')} </span>
          {composedHint}
        </p>
      ) : null}

      {/* Live clip status for this shot */}
      <ShotClipStatus
        status={clip.data?.status}
        progress={clip.data?.progress ?? null}
        hasClip={shot.generationId !== null}
      />

      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" onClick={handleSave} isLoading={update.isPending && !generate.isPending}>
          {t('cinema.inspector.save')}
        </Button>
        <Button onClick={handleGenerate} isLoading={isBusy} disabled={!canGenerate}>
          <SparkIcon />
          {t('cinema.inspector.generate')}
        </Button>
      </div>
    </section>
  )
}

// A one-line status under the actions: never color-only — the word carries it.
function ShotClipStatus({
  status,
  progress,
  hasClip,
}: {
  status: 'processing' | 'succeeded' | 'failed' | undefined
  progress: number | null
  hasClip: boolean
}) {
  const { t } = useTranslation()
  if (!hasClip) return null
  if (status === 'processing') {
    return (
      <p role="status" className="text-xs text-glow-amber">
        {t('cinema.shot.generating')}
        {progress !== null ? ` · ${progress}%` : ''}
      </p>
    )
  }
  if (status === 'succeeded') {
    return <p className="text-xs text-glow-green">{t('cinema.shot.ready')}</p>
  }
  if (status === 'failed') {
    return <p role="alert" className="text-xs text-glow-red">{t('cinema.shot.failed')}</p>
  }
  return null
}
