// apps/web/src/modules/Cinema/components/PresetPickers.tsx
// The shot's LOOK controls, in two registers.
//
// FRAMING · MOTION · QUALITY stay labelled Selects over the shared contract
// tables — the SAME tables the server composes from, so a picker and the
// composition can never disagree (ADR §3).
//
// STYLE and the per-shot ASPECT RATIO are ICON CHIPS with tooltips (owner
// request 2026-08-02: «два контрола иконками, с тултипами понятными чтобы было
// понятно что они делают»). They are the two the user reaches for constantly,
// and a labelled Select spends a whole grid cell saying what one glyph plus a
// hover can say. The chip-dropdown shape is design.md §13.3 — the current value
// is CHECKED in the popup, and because the trigger carries no text the tooltip
// says both what the control does and what it is currently set to.
//
// WHY ASPECT LIVES HERE, in a file named for prompt presets: it is not a preset
// axis (it never reaches `promptPreset`; it is a generation param resolved in
// composeShotClipInput). But it IS part of the shot's look, and the owner asked
// for the two chips as one pair, side by side. Keeping them together beats
// splitting one control into the parent for taxonomic purity. The prop is
// separate from `value`/`onChange` precisely so the preset draft stays exactly
// the four preset axes.
//
// STYLE IS NOT AN ENUM. Since ADR style-studio D5 it is a registry entry:
// builtin rows and the styles the user wrote in the Style Studio arrive together
// from GET /api/styles. Cinema must not import modules/Styles, so the list
// travels as a PROP from the route — the same seam this editor already uses for
// the model catalog, templates and the cast.
import { useTranslation } from 'react-i18next'
import type {
  AspectRatio,
  CameraMotion,
  CameraShot,
  Quality,
  Style,
} from '@opencreate/contracts'
import { aspectRatioSchema } from '@opencreate/contracts'
import { Menu, Select } from 'shared/ui'
import {
  cameraMotionOptions,
  cameraShotOptions,
  qualityOptions,
  styleOptions,
} from '../model/presetOptions'
import type { PresetDraft, StyleChoice } from '../model/presetOptions'
import { FrameIcon, PaletteIcon } from './icons'

export type PresetPickersProps = {
  value: PresetDraft
  // Partial patch so a picker only reports the axis it changed
  onChange: (patch: Partial<PresetDraft>) => void
  // The style registry (builtin + the caller's own), injected from the route.
  // Empty while the request is in flight — styleOptions then falls back to the
  // bundled builtins, so the picker is never empty and never disabled.
  styles: readonly Style[]
  // This shot's own generation shape. null = NO OPINION: the clip generates at
  // the film's aspect (or the nearest the model supports), which is what every
  // shot did before this control existed.
  aspectRatio: AspectRatio | null
  onAspectRatioChange: (aspectRatio: AspectRatio | null) => void
}

// The icon chips wear the composer toolbar's chip scale and its amber "this is
// set" tint — the same visual grammar as the cast / voice / audio toggles a few
// pixels below them, so the drawer does not invent a second control language.
const CHIP =
  'grid size-8 shrink-0 place-items-center rounded-full border border-white/10 transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none'
const CHIP_OFF = 'text-mist-dim hover:bg-ridge hover:text-white'
const CHIP_ON = 'bg-specimen-amber/20 text-lumen-amber'

export function PresetPickers({
  value,
  onChange,
  styles,
  aspectRatio,
  onAspectRatioChange,
}: PresetPickersProps) {
  const { t } = useTranslation()

  // The '' sentinel is prepended here, with translated copy: styleId — unlike
  // the other three axes — has no first-class 'none' in its own vocabulary.
  const styleRows = [
    { value: '' as StyleChoice, label: t('cinema.settings.styleNone') },
    ...styleOptions(styles, t),
  ]

  return (
    <div className="flex flex-col gap-2">
      {/* The two icon chips: what this shot LOOKS like, and what SHAPE it is
            generated in. Both are chip-dropdowns (design.md §13.3). */}
      <div className="flex items-center gap-2">
        <Menu
          label={t('cinema.inspector.style')}
          title={t('cinema.inspector.styleHint')}
          align="start"
          items={styleRows.map((row) => ({
            id: row.value || 'none',
            label: row.label,
            // Leading check on the active row, with a same-size spacer on the
            // rest so the labels stay aligned — a dropdown that hides which
            // option is active is a failed pattern (design.md §13.3).
            icon:
              row.value === value.styleId ? (
                <CheckIcon className="size-4 text-glow-amber" />
              ) : (
                <span className="size-4" />
              ),
            onSelect: () => onChange({ styleId: row.value }),
          }))}
          triggerClassName={`${CHIP} ${value.styleId ? CHIP_ON : CHIP_OFF}`}
        >
          <PaletteIcon />
        </Menu>

        <Menu
          label={t('cinema.inspector.aspect')}
          // Icon-only trigger → the tooltip is the only place the current value
          // is spelled out, so it carries the explanation AND the live value.
          title={`${t('cinema.inspector.aspectHint')} — ${
            aspectRatio ?? t('cinema.inspector.aspectAuto')
          }`}
          align="start"
          items={[
            // The "no opinion" row comes FIRST and is a real choice, not an
            // absence: picking it clears an override back to the film canvas.
            { id: 'auto', ratio: null, label: t('cinema.inspector.aspectAuto') },
            ...aspectRatioSchema.options.map((option) => ({
              id: option,
              ratio: option,
              label: option,
            })),
          ].map((row) => ({
            id: row.id,
            label: row.label,
            icon:
              row.ratio === aspectRatio ? (
                <CheckIcon className="size-4 text-glow-amber" />
              ) : (
                <span className="size-4" />
              ),
            onSelect: () => onAspectRatioChange(row.ratio),
          }))}
          // Amber only when this shot OVERRIDES the film — the tint means "this
          // clip deviates", which is the one state worth spotting at a glance.
          triggerClassName={`${CHIP} ${aspectRatio ? CHIP_ON : CHIP_OFF}`}
        >
          <FrameIcon ratio={aspectRatio} />
        </Menu>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Select<CameraShot>
          label={t('cinema.inspector.camera')}
          options={cameraShotOptions(t)}
          value={value.cameraShot}
          onChange={(cameraShot) => onChange({ cameraShot })}
        />
        <Select<CameraMotion>
          label={t('cinema.inspector.motion')}
          options={cameraMotionOptions(t)}
          value={value.cameraMotion}
          onChange={(cameraMotion) => onChange({ cameraMotion })}
        />
        <Select<Quality>
          label={t('cinema.inspector.quality')}
          options={qualityOptions(t)}
          value={value.quality}
          onChange={(quality) => onChange({ quality })}
        />
      </div>
    </div>
  )
}

// The selected-value check for both chip popups. Local twin of the header's
// AspectChip glyph — the two surfaces are in different modules and neither owns
// the other's icon set.
function CheckIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}
