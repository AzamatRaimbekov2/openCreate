// The chat input. What is pinned here:
//   * the ENHANCE SPARKLE is present (owner law: every prompt field has it);
//   * Enter sends, Shift+Enter breaks the line (the chat contract);
//   * a draft below the contract's 2-char floor cannot be sent;
//   * the input closes while a turn runs, and while a plan awaits an answer the
//     composer says the plan card is the next action — a blank disabled box is
//     the most confusing thing a chat can show;
//   * a FAILED send keeps the user's words; a successful one clears them.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CreatorComposer } from './CreatorComposer'
import type { CreatorComposerProps } from './CreatorComposer'
import 'shared/config/i18n'

function renderComposer(props: Partial<CreatorComposerProps> = {}) {
  const onSend = props.onSend ?? vi.fn().mockResolvedValue(undefined)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <CreatorComposer sessionStatus={null} isSending={false} {...props} onSend={onSend} />
    </QueryClientProvider>,
  )
  return { onSend, input: screen.getByRole('textbox', { name: /task for the agent/i }) }
}

describe('CreatorComposer', () => {
  it('carries the enhance sparkle — mandatory on every prompt field', () => {
    renderComposer()
    expect(screen.getByRole('button', { name: /enhance/i })).toBeInTheDocument()
  })

  it('sends on Enter', async () => {
    const { onSend, input } = renderComposer()
    await userEvent.type(input, 'собери холст с лисом{Enter}')
    expect(onSend).toHaveBeenCalledWith('собери холст с лисом')
  })

  it('breaks the line on Shift+Enter instead of sending', async () => {
    const { onSend, input } = renderComposer()
    await userEvent.type(input, 'первая строка{Shift>}{Enter}{/Shift}вторая')
    expect(onSend).not.toHaveBeenCalled()
    expect(input).toHaveValue('первая строка\nвторая')
  })

  it('refuses a draft below the contract’s 2-character floor', async () => {
    const { onSend, input } = renderComposer()
    await userEvent.type(input, 'a')
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
    await userEvent.type(input, '{Enter}')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('clears the draft once the send lands', async () => {
    const { input } = renderComposer()
    await userEvent.type(input, 'нарисуй лиса{Enter}')
    expect(input).toHaveValue('')
  })

  it('keeps the user’s words when the send fails', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('offline'))
    const { input } = renderComposer({ onSend })
    await userEvent.type(input, 'нарисуй лиса{Enter}')
    expect(input).toHaveValue('нарисуй лиса')
  })

  it('closes while a turn is running, and says why', async () => {
    const { onSend, input } = renderComposer({ sessionStatus: 'running' })
    expect(input).toBeDisabled()
    expect(screen.getByText(/agent is working/i)).toBeInTheDocument()
    await userEvent.type(input, 'ещё{Enter}')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('points at the plan card while a budget awaits confirmation', () => {
    renderComposer({ sessionStatus: 'awaiting_confirm' })
    expect(screen.getByRole('textbox', { name: /task for the agent/i })).toBeDisabled()
    expect(screen.getByText(/confirm the budget above/i)).toBeInTheDocument()
  })

  it('reopens on a failed session so the user can retry by asking again', () => {
    renderComposer({ sessionStatus: 'failed' })
    expect(screen.getByRole('textbox', { name: /task for the agent/i })).toBeEnabled()
  })
})
