// apps/web/src/modules/Generator/hooks/useModelListbox.ts
// Headless keyboard/focus/placement brain of the custom ModelSelect listbox.
// It owns the open state, the active (highlighted) option index, and the popup
// placement, and returns the handlers + ARIA ids the view binds. Kept separate
// from the render so the listbox behaviour is testable and ModelSelect stays a
// thin presentation layer under the 200-line cap.
//
// WHY a custom listbox instead of a native <select>: a native <option> renders
// TEXT ONLY — it cannot carry a provider logo, a tier chip, a tariff and a
// description line. That capability is the whole point of this control, so we
// re-implement the WAI-ARIA listbox keyboard contract here.
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { CatalogModel } from '@opencreate/contracts'

// Whether the panel drops below the trigger or flips above it (composer sits at
// the bottom of the viewport, so it must open upward).
export type ListboxPlacement = 'down' | 'up'

type UseModelListboxArgs = {
  // Models in RENDER order (images first, then videos) — the active index maps
  // straight into this flat list, so it must match what the view paints.
  models: CatalogModel[]
  selectedId: string | null
  onSelect: (modelId: string) => void
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

export function useModelListbox({ models, selectedId, onSelect }: UseModelListboxArgs) {
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
  const optionId = (modelId: string) => `${baseId}-opt-${modelId}`
  // Never let a stale/missing selection produce a negative index
  const selectedIndex = Math.max(
    0,
    models.findIndex((model) => model.id === selectedId),
  )

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
    const model = models[index]
    if (!model) return
    onSelect(model.id)
    // Choosing returns focus to the trigger so the user lands back where they
    // opened the menu (keyboard-friendly, matches the APG listbox pattern)
    close(true)
  }

  const runTypeahead = (char: string) => {
    if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current)
    typeaheadBuffer.current += char.toLowerCase()
    const buffer = typeaheadBuffer.current
    const match = models.findIndex((model) => model.name.toLowerCase().startsWith(buffer))
    if (match >= 0) setActiveIndex(match)
    typeaheadTimer.current = setTimeout(() => {
      typeaheadBuffer.current = ''
    }, TYPEAHEAD_RESET_MS)
  }

  const handleListboxKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((index) => Math.min(index + 1, models.length - 1))
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
        setActiveIndex(models.length - 1)
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

  // Move focus into the listbox when it opens so arrow keys work immediately
  useEffect(() => {
    if (isOpen) listboxRef.current?.focus()
  }, [isOpen])

  // Keep the active option visible. scrollIntoView is optional-chained: jsdom
  // (tests) does not implement it, and we must not throw there.
  const activeModelId = models[activeIndex]?.id
  useEffect(() => {
    if (!isOpen || !activeModelId) return
    document.getElementById(`${baseId}-opt-${activeModelId}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [isOpen, activeModelId, baseId])

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

  const activeDescendant = isOpen ? optionId(models[activeIndex]?.id ?? '') : undefined

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
  } as const
}
