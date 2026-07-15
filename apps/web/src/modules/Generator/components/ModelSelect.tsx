// apps/web/src/modules/Generator/components/ModelSelect.tsx
// The model picker: every catalog model with its provider logo, tier chip,
// tariff (credits + the $0.01/credit equivalent) and a localized description,
// grouped into Images / Video.
//
// It is now a THIN WRAPPER over shared/ui Select. Everything that used to live
// here — the listbox keyboard contract, placement flip, typeahead, the option
// row — moved into the kit, because the owner's rule is that EVERY select looks
// and behaves like this one. What stays here is the only part genuinely about
// models: owning the catalog query, its four UI states, and translating a
// CatalogModel into a SelectOption.
//
// (The deleted useModelListbox + ModelSelectOption were exactly this code with
// `CatalogModel` hard-coded into it.)
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { CatalogModel } from '@opencreate/contracts'
import { Select, Skeleton } from 'shared/ui'
import type { SelectOption } from 'shared/ui'
import { useCatalog } from '../model/catalogApi'
import { presentationFor, tariffFor } from 'shared/libs/modelPresentation'
import { ProviderMark } from 'shared/ui'

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
  // When true, list ONLY models that can condition on a tagged entity
  // (catalog.referenceMode). Set by the composer while a mention is live — a
  // model that ignores the reference would bill the user for a stranger.
  referenceCapableOnly?: boolean
}

// The label wrapper the loading/error/empty states share, so the control's
// height and caption never jump between states
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span aria-hidden="true" className="truncate text-[11px] leading-none text-mist-dim">
        {label}
      </span>
      {children}
    </div>
  )
}

export function ModelSelect({ selectedId, onSelect, variant = 'sheet', referenceCapableOnly = false }: ModelSelectProps) {
  const { t } = useTranslation()
  const catalog = useCatalog()
  const label = t('generator.model.label')

  // 1 — Loading: a trigger-shaped skeleton so data lands without a jump
  if (catalog.isPending) {
    return (
      <Field label={label}>
        <Skeleton className="h-8 w-full rounded-full" />
      </Field>
    )
  }

  // 2 — Error: a calm inline retry (never raw server text, never red-primary)
  if (catalog.isError) {
    return (
      <Field label={label}>
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-steel px-3 py-2"
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
      </Field>
    )
  }

  // Filtering here (not in the parent) keeps ModelSelect the single owner of the
  // catalog: the composer only flips a boolean, it never handles the model list.
  const models = referenceCapableOnly
    ? catalog.data.models.filter((model) => model.referenceMode)
    : catalog.data.models

  // 3 — Empty: a disabled placeholder (rare — a catalog with no models)
  if (models.length === 0) {
    return (
      <Field label={label}>
        <button
          type="button"
          disabled
          className="flex min-h-8 w-full items-center rounded-full border border-white/10 bg-steel px-2.5 text-left text-xs text-mist-dim opacity-50"
        >
          {t('generator.model.placeholder')}
        </button>
      </Field>
    )
  }

  // 4 — Data. A CatalogModel becomes a rich SelectOption; the kit draws it.
  const toOption = (model: CatalogModel): SelectOption<string> => {
    const { provider, descriptionKey } = presentationFor(model.id)
    const tariff = tariffFor(model)
    return {
      value: model.id,
      label: model.name,
      // Honest provider attribution — users see what actually runs (no rebadging)
      caption: model.providerLabel,
      description: t(descriptionKey),
      badge: t(`generator.tier.${model.tier}`),
      meta: t('generator.model.tariff', { credits: tariff.credits, dollars: tariff.dollars }),
      icon: <ProviderMark provider={provider} className="size-5" />,
    }
  }

  const idsOf = (type: CatalogModel['type']) =>
    models.filter((model) => model.type === type).map((model) => model.id)

  return (
    <Select
      label={label}
      variant={variant === 'sheet' ? 'solid' : 'glass'}
      // Rich rows need room even when the trigger is a narrow rail chip
      panelWidth="wide"
      placeholder={t('generator.model.placeholder')}
      options={models.map(toOption)}
      groups={[
        { label: t('generator.model.groupImage'), values: idsOf('image') },
        { label: t('generator.model.groupVideo'), values: idsOf('video') },
      ]}
      value={selectedId ?? ''}
      onChange={onSelect}
    />
  )
}
