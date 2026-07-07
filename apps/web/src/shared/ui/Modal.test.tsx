// apps/web/src/shared/ui/Modal.test.tsx
// Behavior (review finding, 2026-07-07): the modal is a real focus TRAP —
// Tab from the last focusable wraps to the first, Shift+Tab from the first
// wraps to the last, focus can never leave the dialog while it is open;
// Escape closes it and focus returns to the trigger that opened it. The trap
// is dependency-free (document keydown + focusable enumeration), so these
// tests drive it purely through keyboard behavior.
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from './Modal'
// i18n init — the close button renders a localized aria-label
import 'shared/config/i18n'

// Minimal owner component: a trigger button that opens the modal with two
// focusable actions inside — the anatomy every real consumer has
// (TransactionsList retry rows, the gallery delete confirmation pills).
function ModalOwner() {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open dialog
      </button>
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Focus trap">
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </Modal>
    </>
  )
}

describe('Modal focus trap', () => {
  it('moves focus into the dialog when it opens', async () => {
    render(<ModalOwner />)
    await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveFocus()
  })

  it('Tab from the last focusable wraps to the first', async () => {
    render(<ModalOwner />)
    await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
    await screen.findByRole('dialog')
    // The dialog's focusables in DOM order: close circle → first → last
    screen.getByRole('button', { name: 'Last action' }).focus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: /close/i })).toHaveFocus()
  })

  it('Shift+Tab from the first focusable wraps to the last', async () => {
    render(<ModalOwner />)
    await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
    await screen.findByRole('dialog')
    screen.getByRole('button', { name: /close/i }).focus()
    await userEvent.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Last action' })).toHaveFocus()
  })

  it('keeps cycling inside the dialog — the page behind never receives focus', async () => {
    render(<ModalOwner />)
    await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
    const dialog = await screen.findByRole('dialog')
    // One full lap plus one: 4 tabs across 3 focusables must stay trapped
    await userEvent.tab()
    await userEvent.tab()
    await userEvent.tab()
    await userEvent.tab()
    const active = document.activeElement
    expect(active instanceof HTMLElement && dialog.contains(active)).toBe(true)
    expect(screen.getByRole('button', { name: 'Open dialog' })).not.toHaveFocus()
  })

  it('Escape closes the dialog and restores focus to the trigger', async () => {
    render(<ModalOwner />)
    const trigger = screen.getByRole('button', { name: 'Open dialog' })
    await userEvent.click(trigger)
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
