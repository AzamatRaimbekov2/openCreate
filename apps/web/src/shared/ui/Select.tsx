// apps/web/src/shared/ui/Select.tsx
// The kit's ONE dropdown. A WAI-ARIA listbox (not a native <select>) whose rows
// can carry an icon, a title, a badge, a secondary line, a description and a
// right-aligned meta value — because the model picker needs all six, and a app
// where one dropdown is rich and the rest are OS widgets reads as two products.
//
// Everything is optional except value+label, so the cheap cases stay cheap:
//   <Select label="Type" options={[{value:'image', label:'Image'}]} … />
// renders exactly a plain, tidy list. Nothing to configure away.
//
// SURFACES: the trigger follows `variant` (steel on solid backgrounds, a
// translucent fill inside the composer's glass capsule). The PANEL is opaque
// steel in both cases — a popup must stay readable over ANY backdrop, including
// frosted glass with media moving behind it. That asymmetry is deliberate.
import { useId } from 'react'
import type { ReactNode } from 'react'
import { useListbox } from './useListbox'

export type SelectOption<T extends string> = {
  // Wire value; '' is conventionally the "any / unset" sentinel
  value: T
  // Primary text. Also the typeahead key — what the user types to jump here.
  label: string
  // Quiet second line under the label (e.g. the honest provider label)
  caption?: string
  // A full description line — the row grows to fit it
  description?: string
  // Right-aligned value: a price, a resolution, a count
  meta?: string
  // A short chip beside the label (e.g. a model tier)
  badge?: string
  // Leading visual, drawn in a 36px tile (e.g. a provider logo mark)
  icon?: ReactNode
}

export type SelectProps<T extends string> = {
  // Visible caption above the control (also the listbox's accessible name)
  label: string
  options: SelectOption<T>[]
  value: T
  onChange: (value: T) => void
  // 'glass' = translucent trigger, for use inside the frosted capsule
  variant?: 'solid' | 'glass'
  // Shown on the trigger when `value` matches no option
  placeholder?: string
  // Optional grouping: renders a labelled group per entry, in THIS order. The
  // flat render order (and therefore keyboard order) follows the groups.
  groups?: { label: string; values: T[] }[]
  // Let the panel be wider than the trigger — a rich row needs room even when
  // the control itself is a narrow rail chip
  panelWidth?: 'trigger' | 'wide'
  // Keep the caption in the accessibility tree but off the screen — for a dense
  // data grid whose column header already names the field. Same rule as Input's:
  // the label still exists and still names the control, it just is not repeated
  // in every cell. The caption stays aria-labelledby'd, so a screen reader still
  // hears "Setting, Tokyo at night" rather than only the value.
  labelHidden?: boolean
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
      className={`size-4 shrink-0 text-mist-dim transition-transform duration-200 ${
        isOpen ? 'rotate-180' : ''
      }`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

// Selected rows are marked by a CHECK as well as the amber ring: a ring is a
// colour+shape cue that a low-vision user may still miss at a glance in a long
// list, and aria-selected only speaks to assistive tech.
function CheckMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4 shrink-0 text-glow-amber"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

const TRIGGER_SURFACE = {
  solid: 'bg-steel hover:bg-ridge',
  glass: 'bg-white/5 hover:bg-white/10',
} as const

// Flatten to render order: grouped options first (in group order), then any
// option no group claimed — losing an option to a typo in `groups` would be a
// silent, unfindable bug.
function flatten<T extends string>(options: SelectOption<T>[], groups: SelectProps<T>['groups']) {
  if (!groups) return { ordered: options, sections: null }
  const byValue = new Map(options.map((option) => [option.value, option]))
  const sections = groups
    .map((group) => ({
      label: group.label,
      options: group.values.map((value) => byValue.get(value)).filter((o) => o !== undefined),
    }))
    .filter((section) => section.options.length > 0)
  const claimed = new Set(sections.flatMap((s) => s.options.map((o) => o.value)))
  const orphans = options.filter((option) => !claimed.has(option.value))
  const ordered = [...sections.flatMap((s) => s.options), ...orphans]
  return { ordered, sections: orphans.length ? [...sections, { label: '', options: orphans }] : sections }
}

export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = 'solid',
  placeholder,
  groups,
  panelWidth = 'trigger',
  labelHidden = false,
}: SelectProps<T>) {
  const { ordered, sections } = flatten(options, groups)
  const captionId = useId()
  const triggerId = useId()

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
    handleTriggerKeyDown,
  } = useListbox({
    values: ordered.map((option) => option.value),
    labels: ordered.map((option) => option.label),
    value,
    onChange: (next) => onChange(next as T),
  })

  const selected = options.find((option) => option.value === value)
  // Index within `ordered` — the row components need it for id + active state
  const indexOf = (option: SelectOption<T>) =>
    ordered.findIndex((candidate) => candidate.value === option.value)

  // Enter transition is pure CSS via @starting-style (Tailwind `starting:`): no
  // state, no effect, no render churn. Slide direction follows the placement.
  const panelMotion =
    placement === 'up'
      ? 'starting:translate-y-1 starting:opacity-0'
      : 'starting:-translate-y-1 starting:opacity-0'

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {/* The caption is a real label, referenced by the trigger below. It must
          NOT be aria-hidden: a lone aria-label on the trigger would REPLACE the
          selected option's text, so a screen reader would announce "Model" and
          never say which model is chosen. aria-labelledby concatenates both. */}
      <span
        id={captionId}
        className={labelHidden ? 'sr-only' : 'truncate text-[11px] leading-none text-mist-dim'}
      >
        {label}
      </span>

      {/* `relative` anchors the absolutely-positioned panel */}
      <div className="relative">
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          // "Model, Flash" — the field name, then the current value
          aria-labelledby={`${captionId} ${triggerId}`}
          onClick={toggle}
          onKeyDown={handleTriggerKeyDown}
          className={`flex min-h-8 w-full items-center gap-2 rounded-full border border-white/10 px-2.5 text-left transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${TRIGGER_SURFACE[variant]}`}
        >
          {selected?.icon ? (
            <span className="grid size-5 shrink-0 place-items-center text-mist">
              {selected.icon}
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-xs text-mist">
            {selected ? selected.label : (placeholder ?? label)}
          </span>
          {selected?.meta ? (
            <span className="shrink-0 text-[11px] font-medium text-mist-dim">{selected.meta}</span>
          ) : null}
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
            // Opaque steel panel: readable over glass, over media, over anything
            className={`absolute left-0 z-40 max-h-[22rem] translate-y-0 overflow-y-auto rounded-lg border border-white/10 bg-steel p-1.5 opacity-100 shadow-2xl shadow-black/50 transition duration-150 focus:outline-none motion-reduce:transition-none ${
              panelWidth === 'wide' ? 'w-[22rem] max-w-[calc(100vw-2rem)]' : 'w-full min-w-44'
            } ${placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'} ${panelMotion}`}
          >
            {sections
              ? sections.map((section) => (
                  <div key={section.label} role="group" aria-label={section.label || undefined}>
                    {section.label ? (
                      <span
                        aria-hidden="true"
                        className="block px-2.5 pt-2 pb-1 text-[11px] lowercase text-mist-dim"
                      >
                        {section.label}
                      </span>
                    ) : null}
                    {section.options.map((option) => (
                      <Row
                        key={option.value}
                        option={option}
                        optionId={optionId(indexOf(option))}
                        isSelected={option.value === value}
                        isActive={indexOf(option) === activeIndex}
                        onChoose={() => selectAt(indexOf(option))}
                        onActivate={() => activate(indexOf(option))}
                      />
                    ))}
                  </div>
                ))
              : ordered.map((option, index) => (
                  <Row
                    key={option.value}
                    option={option}
                    optionId={optionId(index)}
                    isSelected={option.value === value}
                    isActive={index === activeIndex}
                    onChoose={() => selectAt(index)}
                    onActivate={() => activate(index)}
                  />
                ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

type RowProps<T extends string> = {
  option: SelectOption<T>
  // DOM id so the listbox can point aria-activedescendant at the active row
  optionId: string
  // The chosen option (amber ring + check + aria-selected)
  isSelected: boolean
  // The keyboard/hover-highlighted row (ridge surface step)
  isActive: boolean
  onChoose: () => void
  onActivate: () => void
}

// One row. role="option" + aria-selected are the listbox contract; the row is a
// div, not a button, because the LISTBOX owns keyboard focus, not each row.
function Row<T extends string>({
  option,
  optionId,
  isSelected,
  isActive,
  onChoose,
  onActivate,
}: RowProps<T>) {
  const isRich = Boolean(option.icon || option.description || option.caption)
  return (
    <div
      id={optionId}
      role="option"
      aria-selected={isSelected}
      onClick={onChoose}
      onMouseEnter={onActivate}
      className={`flex cursor-pointer gap-2.5 rounded-lg px-2.5 transition-colors duration-150 ${
        isRich ? 'items-start py-2.5' : 'items-center py-2'
      } ${isActive ? 'bg-ridge' : ''} ${isSelected ? 'ring-1 ring-glow-amber/60 ring-inset' : ''}`}
    >
      {option.icon ? (
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-steel ${
            isSelected ? 'text-glow-amber' : 'text-mist'
          }`}
        >
          {option.icon}
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-white">{option.label}</span>
          {option.badge ? (
            // Not the Badge component: this chip must not grow the row height,
            // so it borrows the accent colour at the row's own type scale
            <span className="shrink-0 rounded-full border border-white/10 px-1.5 text-[10px] leading-4 text-portal">
              {option.badge}
            </span>
          ) : null}
        </div>
        {option.caption ? <p className="truncate text-xs text-mist-dim">{option.caption}</p> : null}
        {option.description ? (
          <p className="mt-1 text-xs text-mist-dim">{option.description}</p>
        ) : null}
      </div>

      {option.meta ? (
        <span className={`shrink-0 text-xs font-medium text-mist ${isRich ? 'pt-0.5' : ''}`}>
          {option.meta}
        </span>
      ) : null}
      {/* The check reserves its slot even when unselected, so rows never shift */}
      <span className={`shrink-0 ${isRich ? 'pt-0.5' : ''}`}>
        {isSelected ? <CheckMark /> : <span aria-hidden="true" className="block size-4" />}
      </span>
    </div>
  )
}
