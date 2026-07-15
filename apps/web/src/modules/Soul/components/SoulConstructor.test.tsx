// apps/web/src/modules/Soul/components/SoulConstructor.test.tsx
// Behaviour of the constructor, and specifically the two things a user can get
// silently robbed by: a trait cap that does not visibly refuse (the 7th trait is
// paid for and never rendered) and a prompt preview that does not track the
// pickers (the user reads text the model will never see).
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SoulConstructor } from './SoulConstructor'
import { EMPTY_DRAFT } from '../model/soulDraft'
import type { SoulDraft } from '../model/soulDraft'
import 'shared/config/i18n'

// The constructor is CONTROLLED (the studio owns the draft, so the prompt library
// can open an entry into it). The harness plays that owner.
function Harness({ onSubmit = vi.fn() }: { onSubmit?: () => void }) {
  const [draft, setDraft] = useState<SoulDraft>(EMPTY_DRAFT)
  return (
    <SoulConstructor
      draft={draft}
      onChange={setDraft}
      onSubmit={onSubmit}
      submitLabel="Create character"
      isSubmitting={false}
    />
  )
}

describe('SoulConstructor', () => {
  it('disables the seventh trait and says why', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    // Six is the cap (MAX_TRAITS) — pick exactly six
    for (const label of ['Рога', 'Хвост', 'Клыки', 'Когти', 'Крылья', 'Жабры']) {
      await user.click(screen.getByRole('button', { name: label }))
    }

    // The seventh is refused, visibly
    expect(screen.getByRole('button', { name: 'Третий глаз' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(/6/)

    // …and a picked trait can still be released, or the user would be stuck
    expect(screen.getByRole('button', { name: 'Рога' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Рога' }))
    expect(screen.getByRole('button', { name: 'Третий глаз' })).toBeEnabled()
  })

  it('recomposes the prompt preview when a picker changes', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const preview = screen.getByTestId('soul-preview')
    // The default archetype is female — the composed subject says so
    expect(preview).toHaveTextContent('a woman')

    await user.click(screen.getByRole('button', { name: 'Мужчина' }))
    expect(screen.getByTestId('soul-preview')).toHaveTextContent('a man')

    // A trait joins the same composed text (fragments come from contracts,
    // never from this component)
    await user.click(screen.getByRole('button', { name: 'Железная рука' }))
    expect(screen.getByTestId('soul-preview')).toHaveTextContent('riveted iron prosthetic')
  })

  it('shows the reference-sheet framing that makes the portrait readable', () => {
    render(<Harness />)
    // The preview is what the SERVER will submit — including the framing preset
    expect(screen.getByTestId('soul-preview')).toHaveTextContent('character reference sheet')
  })

  it('refuses to submit a nameless character', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    const submit = screen.getByRole('button', { name: 'Create character' })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText(/name/i), 'Аня')
    expect(submit).toBeEnabled()
    await user.click(submit)
    expect(onSubmit).toHaveBeenCalledOnce()
  })
})
