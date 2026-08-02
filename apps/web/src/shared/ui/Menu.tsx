// apps/web/src/shared/ui/Menu.tsx
// The kit's action menu: a trigger you supply, a popup of labelled, icon-led
// items. Distinct from Select — a Select CHOOSES a value and keeps it; a Menu
// FIRES an action and forgets. Conflating them is how "delete" ends up looking
// like a selected option.
//
// Keyboard contract per WAI-ARIA menu button: Arrow keys move, Enter/Space
// activate, Escape closes and restores focus, Tab closes and leaves. Roving
// focus (not aria-activedescendant) because menu items are individually
// focusable buttons, unlike listbox options.
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export type MenuItem = {
  // Stable id — also the React key (never the index)
  id: string
  label: string
  // Leading glyph, drawn at 16px in currentColor
  icon?: ReactNode
  // 'danger' paints the row in the destructive red accent
  variant?: 'default' | 'danger'
  // Fired on click / Enter / Space. The menu closes first, so a handler that
  // opens a dialog does not fight the menu for focus.
  onSelect: () => void
  // Hidden entirely when false — an action that cannot apply to this item
  // (e.g. Download on a failed generation) must not appear disabled and
  // mysterious; it must not appear.
  isAvailable?: boolean
}

export type MenuProps = {
  // Accessible name for both the trigger and the popup
  label: string
  items: MenuItem[]
  // The trigger's visible content (an icon, usually)
  children: ReactNode
  // Which horizontal edge the popup aligns to
  align?: 'start' | 'end'
  // Extra classes for the trigger button
  triggerClassName?: string
  // Native hover tooltip on the trigger. For an ICON-ONLY trigger this is not
  // decoration: `label` gives AT the name, but a sighted pointer user has only
  // the glyph — the tooltip is where "what does this do, and what is it set to
  // right now" gets said. Omit it when the trigger already carries visible text.
  title?: string
}

export function Menu({
  label,
  items,
  children,
  align = 'end',
  triggerClassName = '',
  title,
}: MenuProps) {
  const baseId = useId()
  const menuId = `${baseId}-menu`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  // Unavailable actions are removed, not disabled — see MenuItem.isAvailable
  const visible = items.filter((item) => item.isAvailable !== false)

  const close = (restoreFocus: boolean) => {
    setIsOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  const choose = (index: number) => {
    const item = visible[index]
    if (!item) return
    // Close BEFORE firing: the handler may open a dialog, and Modal captures
    // document.activeElement to restore later. If the menu were still open,
    // that capture would point at a button about to unmount.
    close(false)
    item.onSelect()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((index) => (index + 1) % visible.length)
        return
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((index) => (index - 1 + visible.length) % visible.length)
        return
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        return
      case 'End':
        event.preventDefault()
        setActiveIndex(visible.length - 1)
        return
      case 'Escape':
        event.preventDefault()
        close(true)
        return
      case 'Tab':
        close(false)
        return
      default:
    }
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (isOpen) return
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setActiveIndex(0)
      setIsOpen(true)
    }
  }

  // Roving focus: the active item owns the DOM focus while the menu is open
  useEffect(() => {
    if (!isOpen) return
    const el = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[activeIndex]
    el?.focus()
  }, [isOpen, activeIndex])

  // Pointer down outside closes (no focus restore — the user is already elsewhere)
  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setIsOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [isOpen])

  if (visible.length === 0) return null

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={label}
        // aria-label names it for AT; title is the POINTER half of the same
        // sentence. Both, never one — an icon trigger with only aria-label is
        // silent to everyone using a mouse.
        title={title}
        onClick={() => {
          setActiveIndex(0)
          setIsOpen((prev) => !prev)
        }}
        onKeyDown={handleTriggerKeyDown}
        className={triggerClassName}
      >
        {children}
      </button>

      {isOpen ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={handleKeyDown}
          // Opaque steel panel with a real shadow: this floats over user media,
          // where a translucent surface would make the labels unreadable.
          // Capped + internally scrollable at the kit's Select height: a menu of
          // ACTIONS is always short, but the same popup now backs value lists the
          // user can grow without limit (their own styles), and an uncapped panel
          // would run past the bottom of whatever scroll container holds it.
          className={`absolute top-full z-40 mt-1.5 max-h-[22rem] min-w-44 overflow-y-auto rounded-lg border border-white/10 bg-steel p-1.5 shadow-2xl shadow-black/50 ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
        >
          {visible.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => choose(index)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${
                item.variant === 'danger'
                  ? 'text-glow-red hover:bg-ridge'
                  : 'text-mist hover:bg-ridge hover:text-white'
              }`}
            >
              {item.icon ? <span className="grid size-4 shrink-0 place-items-center">{item.icon}</span> : null}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
