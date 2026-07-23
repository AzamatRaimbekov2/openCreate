// apps/web/src/modules/Cinema/model/shotFailureToast.test.tsx
// When a shot's polled clip flips to `failed`, the studio raises a toast — the
// attention-grabber that the quiet inline ShotClipStatus line cannot be. Two
// load-bearing behaviours: a content_blocked failure gets RICH, correct Russian
// copy plus a "soften and retry" action, and any single generation raises the
// toast EXACTLY ONCE (a re-render with the same failed row must not spam).
import { render, screen } from '@testing-library/react'
import type { ApiErrorCode, Generation } from '@opencreate/contracts'
import { Toaster, useToastStore } from 'shared/ui'
import i18n from 'shared/config/i18n'
import { __resetShotFailureDedup, useShotFailureToast } from './shotFailureToast'

function Harness({
  generation,
  onSoften,
}: {
  generation: Generation | undefined
  onSoften?: () => Promise<void>
}) {
  useShotFailureToast({ generation, onSoften })
  return null
}

function failed(errorCode: ApiErrorCode): Generation {
  return {
    id: `gen-${errorCode}`,
    type: 'video',
    mode: 'text',
    status: 'failed',
    prompt: 'a violent scene',
    modelId: 'wan-2-2',
    params: {},
    costCredits: 20,
    mediaUrls: [],
    errorMessage: 'raw provider text',
    errorCode,
    createdAt: '2026-07-20T10:00:00.000Z',
    completedAt: null,
  }
}

beforeEach(() => {
  useToastStore.getState().clear()
  __resetShotFailureDedup()
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('useShotFailureToast', () => {
  it('fires one content_blocked toast with rich RU copy and a soften action', async () => {
    await i18n.changeLanguage('ru')
    const onSoften = vi.fn(() => Promise.resolve())
    render(
      <>
        <Harness generation={failed('content_blocked')} onSoften={onSoften} />
        <Toaster />
      </>,
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/фильтр безопасности/i)
    // The rich copy names what is blocked and how to fix it — not the generic line
    expect(alert).toHaveTextContent(/переформулируйте мягче/i)
    expect(screen.getByRole('button', { name: /смягчить и повторить/i })).toBeInTheDocument()
    // Never raw provider text
    expect(alert).not.toHaveTextContent('raw provider text')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('raises the toast only once for the same failed generation', async () => {
    const gen = failed('content_blocked')
    const { rerender } = render(
      <>
        <Harness generation={gen} />
        <Toaster />
      </>,
    )
    await screen.findByRole('alert')
    // A fresh object with the SAME id (what a re-poll / re-render yields)
    rerender(
      <>
        <Harness generation={{ ...gen }} />
        <Toaster />
      </>,
    )
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('surfaces a non-content_blocked failure with the mapped code message and no action', async () => {
    render(
      <>
        <Harness generation={failed('provider_error')} />
        <Toaster />
      </>,
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not be generated/i)
    expect(alert).toHaveTextContent(/provider could not finish/i)
    expect(screen.queryByRole('button', { name: /soften|смягчить/i })).not.toBeInTheDocument()
  })

  it('stays silent while the clip is still processing', () => {
    render(
      <>
        <Harness generation={{ ...failed('provider_error'), status: 'processing' }} />
        <Toaster />
      </>,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
