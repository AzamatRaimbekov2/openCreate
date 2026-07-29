// Behavior tests for GenerationPanel: all 4 mandatory UI states render, the
// retry action fires, and the success readout shows the comparison metrics.
// i18n init is required because ErrorState renders the localized retry label.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import 'shared/config/i18n'
import { GenerationPanel } from './GenerationPanel'

const noop = () => undefined

describe('GenerationPanel', () => {
  it('renders the model name and channel', () => {
    render(
      <GenerationPanel
        label="Qwen Image Max"
        channel="DeepInfra · USD"
        result={{ status: 'empty' }}
        elapsedSeconds={0}
        onRetry={noop}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Qwen Image Max' })).toBeInTheDocument()
    expect(screen.getByText('DeepInfra · USD')).toBeInTheDocument()
  })

  it('empty state shows the ready placeholder', () => {
    render(
      <GenerationPanel
        label="FLUX dev"
        channel="Runware · credits"
        result={{ status: 'empty' }}
        elapsedSeconds={0}
        onRetry={noop}
      />,
    )
    expect(screen.getByText(/ready to generate/i)).toBeInTheDocument()
  })

  it('loading state shows the stopwatch against the 120s cap', () => {
    render(
      <GenerationPanel
        label="FLUX dev"
        channel="Runware · credits"
        result={{ status: 'loading' }}
        elapsedSeconds={45}
        onRetry={noop}
      />,
    )
    expect(screen.getByText('45s / 120s')).toBeInTheDocument()
  })

  it('error state shows the message and retry fires ONLY this panel', async () => {
    const onRetry = vi.fn()
    render(
      <GenerationPanel
        label="Nano Banana Pro"
        channel="Runware · credits"
        result={{ status: 'error', error: 'Rate limited' }}
        elapsedSeconds={0}
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Rate limited')
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('success state shows the image with duration and cost readout', () => {
    render(
      <GenerationPanel
        label="Qwen Image Max"
        channel="DeepInfra · USD"
        result={{
          status: 'success',
          imageUrl: 'data:image/png;base64,AAAA',
          durationMs: 8321,
          costLabel: '$0.075',
        }}
        elapsedSeconds={0}
        onRetry={noop}
      />,
    )
    expect(screen.getByRole('img', { name: /qwen image max result/i })).toHaveAttribute(
      'src',
      'data:image/png;base64,AAAA',
    )
    expect(screen.getByText('8.3s')).toBeInTheDocument()
    expect(screen.getByText('$0.075')).toBeInTheDocument()
  })

  it('success state hides the cost chip when no figure exists', () => {
    render(
      <GenerationPanel
        label="FLUX dev"
        channel="Runware · credits"
        result={{ status: 'success', imageUrl: 'https://img.test/x.png', durationMs: 2000 }}
        elapsedSeconds={0}
        onRetry={noop}
      />,
    )
    expect(screen.getByText('2.0s')).toBeInTheDocument()
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
  })
})
