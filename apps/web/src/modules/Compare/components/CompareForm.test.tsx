// Behavior tests for CompareForm: controlled value flow, the disabled rules
// (empty prompt / in-flight run) and the two actions. Queries by role/label
// only — never implementation details.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CompareForm } from './CompareForm'

const noop = () => undefined

describe('CompareForm', () => {
  it('renders the prompt field and both actions', () => {
    render(
      <CompareForm
        prompt=""
        isGenerating={false}
        onPromptChange={noop}
        onGenerate={noop}
        onClear={noop}
      />,
    )
    expect(screen.getByRole('textbox', { name: /prompt/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
  })

  it('disables Generate when the prompt is blank', () => {
    render(
      <CompareForm
        prompt="   "
        isGenerating={false}
        onPromptChange={noop}
        onGenerate={noop}
        onClear={noop}
      />,
    )
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled()
  })

  it('reports typed text through onPromptChange (controlled)', async () => {
    const onPromptChange = vi.fn()
    render(
      <CompareForm
        prompt=""
        isGenerating={false}
        onPromptChange={onPromptChange}
        onGenerate={noop}
        onClear={noop}
      />,
    )
    await userEvent.type(screen.getByRole('textbox', { name: /prompt/i }), 'a')
    expect(onPromptChange).toHaveBeenCalledWith('a')
  })

  it('fires onGenerate for a filled prompt', async () => {
    const onGenerate = vi.fn()
    render(
      <CompareForm
        prompt="a cat"
        isGenerating={false}
        onPromptChange={noop}
        onGenerate={onGenerate}
        onClear={noop}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /generate/i }))
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })

  it('disables both actions while generating', () => {
    render(
      <CompareForm
        prompt="a cat"
        isGenerating
        onPromptChange={noop}
        onGenerate={noop}
        onClear={noop}
      />,
    )
    // Button's isLoading doubles as disabled — double submits are impossible
    expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /clear/i })).toBeDisabled()
  })

  it('fires onClear', async () => {
    const onClear = vi.fn()
    render(
      <CompareForm
        prompt="a cat"
        isGenerating={false}
        onPromptChange={noop}
        onGenerate={noop}
        onClear={onClear}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
