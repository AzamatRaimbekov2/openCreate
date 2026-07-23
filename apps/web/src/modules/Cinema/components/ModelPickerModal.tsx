// apps/web/src/modules/Cinema/components/ModelPickerModal.tsx
// The composer's model picker as a CARD GALLERY (owner request 2026-07-17):
// three cards to a row, each led by a MINI DEMO — a real clip of that model's
// own output looping silently over the card, the way a person actually decides
// between video models (by watching them, not by reading tier chips).
//
// The demo contract is self-serve: every card renders a <video> pointing at
// `/model-demos/<model-id>.mp4` (a web/public asset — presentation, not API
// data, exactly like the logos and descriptions in modelPresentation). The
// BRANDED PLATE (provider mark on abyss) is always painted underneath, and the
// video fades in over it only when it can actually play — so a model without a
// demo file yet degrades to a clean branded card, and dropping a new mp4 into
// public/model-demos/ lights its card up with zero code changes.
//
// Picking a card commits AND closes — the dialog is a question, not a workspace.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CatalogVideoModel } from '@opencreate/contracts'
import { presentationFor, tariffFor } from 'shared/libs/modelPresentation'
import { Modal, ProviderMark } from 'shared/ui'

export type ModelPickerModalProps = {
  isOpen: boolean
  onClose: () => void
  // Video models offered (from the catalog, via the route seam)
  models: CatalogVideoModel[]
  // The currently chosen model id (amber ring on its card)
  value: string
  // Commit a chosen model id
  onChange: (modelId: string) => void
}

export function ModelPickerModal({ isOpen, onClose, models, value, onChange }: ModelPickerModalProps) {
  const { t } = useTranslation()

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('cinema.inspector.model')} size="lg">
      <ul className="grid max-h-[70svh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
        {models.map((model) => (
          <li key={model.id}>
            <ModelCard
              model={model}
              isSelected={model.id === value}
              onPick={() => {
                onChange(model.id)
                onClose()
              }}
            />
          </li>
        ))}
      </ul>
    </Modal>
  )
}

type ModelCardProps = {
  model: CatalogVideoModel
  isSelected: boolean
  onPick: () => void
}

function ModelCard({ model, isSelected, onPick }: ModelCardProps) {
  const { t } = useTranslation()
  const { provider, descriptionKey } = presentationFor(model.id)
  const tariff = tariffFor(model)
  // The video reveals itself only once it CAN play — until then (and forever,
  // if the demo file is missing or broken) the branded plate is the card face.
  const [isDemoLive, setIsDemoLive] = useState(false)

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onPick}
      // Amber marks the chosen card — the kit's selection language; the whole
      // card is one button, so the demo itself is clickable.
      className={`flex h-full w-full flex-col overflow-hidden rounded-xl border text-left transition-colors duration-200 hover:bg-ridge focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${
        isSelected
          ? 'border-glow-amber/60 bg-white/5 ring-1 ring-glow-amber/40'
          : 'border-white/10'
      }`}
    >
      {/* THE DEMO PLATE — a media well (abyss, like every media surface): the
          provider mark is the resting face, the demo loop fades in over it */}
      <span className="relative block aspect-video w-full shrink-0 overflow-hidden bg-abyss">
        <span
          className={`absolute inset-0 grid place-items-center ${
            isSelected ? 'text-glow-amber' : 'text-mist-dim'
          }`}
        >
          <ProviderMark provider={provider} className="size-10" />
        </span>
        {/* muted+playsInline are what allow autoplay at all; loop makes it a
            living thumbnail, not a player. preload=metadata keeps 12 cards from
            pulling 12 full files the moment the dialog opens. */}
        <video
          src={`/model-demos/${model.id}.mp4`}
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
          onCanPlay={() => setIsDemoLive(true)}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${
            isDemoLive ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {/* Tier chip rides the plate, readable over any footage */}
        <span className="absolute top-1.5 left-1.5 rounded-full border border-white/10 bg-void/70 px-1.5 text-[10px] leading-4 text-portal">
          {t(`generator.tier.${model.tier}`)}
        </span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5 p-3">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-white">{model.name}</span>
          {/* Base tariff, one comparable number per model */}
          <span className="shrink-0 text-xs font-medium text-mist">
            {t('generator.model.tariff', { credits: tariff.credits, dollars: tariff.dollars })}
          </span>
        </span>
        {/* Honest provider attribution — users see what actually runs */}
        <span className="truncate text-xs text-mist-dim">{model.providerLabel}</span>
        <span className="line-clamp-2 text-xs text-mist-dim">{t(descriptionKey)}</span>
      </span>
    </button>
  )
}
