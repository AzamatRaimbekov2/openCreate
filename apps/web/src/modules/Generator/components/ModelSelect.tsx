// apps/web/src/modules/Generator/components/ModelSelect.tsx
// The custom, on-brand model select: a fully self-contained listbox (NOT a
// native <select>) that shows EVERY catalog model with a provider logo, its
// tariff (credits + the $0.01/credit equivalent) and a localized description,
// grouped into Images / Video. It owns the catalog query and renders the four
// UI states; selection is delegated up via selectedId/onSelect so it drops into
// both the GeneratorPanel sheet and the ChatComposer glass capsule.
//
// WHY a bespoke listbox: a native <option> is text-only — it cannot carry the
// logo, tier chip and description the owner asked for. The panel is an OPAQUE
// steel surface (never translucent) so it stays readable over ANY backdrop,
// including the composer's frosted glass. No gradients anywhere (owner rule).
import { useTranslation } from 'react-i18next'
import type { CatalogModel } from '@opencreate/contracts'
import { Skeleton } from 'shared/ui'
import { useCatalog } from '../model/catalogApi'
import { useModelListbox } from '../hooks/useModelListbox'
import { presentationFor, tariffFor } from '../model/modelPresentation'
import { ModelSelectOption } from './ModelSelectOption'
import { ProviderMark } from './ProviderMark'

export type ModelSelectProps = {
  // The selected catalog model id (generatorStore.modelId); null before a pick
  selectedId: string | null
  // Commit a chosen model id (generatorStore.setModel — switching type resets
  // duration per the store's normalization)
  onSelect: (modelId: string) => void
  // Trigger surface: 'sheet' = opaque steel field (GeneratorPanel), 'glass' =
  // translucent field for the composer's frosted capsule. The PANEL is opaque
  // in both — only the resting trigger fill changes.
  variant?: 'sheet' | 'glass'
}

// Chevron affordance (decorative — rotates when open)
function Chevron({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-mist-dim transition-transform duration-200 ${
        isOpen ? 'rotate-180' : ''
      }`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

const TRIGGER_SURFACE = {
  sheet: 'bg-steel hover:bg-ridge',
  glass: 'bg-white/5 hover:bg-white/10',
} as const

export function ModelSelect({ selectedId, onSelect, variant = 'sheet' }: ModelSelectProps) {
  const { t } = useTranslation()
  const catalog = useCatalog()
  const label = t('generator.model.label')

  // Split into the two rendered groups; `flat` is the nav order (images first)
  const models = catalog.data?.models ?? []
  const imageModels = models.filter((model) => model.type === 'image')
  const videoModels = models.filter((model) => model.type === 'video')
  const flat: CatalogModel[] = [...imageModels, ...videoModels]

  // The listbox brain (open/active/keyboard/placement). Destructured so each
  // value is a plain local — the refs are used ONLY as ref props below.
  const {
    isOpen,
    activeIndex,
    placement,
    triggerRef,
    listboxRef,
    listboxId,
    optionId,
    activeDescendant,
    toggle,
    selectAt,
    activate,
    handleListboxKeyDown,
  } = useModelListbox({ models: flat, selectedId, onSelect })

  // 1 — Loading: a trigger-shaped skeleton so data lands without a jump
  if (catalog.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <span aria-hidden="true" className="text-xs text-mist-dim">
          {label}
        </span>
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    )
  }

  // 2 — Error: a calm inline retry (never raw server text, never red-primary)
  if (catalog.isError) {
    return (
      <div className="flex flex-col gap-2">
        <span aria-hidden="true" className="text-xs text-mist-dim">
          {label}
        </span>
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-steel px-3 py-2.5"
        >
          <span className="text-xs text-mist-dim">{t('errors.loadFailed')}</span>
          <button
            type="button"
            onClick={() => void catalog.refetch()}
            className="min-h-8 rounded-full border border-white/10 bg-specimen-amber/20 px-3 text-xs font-medium text-lumen-amber shadow-pill transition-colors duration-200 hover:bg-specimen-amber/35 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    )
  }

  // 3 — Empty: a disabled placeholder (rare — a catalog with no models)
  if (models.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <span aria-hidden="true" className="text-xs text-mist-dim">
          {label}
        </span>
        <button
          type="button"
          disabled
          className="flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-steel px-3 py-2.5 text-left opacity-50"
        >
          <span className="text-sm text-mist-dim">{t('generator.model.placeholder')}</span>
        </button>
      </div>
    )
  }

  // 4 — Data
  const selected = models.find((model) => model.id === selectedId)
  const groups = [
    { type: 'image' as const, labelKey: 'generator.model.groupImage', models: imageModels },
    { type: 'video' as const, labelKey: 'generator.model.groupVideo', models: videoModels },
  ].filter((group) => group.models.length > 0)

  // Enter transition is pure CSS via @starting-style (Tailwind `starting:`): the
  // panel fades/slides in on mount with no state or effect (which would trip the
  // "setState in effect" rule and add render churn). Slide direction follows the
  // open placement.
  const panelMotion =
    placement === 'up'
      ? 'starting:translate-y-1 starting:opacity-0'
      : 'starting:-translate-y-1 starting:opacity-0'

  return (
    <div className="flex flex-col gap-2">
      <span aria-hidden="true" className="text-xs text-mist-dim">
        {label}
      </span>

      {/* `relative` anchors the absolutely-positioned panel */}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          onClick={toggle}
          className={`flex w-full items-center gap-2.5 rounded-lg border border-white/10 px-3 py-2 text-left transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${TRIGGER_SURFACE[variant]}`}
        >
          {selected ? (
            <>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-steel text-mist">
                <ProviderMark provider={presentationFor(selected.id).provider} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">
                  {selected.name}
                </span>
                <span className="block truncate text-xs text-mist-dim">
                  {selected.providerLabel}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium text-mist">
                {t('generator.model.creditsShort', { credits: tariffFor(selected).credits })}
              </span>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm text-mist-dim">
              {t('generator.model.placeholder')}
            </span>
          )}
          <Chevron isOpen={isOpen} />
        </button>

        {isOpen ? (
          <div
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            aria-label={label}
            aria-activedescendant={activeDescendant}
            tabIndex={-1}
            onKeyDown={handleListboxKeyDown}
            className={`absolute left-0 z-40 max-h-[22rem] translate-y-0 overflow-y-auto rounded-lg border border-white/10 bg-steel p-1.5 opacity-100 transition duration-150 focus:outline-none motion-reduce:transition-none ${
              variant === 'glass' ? 'w-[22rem] max-w-[calc(100vw-2rem)]' : 'w-full'
            } ${placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'} ${panelMotion}`}
          >
            {groups.map((group) => (
              <div key={group.type} role="group" aria-label={t(group.labelKey)}>
                <span
                  aria-hidden="true"
                  className="block px-2.5 pt-2 pb-1 text-xs lowercase text-mist-dim"
                >
                  {t(group.labelKey)}
                </span>
                {group.models.map((model) => {
                  const index = flat.findIndex((candidate) => candidate.id === model.id)
                  return (
                    <ModelSelectOption
                      key={model.id}
                      model={model}
                      optionId={optionId(model.id)}
                      isSelected={model.id === selectedId}
                      isActive={index === activeIndex}
                      onChoose={() => selectAt(index)}
                      onActivate={() => activate(index)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
