// apps/web/src/modules/Canvas/components/ImageNode.tsx
// The image mini-composer node, and the shared body VideoNode reuses. Reads
// ITS row from the store by id (React Flow passes only id + data), renders the
// 4 states off the shown version's poll, and submits through useRunNode.
// Catalog models arrive as node DATA from the route seam — this module never
// imports modules/Generator.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AspectRatio, CanvasNodeConfig } from '@opencreate/contracts'
import { Button, Select, Skeleton, WELL_SURFACE } from 'shared/ui'
import type { SelectOption } from 'shared/ui'
import type { CanvasModelOption, NodeRunStatus } from '../model/types'
import { useCanvasStore } from '../model/canvasStore'
import { buildRunInput, useNodeGeneration, useRunNode } from '../model/useNodeGeneration'
import { NodeShell } from './NodeShell'
import { VersionStrip } from './VersionStrip'

export type GenerationNodeData = { models: CanvasModelOption[] }

// What one run of this model costs right now. Image models are flat; video
// models bill per duration, and the per-duration table is the number the
// server will actually charge.
function creditsFor(model: CanvasModelOption, duration: number | undefined): number {
  if (duration === undefined) return model.credits
  return model.creditsByDuration?.[String(duration)] ?? model.credits
}

export function ImageNode({ id, data }: { id: string; data: GenerationNodeData }) {
  return <GenerationNode id={id} data={data} kind="image" />
}

// Shared body for image/video — exported for VideoNode, never from index.ts.
export function GenerationNode({
  id,
  data,
  kind,
}: {
  id: string
  data: GenerationNodeData
  kind: 'image' | 'video'
}) {
  const { t } = useTranslation()
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === id))
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const updateNodeConfig = useCanvasStore((s) => s.updateNodeConfig)
  const run = useRunNode(id)

  // Which version shows: null = follow the latest, so a fresh run is always
  // what the card displays. Stepping back parks the index until the user
  // generates again (the submit handler clears it — never an effect).
  const [versionIndex, setVersionIndex] = useState<number | null>(null)
  const history = node?.generationIds ?? []
  const shownIndex = versionIndex ?? history.length - 1
  const shownId = history[shownIndex] ?? null
  const poll = useNodeGeneration(shownId)
  const generation = poll.data

  if (!node) return null
  const models = data.models.filter((m) => m.type === kind)
  const model = models.find((m) => m.id === node.config.modelId)
  const runInput = buildRunInput(node, nodes, edges)
  const duration = node.config.duration ?? model?.durationOptions?.[0]

  const status: NodeRunStatus =
    generation?.status === 'processing'
      ? 'processing'
      : generation?.status === 'succeeded'
        ? 'succeeded'
        : generation?.status === 'failed'
          ? 'failed'
          : 'idle'

  // Picking a model may invalidate the chosen aspect/duration (models differ),
  // so the config is reconciled HERE, in the event handler, and persisted with
  // the same edit — never repaired later in an effect.
  const handleModelChange = (modelId: string) => {
    const next = models.find((m) => m.id === modelId)
    const patch: Partial<CanvasNodeConfig> = { modelId }
    if (next) {
      if (!node.config.aspectRatio || !next.aspectRatios.includes(node.config.aspectRatio)) {
        patch.aspectRatio = next.aspectRatios[0] ?? '1:1'
      }
      if (kind === 'video') {
        const durations = next.durationOptions ?? []
        if (node.config.duration === undefined || !durations.includes(node.config.duration)) {
          patch.duration = durations[0] ?? 5
        }
      }
    }
    updateNodeConfig(id, patch)
  }

  const submit = () => {
    if (!runInput) return
    // A new run becomes the shown version; a parked index would hide it.
    setVersionIndex(null)
    run.mutate(runInput)
  }

  // ONE price on the card, and it is the price that will be billed: the model
  // control carries it (Select's `meta` is documented for exactly this), priced
  // at the CURRENT duration so a video model never advertises its cheapest
  // clip while the node is set to a longer one.
  const modelOptions: SelectOption<string>[] = models.map((m) => ({
    value: m.id,
    label: m.name,
    caption: m.providerLabel,
    meta: t('generator.model.creditsShort', { credits: creditsFor(m, duration) }),
  }))
  const aspectOptions: SelectOption<string>[] = (model?.aspectRatios ?? []).map((ratio) => ({
    value: ratio,
    label: ratio,
  }))
  const durationOptions: SelectOption<string>[] = (model?.durationOptions ?? []).map((seconds) => ({
    value: String(seconds),
    label: t('generator.duration.seconds', { count: seconds }),
  }))

  return (
    <NodeShell
      title={t(`canvas.kind.${kind}`)}
      status={status}
      hasInput
      // Video is terminal in the MVP: a clip cannot feed i2i or i2v.
      hasOutput={kind === 'image'}
    >
      {/* Preview — the 4 states. The plate keeps its box in every state so
          wires don't jump when the first render lands. */}
      {status === 'processing' ? (
        <Skeleton className="mb-2 aspect-square w-full rounded-lg" />
      ) : status === 'failed' ? (
        <div
          role="alert"
          className={`mb-2 flex flex-col items-start gap-2 rounded-lg border border-glow-red/40 p-2 text-[11px] text-mist ${WELL_SURFACE}`}
        >
          <span>{generation?.errorMessage ?? t('canvas.node.failedPreview')}</span>
          {/* Calm recovery (ErrorState precedent): the amber ghost pill, not a
              red one — red stays the failure STATUS, not the way out of it. */}
          <Button variant="ghost" size="sm" className="nodrag" onClick={submit} disabled={!runInput}>
            {t('canvas.node.retry')}
          </Button>
        </div>
      ) : status === 'succeeded' && generation?.mediaUrls[0] ? (
        kind === 'video' ? (
          <video
            src={generation.mediaUrls[0]}
            controls
            muted
            playsInline
            className="nodrag mb-2 w-full rounded-lg"
          />
        ) : (
          <img
            src={generation.mediaUrls[0]}
            alt={node.config.prompt ?? t(`canvas.kind.${kind}`)}
            className="mb-2 w-full rounded-lg"
          />
        )
      ) : (
        <div
          className={`mb-2 flex aspect-square w-full items-center justify-center rounded-lg border text-[11px] text-mist-dim ${WELL_SURFACE}`}
        >
          {t('canvas.node.idlePreview')}
        </div>
      )}

      <VersionStrip count={history.length} index={shownIndex} onStep={setVersionIndex} />

      {/* nodrag: React Flow must not start a canvas drag from a form field */}
      <textarea
        value={node.config.prompt ?? ''}
        onChange={(e) => updateNodeConfig(id, { prompt: e.target.value })}
        placeholder={t('canvas.node.promptPlaceholder')}
        aria-label={t('canvas.node.promptPlaceholder')}
        rows={2}
        className="nodrag mb-2 w-full resize-none rounded-lg border border-white/10 bg-steel px-2 py-1.5 text-xs text-mist transition-colors duration-200 placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none"
      />

      <div className="mb-2 flex flex-col gap-2">
        <Select
          label={t('canvas.node.model')}
          options={modelOptions}
          value={node.config.modelId ?? ''}
          onChange={handleModelChange}
          placeholder={t('canvas.node.modelPlaceholder')}
          panelWidth="wide"
        />
        {/* Aspect (and duration) only appear once a model is chosen — their
            legal values come from that model, not from a global list. */}
        {model ? (
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Select
                label={t('canvas.node.aspect')}
                options={aspectOptions}
                value={node.config.aspectRatio ?? ''}
                onChange={(value) => updateNodeConfig(id, { aspectRatio: value as AspectRatio })}
              />
            </div>
            {kind === 'video' && durationOptions.length > 0 ? (
              <div className="min-w-0 flex-1">
                <Select
                  label={t('canvas.node.duration')}
                  options={durationOptions}
                  value={String(duration ?? '')}
                  onChange={(value) => updateNodeConfig(id, { duration: Number(value) })}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <Button
        size="sm"
        className="nodrag w-full"
        onClick={submit}
        disabled={!runInput || status === 'processing'}
        isLoading={run.isPending}
      >
        {status === 'processing' ? t('canvas.node.generating') : t('canvas.node.generate')}
      </Button>
    </NodeShell>
  )
}
