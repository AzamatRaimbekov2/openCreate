// apps/web/src/shared/ui/MentionAutocomplete.tsx
// The INLINE "@" mention popup: typing "@" in a composer opens this list of
// taggable items (each shown with its picture thumbnail and name), filtered by
// what follows the "@". Selecting one lets the composer splice an opaque token
// into the prompt. Purely presentational: caret math lives in
// shared/libs/mentionQuery.ts; open/close + keyboard nav live in the composer
// that renders this; this component only renders the options and reports intent.
//
// LIVES IN shared/ui (moved out of Generator 2026-07-24): the Cinema shot
// composer grew the same inline "@" picker, and modules may not import each
// other. Strings arrive as PROPS (label/emptyText) — the kit owns no locale
// keys — and the ANCHOR arrives as className so each composer places the popup
// where its own layout needs it (the /create dock opens upward from a one-line
// row; the Cinema composer parks it over its tall prompt plate's bottom edge).
//
// STEEL_SURFACE (opaque), not glass, so names stay readable over whatever
// media sits behind the popup.
import { STEEL_SURFACE } from './surfaces'

export type MentionItem = { id: string; name: string; imageUrl?: string | null }

export type MentionAutocompleteProps = {
  // Items matching the current "@query" (already filtered by the composer).
  items: MentionItem[]
  // Keyboard-highlighted row (arrow keys move it; Enter selects it).
  activeIndex: number
  // Accessible name of the listbox — the composer's own localized copy.
  label: string
  // The "no matches" row — localized by the composer too.
  emptyText: string
  // Positioning classes: where the popup anchors relative to its `relative`
  // parent. Defaults to the /create arrangement (opens UPWARD off a bottom dock).
  className?: string
  // Tag the item: the composer registers the mention + splices the token.
  onSelect: (id: string) => void
  // Keep the keyboard highlight in sync when the mouse hovers a row.
  onHover: (index: number) => void
}

export function MentionAutocomplete({
  items,
  activeIndex,
  label,
  emptyText,
  className = 'absolute bottom-full left-0 z-20 mb-2',
  onSelect,
  onHover,
}: MentionAutocompleteProps) {
  return (
    <div
      role="listbox"
      aria-label={label}
      className={`${className} max-h-64 w-72 overflow-auto rounded-2xl border border-white/10 p-1 ${STEEL_SURFACE}`}
    >
      {items.length === 0 ? (
        <p className="px-3 py-2 text-xs text-mist-dim">{emptyText}</p>
      ) : (
        items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            // onMouseDown + preventDefault (NOT onClick): selecting must not blur
            // the textarea first, or the caret we splice into is already gone.
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect(item.id)
            }}
            onMouseEnter={() => onHover(index)}
            className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm transition-colors duration-150 ${
              index === activeIndex ? 'bg-white/10 text-white' : 'text-mist hover:bg-white/5'
            }`}
          >
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5 text-xs text-mist-dim">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" className="size-full object-cover" />
              ) : (
                item.name.slice(0, 1).toUpperCase()
              )}
            </span>
            <span className="truncate">{item.name}</span>
          </button>
        ))
      )}
    </div>
  )
}
