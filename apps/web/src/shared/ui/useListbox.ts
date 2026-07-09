// apps/web/src/shared/ui/useListbox.ts
// Headless keyboard/focus/placement brain of the kit's Select listbox. It owns
// open state, the active (highlighted) index and the popup placement, and hands
// back the handlers + ARIA ids the view binds.
//
// WHY THIS EXISTS AT ALL — i.e. why not a native <select>:
// a native <option> renders TEXT ONLY. It cannot carry a provider logo, a tier
// chip, a price and a description line. Once ONE control in the app needs that,
// every other dropdown either matches it or reads as a different species. So we
// re-implement the WAI-ARIA listbox keyboard contract, once, here.
//
// Generalized from the Generator's useModelListbox: the brain never knew what a
// "model" was — only a flat list of values and their typeahead labels. Passing
// those two arrays instead of CatalogModel[] is the entire generalization.
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

// Whether the panel drops below the trigger or flips above it (the composer sits
// at the bottom of the viewport, so its selects must open upward).
export type ListboxPlacement = 'down' | 'up'

type UseListboxArgs = {
  // Option values in RENDER order — the active index maps straight into this
  // flat list, so it MUST match the order the view paints (groups flattened).
  values: string[]
  // Parallel array of typeahead labels; labels[i] describes values[i]
  labels: string[]
  value: string
  onChange: (value: string) => void
}

// Rough panel height used to decide up/down flip before the panel has rendered
const PANEL_ESTIMATE_PX = 360
// Typeahead buffer resets after this idle gap (WAI-ARIA typeahead convention)
const TYPEAHEAD_RESET_MS = 500

function computePlacement(el: HTMLButtonElement | null): ListboxPlacement {
  if (!el) return 'down'
  const rect = el.getBoundingClientRect()
  const below = window.innerHeight - rect.bottom
  // Flip up only when there is genuinely more room above than below
  if (below < PANEL_ESTIMATE_PX && rect.top > below) return 'up'
  return 'down'
}

export function useListbox({ values, labels, value, onChange }: UseListboxArgs) {
  const baseId = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const listboxRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [placement, setPlacement] = useState<ListboxPlacement>('down')

  // Typeahead accumulation lives in refs so each keystroke doesn't re-render
  const typeaheadBuffer = useRef('')
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const listboxId = `${baseId}-listbox`
  // Values can contain characters that are illegal in a DOM id fragment used by
  // getElementById-free lookups; index keeps the id opaque and always valid.
  const optionId = (index: number) => `${baseId}-opt-${index}`
  // Never let a stale/missing selection produce a negative index
  const selectedIndex = Math.max(0, values.indexOf(value))

  const open = () => {
    setPlacement(computePlacement(triggerRef.current))
    // Open with the current selection pre-highlighted, per the listbox pattern
    setActiveIndex(selectedIndex)
    setIsOpen(true)
  }
  const close = (restoreFocus = false) => {
    setIsOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }
  const toggle = () => (isOpen ? close() : open())

  const selectAt = (index: number) => {
    const next = values[index]
    if (next === undefined) return
    onChange(next)
    // Choosing returns focus to the trigger so the user lands back where they
    // opened the menu (keyboard-friendly, matches the APG listbox pattern)
    close(true)
  }

  const runTypeahead = (char: string) => {
    if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current)
    typeaheadBuffer.current += char.toLowerCase()
    const buffer = typeaheadBuffer.current
    const match = labels.findIndex((label) => label.toLowerCase().startsWith(buffer))
    if (match >= 0) setActiveIndex(match)
    typeaheadTimer.current = setTimeout(() => {
      typeaheadBuffer.current = ''
    }, TYPEAHEAD_RESET_MS)
  }

  const handleListboxKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((index) => Math.min(index + 1, values.length - 1))
        return
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((index) => Math.max(index - 1, 0))
        return
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        return
      case 'End':
        event.preventDefault()
        setActiveIndex(values.length - 1)
        return
      case 'Enter':
      case ' ':
        event.preventDefault()
        selectAt(activeIndex)
        return
      case 'Escape':
        event.preventDefault()
        close(true)
        return
      case 'Tab':
        // Let focus leave naturally, but don't leave an orphaned open panel
        close(false)
        return
      default:
        // Printable single characters drive typeahead (ignore shortcut combos)
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          runTypeahead(event.key)
        }
    }
  }

  // The trigger must also answer the keyboard: ArrowDown/Up/Enter/Space open the
  // panel. Without this a keyboard user can focus the trigger and press Down to
  // nothing — the single most common custom-select bug.
  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (isOpen) return
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      open()
    }
  }

  // Move focus into the listbox when it opens so arrow keys work immediately
  useEffect(() => {
    if (isOpen) listboxRef.current?.focus()
  }, [isOpen])

  // Keep the active option visible. scrollIntoView is optional-chained: jsdom
  // (tests) does not implement it, and we must not throw there.
  useEffect(() => {
    if (!isOpen) return
    document.getElementById(`${baseId}-opt-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [isOpen, activeIndex, baseId])

  // Pointer down outside the trigger/panel closes (no focus restore — the user
  // is already interacting elsewhere)
  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (listboxRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setIsOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [isOpen])

  // Clear any pending typeahead timer on unmount
  useEffect(
    () => () => {
      if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current)
    },
    [],
  )

  const activeDescendant = isOpen ? optionId(activeIndex) : undefined

  return {
    isOpen,
    activeIndex,
    placement,
    triggerRef,
    listboxRef,
    listboxId,
    optionId,
    activeDescendant,
    open,
    close,
    toggle,
    selectAt,
    // Hover highlights the same active row keyboard nav uses
    activate: setActiveIndex,
    handleListboxKeyDown,
    handleTriggerKeyDown,
  } as const
}
