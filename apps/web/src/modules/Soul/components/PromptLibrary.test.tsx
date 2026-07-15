// apps/web/src/modules/Soul/components/PromptLibrary.test.tsx
// The owner asked for a list of ready prompts you can COPY. The ADR shipped each
// one as a Soul literal instead of a string, which buys a second affordance for
// free — "open in constructor". Both have to actually work, or the structure was
// kept for nothing.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PROMPT_LIBRARY } from '@opencreate/contracts'
import { PromptLibrary } from './PromptLibrary'
import 'shared/config/i18n'

describe('PromptLibrary', () => {
  it('lists every ready-made character with its composed prompt', () => {
    render(<PromptLibrary onOpen={vi.fn()} />)
    for (const entry of PROMPT_LIBRARY) {
      expect(screen.getByText(entry.label)).toBeInTheDocument()
    }
    // The text shown is the COMPOSED prompt (from the contract tables), not a
    // stored blob — the iron captain's iron arm is in it
    expect(screen.getByText(/riveted iron prosthetic/i)).toBeInTheDocument()
  })

  it('copies the composed prompt to the clipboard', async () => {
    const user = userEvent.setup()
    render(<PromptLibrary onOpen={vi.fn()} />)

    const [copy] = screen.getAllByRole('button', { name: /^copy$/i })
    await user.click(copy as HTMLElement)

    const clipboard = await navigator.clipboard.readText()
    expect(clipboard).toContain('a man')
    expect(clipboard).toContain('character reference sheet')
  })

  it('hands the whole SOUL back to the constructor, not a string', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<PromptLibrary onOpen={onOpen} />)

    const [open] = screen.getAllByRole('button', { name: /open in constructor/i })
    await user.click(open as HTMLElement)

    const first = PROMPT_LIBRARY[0]
    expect(onOpen).toHaveBeenCalledWith(first?.soul, first?.label)
  })
})
